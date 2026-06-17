use std::collections::HashMap;
use std::sync::{ Arc, Mutex };
use std::time::{ Duration, Instant, SystemTime, UNIX_EPOCH };

use http_body_util::{ BodyExt, Empty };
use hyper::body::Bytes;
use hyper::header::{ HeaderMap, HOST, SERVER };
use hyper_util::rt::TokioIo;
use rustls::ClientConfig;
use rustls_pki_types::ServerName;
use tokio::io::{ AsyncRead, AsyncWrite };
use tokio::net::{ lookup_host, TcpStream };
use tokio_rustls::TlsConnector;
use tokio_util::either::Either;

use crate::dump;

#[derive(Debug, Clone, Default)]
pub struct Routing {
  pub railway_edge: Option<String>,
  pub cf_pop: Option<String>,
  pub hikari_pop: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ResponseCapture {
  pub status: u16,
  pub headers: HashMap<String, String>,
  pub body: String,
  pub body_truncated: bool,
  pub request_id: Option<String>,
  pub handshake_ms: Option<f64>,
  pub request_ms: f64,
  pub routing: Routing,
}

pub struct HttpTiming {
  pub request_ms: f64,
  pub handshake_ms: Option<f64>,
  pub hikari: Option<bool>,
  pub routing: Routing,
}

fn capture_body(bytes: &[u8], cap: usize) -> (String, bool) {
  let end = bytes.len().min(cap);
  let body = String::from_utf8_lossy(&bytes[..end]).into_owned();
  (body, bytes.len() > end)
}

fn captured_headers(headers: &HeaderMap) -> HashMap<String, String> {
  headers
    .iter()
    .filter_map(|(name, value)|
      value
        .to_str()
        .ok()
        .map(|v| (name.as_str().to_string(), v.to_string()))
    )
    .collect()
}

pub struct HttpOutcome {
  pub timing: Option<HttpTiming>,
  pub error: Option<String>,
  pub capture: Option<ResponseCapture>,
}

const SLOW_MS: f64 = 1000.0;
const DUMP_BODY_BYTES: usize = 64 * 1024;
const CAPTURE_BODY_BYTES: usize = 16 * 1024;

macro_rules! event_at_level {
  (
    $warn:expr,
    $($field:tt)*
  ) => {
    if $warn {
      tracing::warn!($($field)*);
    } else {
      tracing::debug!($($field)*);
    }
  };
}

macro_rules! diagnostic_event {
  (
    $warn:expr,
    $event:literal,
    $target:ident,
    $timing:ident,
    $status:ident,
    $headers:ident $(
      ,
      $($extra:tt)*
    )?
  ) => {
    event_at_level!(
      $warn,
      event = $event,
      src = %$target.src,
      dst = %$target.dst,
      r#type = $target.kind,
      status = $status,
      dnsMs = $timing.dns_ms,
      handshakeMs = $timing.handshake_ms,
      responseMs = $timing.response_ms,
      originMs = $timing.origin_ms,
      cfTtfbMs = $timing.cf_ttfb_ms,
      cfEdgeMs = $timing.cf_edge_ms,
      "x-hikari-trace" = opt_header($headers, "x-hikari-trace"),
      "x-railway-edge" = opt_header($headers, "x-railway-edge"),
      "cf-ray" = opt_header($headers, "cf-ray"),
      "x-railway-request-id" = opt_header($headers, "x-railway-request-id"),
      $($($extra)*)?
    );
  };
}

macro_rules! failure_event {
  (
    $level:ident,
    $event:literal,
    $target:expr $(
      ,
      $($extra:tt)*
    )?
  ) => {
    {
    let target = $target;
    tracing::$level!(
      event = $event,
      src = %target.src,
      dst = %target.dst,
      r#type = target.kind,
      $($($extra)*)?
    );
    }
  };
}

pub struct DebugTarget {
  pub src: String,
  pub dst: String,
  pub kind: &'static str,
  pub verbose: bool,
}

struct DebugTiming {
  dns_ms: f64,
  handshake_ms: f64,
  response_ms: f64,
  origin_ms: Option<f64>,
  cf_ttfb_ms: Option<f64>,
  cf_edge_ms: Option<f64>,
}

#[derive(Clone, Copy)]
struct Observed<'a> {
  dns: &'a Mutex<Option<f64>>,
  handshake: &'a Mutex<Option<f64>>,
}

fn millis_since(start: Instant) -> f64 {
  start.elapsed().as_secs_f64() * 1000.0
}

fn epoch_ms() -> f64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs_f64() * 1000.0)
    .unwrap_or(0.0)
}

fn error_chain(error: &dyn std::error::Error) -> String {
  let mut chain = error.to_string();
  let mut source = error.source();

  while let Some(cause) = source {
    chain.push_str(": ");
    chain.push_str(&cause.to_string());
    source = cause.source();
  }

  chain
}

fn log_drop<T, E: std::error::Error>(
  result: Result<T, E>,
  debug: &DebugTarget,
  host: &str,
  what: &str
) -> Result<T, Box<HttpOutcome>> {
  result.map_err(|error| {
    failure_event!(
      error,
      "drop",
      debug,
      host = host,
      reason = what,
      error = %error_chain(&error),
      "request dropped",
    );
    Box::new(HttpOutcome {
      timing: None,
      error: Some(what.to_string()),
      capture: None,
    })
  })
}

fn detect_hikari(headers: &HeaderMap) -> Option<bool> {
  if headers.contains_key("x-hikari-trace") {
    return Some(true);
  }

  match
    headers
      .get(SERVER)
      .and_then(|v| v.to_str().ok())
      .map(|s| s.to_lowercase())
      .as_deref()
  {
    Some("railway-hikari") => Some(true),
    Some("railway-edge") => Some(false),
    _ => None,
  }
}

fn opt_header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
  headers.get(name).and_then(|v| v.to_str().ok())
}

fn cf_pop_from_cf_ray(cf_ray: &str) -> Option<String> {
  cf_ray.rsplit_once('-').map(|(_, pop)| pop.trim().to_string())
}

fn hikari_pop_from_trace(trace: &str) -> Option<String> {
  let first = trace.split(',').next().unwrap_or("").trim();
  let code = first.split('.').next().unwrap_or("").trim();
  if code.is_empty() {
    None
  } else {
    Some(code.to_string())
  }
}

fn format_response(
  version: hyper::Version,
  status: hyper::StatusCode,
  headers: &HeaderMap
) -> String {
  use std::fmt::Write;

  let reason = status.canonical_reason().unwrap_or("");
  let mut out = format!("{version:?} {} {reason}\r\n", status.as_u16());

  for (name, value) in headers {
    let value = value.to_str().unwrap_or("<binary>");
    let _ = write!(out, "{name}: {value}\r\n");
  }

  out.push_str("\r\n");
  out
}

fn log_debug(
  target: &DebugTarget,
  timing: &DebugTiming,
  status: u16,
  headers: &HeaderMap,
  slow: bool
) {
  if slow {
    diagnostic_event!(
      true,
      "debug",
      target,
      timing,
      status,
      headers,
      "slow request"
    );
  } else {
    diagnostic_event!(false, "debug", target, timing, status, headers);
  }
}

fn log_region_mismatch(
  target: &DebugTarget,
  timing: &DebugTiming,
  status: u16,
  headers: &HeaderMap,
  expected: &str
) {
  diagnostic_event!(
    true,
    "edge_region_mismatch",
    target,
    timing,
    status,
    headers,
    expected = expected,
    "response processed by unexpected edge region"
  );
}

async fn round_trip<S>(
  stream: S,
  host: &str,
  scheme: &str,
  dns_done: Instant,
  capture_hikari: bool,
  debug: &DebugTarget,
  observed: Observed<'_>
) -> Result<(HttpTiming, Option<ResponseCapture>), Box<HttpOutcome>>
  where S: AsyncRead + AsyncWrite + Unpin + Send + 'static
{
  let connect_ready = Instant::now();
  let handshake_ms = (connect_ready - dns_done).as_secs_f64() * 1000.0;
  *observed.handshake.lock().unwrap() = Some(handshake_ms);

  let dns_ms = observed.dns.lock().unwrap().unwrap_or(0.0);

  let (mut sender, conn) = log_drop(
    hyper::client::conn::http1::handshake(TokioIo::new(stream)).await,
    debug,
    host,
    "http handshake failed"
  )?;

  tokio::spawn(async move {
    let _ = conn.await;
  });

  let req = log_drop(
    hyper::Request
      ::builder()
      .uri("/")
      .header(HOST, host)
      .body(Empty::<Bytes>::new()),
    debug,
    host,
    "request build failed"
  )?;

  let sent_ms = epoch_ms();
  let res = log_drop(
    sender.send_request(req).await,
    debug,
    host,
    "request send failed"
  )?;

  let status = res.status();
  let version = res.version();
  let response_ms = millis_since(connect_ready);
  let request_id = opt_header(res.headers(), "x-railway-request-id").map(
    str::to_string
  );

  let routing = if capture_hikari {
    Routing {
      railway_edge: opt_header(res.headers(), "x-railway-edge").map(
        str::to_string
      ),
      cf_pop: opt_header(res.headers(), "cf-ray").and_then(cf_pop_from_cf_ray),
      hikari_pop: opt_header(res.headers(), "x-hikari-trace").and_then(
        hikari_pop_from_trace
      ),
    }
  } else {
    Routing::default()
  };

  let slow =
    dns_ms > SLOW_MS || handshake_ms > SLOW_MS || response_ms > SLOW_MS;

  let expected_edge = format!("railway/{}", debug.dst);
  let region_mismatch =
    capture_hikari &&
    opt_header(res.headers(), "x-railway-edge").is_some_and(
      |edge| edge != expected_edge
    );

  if debug.verbose || slow || region_mismatch {
    let origin_ms = opt_header(res.headers(), "x-echo-received")
      .and_then(|value| value.parse::<f64>().ok())
      .map(|received| received - sent_ms);

    let cf_ttfb_ms = opt_header(res.headers(), "x-origin-ttfb").and_then(|value|
      value.parse::<f64>().ok()
    );

    let cf_edge_ms = opt_header(res.headers(), "x-edge-msec").and_then(|value|
      value.parse::<f64>().ok()
    );

    let timing = DebugTiming {
      dns_ms,
      handshake_ms,
      response_ms,
      origin_ms,
      cf_ttfb_ms,
      cf_edge_ms,
    };
    if region_mismatch {
      log_region_mismatch(
        debug,
        &timing,
        status.as_u16(),
        res.headers(),
        &expected_edge
      );
    } else {
      log_debug(debug, &timing, status.as_u16(), res.headers(), slow);
    }
  }

  let dump_kind = if status.as_u16() >= 400 {
    Some("err")
  } else if region_mismatch {
    Some("region")
  } else if slow {
    Some("slow")
  } else {
    None
  };

  let dump = dump_kind.map(|kind| {
    (
      kind,
      request_id.clone(),
      format!(
        "{scheme}://{host}/\n\n{}",
        format_response(version, status, res.headers())
      ),
    )
  });
  let hikari = if capture_hikari { detect_hikari(res.headers()) } else { None };

  let status_code = status.as_u16();
  let full_headers = if !(200..300).contains(&status_code) {
    Some(captured_headers(res.headers()))
  } else {
    None
  };

  let body = res
    .into_body()
    .collect().await
    .map(|c| c.to_bytes());
  let request_ms = millis_since(connect_ready);

  let response_capture = {
    let (body_text, body_truncated) = match (&full_headers, &body) {
      (Some(_), Ok(bytes)) => capture_body(bytes, CAPTURE_BODY_BYTES),
      _ => (String::new(), false),
    };
    ResponseCapture {
      status: status_code,
      headers: full_headers.unwrap_or_default(),
      body: body_text,
      body_truncated,
      request_id: request_id.clone(),
      handshake_ms: Some(handshake_ms),
      request_ms,
      routing: routing.clone(),
    }
  };

  if let Some((kind, request_id, mut content)) = dump {
    if let Ok(bytes) = &body {
      let end = bytes.len().min(DUMP_BODY_BYTES);
      content.push_str(&String::from_utf8_lossy(&bytes[..end]));
      if bytes.len() > end {
        content.push_str(
          &format!("\n[... {} more bytes truncated ...]", bytes.len() - end)
        );
      }
    }
    dump::record(kind, request_id.as_deref(), content);
  }

  if matches!(status.as_u16(), 502 | 522) {
    failure_event!(
      error,
      "edge_error",
      debug,
      host = host,
      status = status.as_u16(),
      request_id = request_id.as_deref(),
      "edge returned error status"
    );
    return Err(
      Box::new(HttpOutcome {
        timing: Some(HttpTiming {
          request_ms,
          handshake_ms: Some(handshake_ms),
          hikari,
          routing,
        }),
        error: Some(format!("status {}", status.as_u16())),
        capture: Some(response_capture),
      })
    );
  }

  if status.as_u16() >= 400 {
    failure_event!(
      error,
      "drop",
      debug,
      host = host,
      reason = "unexpected status",
      status = status.as_u16(),
      request_id = request_id.as_deref(),
      "request dropped on unexpected status"
    );
    return Err(
      Box::new(HttpOutcome {
        timing: None,
        error: Some(format!("status {}", status.as_u16())),
        capture: Some(response_capture),
      })
    );
  }

  if let Err(error) = body {
    failure_event!(
      warn,
      "body_read_failed",
      debug,
      host = host,
      error = %error_chain(&error),
      request_id = request_id.as_deref(),
      "response body read failed",
    );
    return Err(
      Box::new(HttpOutcome {
        timing: Some(HttpTiming {
          request_ms,
          handshake_ms: Some(handshake_ms),
          hikari,
          routing,
        }),
        error: Some("response body read failed".to_string()),
        capture: Some(response_capture),
      })
    );
  }

  Ok((
    HttpTiming {
      request_ms,
      handshake_ms: Some(handshake_ms),
      hikari,
      routing,
    },
    Some(response_capture),
  ))
}

async fn request(
  tls: Option<&Arc<ClientConfig>>,
  host: &str,
  port: u16,
  capture_hikari: bool,
  debug: &DebugTarget,
  observed: Observed<'_>
) -> Result<(HttpTiming, Option<ResponseCapture>), Box<HttpOutcome>> {
  let dns_start = Instant::now();
  let mut addrs = log_drop(
    lookup_host((host, port)).await,
    debug,
    host,
    "dns lookup failed"
  )?;
  let addr = match addrs.next() {
    Some(addr) => addr,
    None => {
      failure_event!(
        error,
        "drop",
        debug,
        host = host,
        reason = "dns lookup resolved no addresses",
        "request dropped, no addresses resolved"
      );
      return Err(
        Box::new(HttpOutcome {
          timing: None,
          error: Some("no addresses resolved".to_string()),
          capture: None,
        })
      );
    }
  };
  let dns_done = Instant::now();
  *observed.dns.lock().unwrap() = Some(
    (dns_done - dns_start).as_secs_f64() * 1000.0
  );

  let tcp = log_drop(
    TcpStream::connect(addr).await,
    debug,
    host,
    "tcp connect failed"
  )?;
  tcp.set_nodelay(true).ok();

  let stream = match tls {
    Some(config) => {
      let server_name = log_drop(
        ServerName::try_from(host.to_string()),
        debug,
        host,
        "invalid tls server name"
      )?;
      let tls_stream = log_drop(
        TlsConnector::from(config.clone()).connect(server_name, tcp).await,
        debug,
        host,
        "tls handshake failed"
      )?;
      Either::Right(tls_stream)
    }
    None => Either::Left(tcp),
  };

  let scheme = if tls.is_some() { "https" } else { "http" };
  round_trip(
    stream,
    host,
    scheme,
    dns_done,
    capture_hikari,
    debug,
    observed
  ).await
}

pub async fn measure_http(
  tls: Option<&Arc<ClientConfig>>,
  host: &str,
  port: u16,
  capture_hikari: bool,
  timeout: Duration,
  debug: &DebugTarget
) -> (Option<f64>, HttpOutcome) {
  let handshake = Mutex::new(None);
  let dns = Mutex::new(None);
  let observed = Observed { dns: &dns, handshake: &handshake };
  let result = tokio::time::timeout(
    timeout,
    request(tls, host, port, capture_hikari, debug, observed)
  ).await;

  let dns_ms = *dns.lock().unwrap();

  let outcome = match result {
    Ok(Ok((timing, capture))) =>
      HttpOutcome { timing: Some(timing), error: None, capture },
    Ok(Err(outcome)) => *outcome,
    Err(_) => {
      let ms = timeout.as_secs_f64() * 1000.0;
      let handshake_ms = *handshake.lock().unwrap();
      let slow =
        handshake_ms.is_some_and(|h| h > SLOW_MS) ||
        dns_ms.is_some_and(|d| d > SLOW_MS);

      if debug.verbose || slow {
        let target = debug;
        event_at_level!(slow,
          event = "debug",
          src = %target.src,
          dst = %target.dst,
          r#type = target.kind,
          host = host,
          timedOut = true,
          dnsMs = ?dns_ms,
          handshakeMs = ?handshake_ms,
          responseMs = ms,
        );
      }

      HttpOutcome {
        timing: Some(HttpTiming {
          request_ms: ms,
          handshake_ms: Some(handshake_ms.unwrap_or(ms)),
          hikari: None,
          routing: Routing::default(),
        }),
        error: Some("timeout".to_string()),
        capture: None,
      }
    }
  };

  (dns_ms, outcome)
}

#[cfg(test)]
mod tests {
  use hyper::header::{ HeaderMap, HeaderValue };

  use super::{
    capture_body,
    captured_headers,
    cf_pop_from_cf_ray,
    detect_hikari,
    hikari_pop_from_trace,
  };

  #[test]
  fn cf_pop_is_the_cf_ray_suffix() {
    assert_eq!(
      cf_pop_from_cf_ray("8d3f1a2b3c4d5e6f-IAD"),
      Some("IAD".to_string())
    );
  }

  #[test]
  fn cf_pop_is_none_without_a_suffix() {
    assert_eq!(cf_pop_from_cf_ray("nodash"), None);
  }

  #[test]
  fn hikari_pop_takes_first_csv_entry_before_the_dot() {
    assert_eq!(hikari_pop_from_trace("ams1.aydy"), Some("ams1".to_string()));
    assert_eq!(
      hikari_pop_from_trace("ams1.aydy, fra2.bxcz"),
      Some("ams1".to_string())
    );
  }

  #[test]
  fn hikari_pop_is_none_when_empty() {
    assert_eq!(hikari_pop_from_trace(""), None);
  }

  fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
    let mut map = HeaderMap::new();
    for (name, value) in pairs {
      map.insert(*name, HeaderValue::from_static(value));
    }
    map
  }

  #[test]
  fn hikari_trace_header_means_hikari() {
    assert_eq!(detect_hikari(&headers(&[("x-hikari-trace", "1")])), Some(true));
  }

  #[test]
  fn server_header_distinguishes_hikari_from_edge() {
    assert_eq!(
      detect_hikari(&headers(&[("server", "railway-hikari")])),
      Some(true)
    );
    assert_eq!(
      detect_hikari(&headers(&[("server", "railway-edge")])),
      Some(false)
    );
  }

  #[test]
  fn server_header_is_case_insensitive() {
    assert_eq!(
      detect_hikari(&headers(&[("server", "Railway-Hikari")])),
      Some(true)
    );
  }

  #[test]
  fn unknown_or_missing_server_is_none() {
    assert_eq!(detect_hikari(&headers(&[("server", "nginx")])), None);
    assert_eq!(detect_hikari(&HeaderMap::new()), None);
  }

  #[test]
  fn capture_body_returns_full_body_under_cap() {
    let (body, truncated) = capture_body(b"{\"error\":\"x\"}", 64);
    assert_eq!(body, "{\"error\":\"x\"}");
    assert!(!truncated);
  }

  #[test]
  fn capture_body_truncates_over_cap_and_flags_it() {
    let (body, truncated) = capture_body(b"abcdefghij", 4);
    assert_eq!(body, "abcd");
    assert!(truncated);
  }

  #[test]
  fn captured_headers_serialize_all_pairs() {
    let map = captured_headers(
      &headers(
        &[
          ("x-railway-edge", "iad"),
          ("cf-ray", "8f2-SJC"),
        ]
      )
    );
    assert_eq!(map.get("x-railway-edge").map(String::as_str), Some("iad"));
    assert_eq!(map.get("cf-ray").map(String::as_str), Some("8f2-SJC"));
  }
}
