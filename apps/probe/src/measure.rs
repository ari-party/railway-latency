use std::collections::HashMap;
use std::sync::{ Arc, Mutex };
use std::time::{ Duration, Instant };

use http_body_util::{ BodyExt, Empty };
use hyper::body::Bytes;
use hyper::header::{ HeaderMap, HOST };
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

#[derive(Clone, Copy)]
struct Observed<'a> {
  dns: &'a Mutex<Option<f64>>,
  handshake: &'a Mutex<Option<f64>>,
}

fn millis_since(start: Instant) -> f64 {
  start.elapsed().as_secs_f64() * 1000.0
}

fn fail<T, E: std::error::Error>(
  result: Result<T, E>,
  what: &str
) -> Result<T, Box<HttpOutcome>> {
  result.map_err(|_| {
    Box::new(HttpOutcome {
      timing: None,
      error: Some(what.to_string()),
      capture: None,
    })
  })
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

async fn round_trip<S>(
  stream: S,
  host: &str,
  dst: &str,
  scheme: &str,
  dns_done: Instant,
  capture_hikari: bool,
  observed: Observed<'_>
) -> Result<(HttpTiming, Option<ResponseCapture>), Box<HttpOutcome>>
  where S: AsyncRead + AsyncWrite + Unpin + Send + 'static
{
  let connect_ready = Instant::now();
  let handshake_ms = (connect_ready - dns_done).as_secs_f64() * 1000.0;
  *observed.handshake.lock().unwrap() = Some(handshake_ms);

  let dns_ms = observed.dns.lock().unwrap().unwrap_or(0.0);

  let (mut sender, conn) = fail(
    hyper::client::conn::http1::handshake(TokioIo::new(stream)).await,
    "http handshake failed"
  )?;

  tokio::spawn(async move {
    let _ = conn.await;
  });

  let mut req_builder = hyper::Request::builder().uri("/").header(HOST, host);
  if capture_hikari {
    req_builder = req_builder.header("X-Railway-Debug", "1");
  }
  let req = fail(req_builder.body(Empty::<Bytes>::new()), "request build failed")?;

  let res = fail(sender.send_request(req).await, "request send failed")?;

  let status = res.status();
  let version = res.version();
  let response_ms = millis_since(connect_ready);
  let request_id = opt_header(res.headers(), "x-railway-request-id").map(
    str::to_string
  );

  let routing = if capture_hikari {
    Routing {
      railway_edge: opt_header(res.headers(), "x-railway-upstream-zone").map(
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

  let expected_edge = format!("railway/{}", dst);
  let region_mismatch =
    capture_hikari &&
    opt_header(res.headers(), "x-railway-upstream-zone").is_some_and(
      |edge| edge != expected_edge
    );

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
  let status_code = status.as_u16();
  let is_error = !(200..300).contains(&status_code);
  let headers = if is_error {
    captured_headers(res.headers())
  } else {
    HashMap::new()
  };

  let body = res
    .into_body()
    .collect().await
    .map(|c| c.to_bytes());
  let request_ms = millis_since(connect_ready);

  let response_capture = {
    let (body_text, body_truncated) = match &body {
      Ok(bytes) if is_error => capture_body(bytes, CAPTURE_BODY_BYTES),
      _ => (String::new(), false),
    };
    ResponseCapture {
      status: status_code,
      headers,
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
    return Err(
      Box::new(HttpOutcome {
        timing: Some(HttpTiming {
          request_ms,
          handshake_ms: Some(handshake_ms),
          routing,
        }),
        error: Some(format!("status {}", status.as_u16())),
        capture: Some(response_capture),
      })
    );
  }

  if status.as_u16() >= 400 {
    return Err(
      Box::new(HttpOutcome {
        timing: None,
        error: Some(format!("status {}", status.as_u16())),
        capture: Some(response_capture),
      })
    );
  }

  if body.is_err() {
    return Err(
      Box::new(HttpOutcome {
        timing: Some(HttpTiming {
          request_ms,
          handshake_ms: Some(handshake_ms),
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
      routing,
    },
    Some(response_capture),
  ))
}

async fn request(
  tls: Option<&Arc<ClientConfig>>,
  host: &str,
  dst: &str,
  port: u16,
  capture_hikari: bool,
  observed: Observed<'_>
) -> Result<(HttpTiming, Option<ResponseCapture>), Box<HttpOutcome>> {
  let dns_start = Instant::now();
  let mut addrs = fail(lookup_host((host, port)).await, "dns lookup failed")?;
  let addr = match addrs.find(|address| address.is_ipv4()) {
    Some(addr) => addr,
    None =>
      return Err(
        Box::new(HttpOutcome {
          timing: None,
          error: Some("no addresses resolved".to_string()),
          capture: None,
        })
      ),
  };
  let dns_done = Instant::now();
  *observed.dns.lock().unwrap() = Some(
    (dns_done - dns_start).as_secs_f64() * 1000.0
  );

  let tcp = fail(TcpStream::connect(addr).await, "tcp connect failed")?;
  tcp.set_nodelay(true).ok();

  let stream = match tls {
    Some(config) => {
      let server_name = fail(
        ServerName::try_from(host.to_string()),
        "invalid tls server name"
      )?;
      let tls_stream = fail(
        TlsConnector::from(config.clone()).connect(server_name, tcp).await,
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
    dst,
    scheme,
    dns_done,
    capture_hikari,
    observed
  ).await
}

pub async fn measure_http(
  tls: Option<&Arc<ClientConfig>>,
  host: &str,
  port: u16,
  capture_hikari: bool,
  timeout: Duration,
  dst: &str
) -> (Option<f64>, HttpOutcome) {
  let handshake = Mutex::new(None);
  let dns = Mutex::new(None);
  let observed = Observed { dns: &dns, handshake: &handshake };
  let result = tokio::time::timeout(
    timeout,
    request(tls, host, dst, port, capture_hikari, observed)
  ).await;

  let dns_ms = *dns.lock().unwrap();

  let outcome = match result {
    Ok(Ok((timing, capture))) =>
      HttpOutcome { timing: Some(timing), error: None, capture },
    Ok(Err(outcome)) => *outcome,
    Err(_) => {
      let ms = timeout.as_secs_f64() * 1000.0;
      let handshake_ms = *handshake.lock().unwrap();

      HttpOutcome {
        timing: Some(HttpTiming {
          request_ms: ms,
          handshake_ms: Some(handshake_ms.unwrap_or(ms)),
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
