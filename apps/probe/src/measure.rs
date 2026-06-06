use std::fmt::Display;
use std::sync::{ Arc, Mutex };
use std::time::{ Duration, Instant };

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

use crate::log;

pub struct HttpTiming {
  pub request_ms: f64,
  pub handshake_ms: Option<f64>,
  pub hikari: Option<bool>,
}

pub struct HttpOutcome {
  pub timing: Option<HttpTiming>,
  pub error: Option<String>,
}

const SLOW_MS: f64 = 1000.0;

pub struct DebugTarget {
  pub src: String,
  pub dst: String,
  pub kind: &'static str,
  pub verbose: bool,
}

#[derive(Clone, Copy)]
struct Observed<'a> {
  dns: &'a Mutex<Option<f64>>,
  handshake: &'a Mutex<Option<f64>>,
}

fn millis_since(start: Instant) -> f64 {
  start.elapsed().as_secs_f64() * 1000.0
}

fn log_drop<T, E: Display>(
  result: Result<T, E>,
  host: &str,
  what: &str
) -> Result<T, HttpOutcome> {
  result.map_err(|err| {
    log::error(
      serde_json::json!({
        "event": "drop",
        "host": host,
        "reason": what,
        "error": err.to_string(),
      })
    );
    HttpOutcome { timing: None, error: Some(what.to_string()) }
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

fn log_debug(
  target: &DebugTarget,
  status: u16,
  dns_ms: f64,
  handshake_ms: f64,
  response_ms: f64,
  headers: &HeaderMap,
  warn: bool
) {
  let event =
    serde_json::json!({
    "event": "debug",
    "level": if warn { "warn" } else { "debug" },
    "src": target.src,
    "dst": target.dst,
    "type": target.kind,
    "status": status,
    "dnsMs": dns_ms,
    "handshakeMs": handshake_ms,
    "responseMs": response_ms,
    "x-hikari-trace": opt_header(headers, "x-hikari-trace"),
    "x-railway-edge": opt_header(headers, "x-railway-edge"),
    "cf-ray": opt_header(headers, "cf-ray"),
    "x-railway-request-id": opt_header(headers, "x-railway-request-id"),
  });

  if warn {
    log::warn(event);
  } else {
    log::emit(event);
  }
}

async fn round_trip<S>(
  stream: S,
  host: &str,
  dns_done: Instant,
  capture_hikari: bool,
  timeout: Duration,
  debug: &DebugTarget,
  observed: Observed<'_>
) -> Result<HttpTiming, HttpOutcome>
  where S: AsyncRead + AsyncWrite + Unpin + Send + 'static
{
  let connect_ready = Instant::now();
  let handshake_ms = (connect_ready - dns_done).as_secs_f64() * 1000.0;
  *observed.handshake.lock().unwrap() = Some(handshake_ms);

  let dns_ms = observed.dns.lock().unwrap().unwrap_or(0.0);

  let (mut sender, conn) = log_drop(
    hyper::client::conn::http1::handshake(TokioIo::new(stream)).await,
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
    host,
    "request build failed"
  )?;

  let res = log_drop(
    sender.send_request(req).await,
    host,
    "request send failed"
  )?;

  let status = res.status();
  let response_ms = millis_since(connect_ready);

  let slow =
    dns_ms > SLOW_MS || handshake_ms > SLOW_MS || response_ms > SLOW_MS;
  if debug.verbose || slow {
    log_debug(
      debug,
      status.as_u16(),
      dns_ms,
      handshake_ms,
      response_ms,
      res.headers(),
      slow
    );
  }

  if matches!(status.as_u16(), 502 | 522) {
    return Err(HttpOutcome {
      timing: Some(HttpTiming {
        request_ms: timeout.as_secs_f64() * 1000.0,
        handshake_ms: Some(handshake_ms),
        hikari: None,
      }),
      error: Some(format!("status {}", status.as_u16())),
    });
  }

  if status.as_u16() >= 400 {
    log::error(
      serde_json::json!({
        "event": "drop",
        "host": host,
        "reason": "unexpected status",
        "status": status.as_u16(),
      })
    );
    return Err(HttpOutcome {
      timing: None,
      error: Some(format!("status {}", status.as_u16())),
    });
  }

  let hikari = if capture_hikari { detect_hikari(res.headers()) } else { None };

  log_drop(res.into_body().collect().await, host, "response body read failed")?;
  let request_ms = millis_since(connect_ready);

  Ok(HttpTiming {
    request_ms,
    handshake_ms: Some(handshake_ms),
    hikari,
  })
}

async fn request(
  tls: Option<&Arc<ClientConfig>>,
  host: &str,
  port: u16,
  capture_hikari: bool,
  timeout: Duration,
  debug: &DebugTarget,
  observed: Observed<'_>
) -> Result<HttpTiming, HttpOutcome> {
  let dns_start = Instant::now();
  let mut addrs = log_drop(
    lookup_host((host, port)).await,
    host,
    "dns lookup failed"
  )?;
  let addr = match addrs.next() {
    Some(addr) => addr,
    None => {
      log::error(
        serde_json::json!({
          "event": "drop",
          "host": host,
          "reason": "dns lookup resolved no addresses",
        })
      );
      return Err(HttpOutcome {
        timing: None,
        error: Some("no addresses resolved".to_string()),
      });
    }
  };
  let dns_done = Instant::now();
  *observed.dns.lock().unwrap() = Some(
    (dns_done - dns_start).as_secs_f64() * 1000.0
  );

  let tcp = log_drop(
    TcpStream::connect(addr).await,
    host,
    "tcp connect failed"
  )?;
  tcp.set_nodelay(true).ok();

  let stream = match tls {
    Some(config) => {
      let server_name = log_drop(
        ServerName::try_from(host.to_string()),
        host,
        "invalid tls server name"
      )?;
      let tls_stream = log_drop(
        TlsConnector::from(config.clone()).connect(server_name, tcp).await,
        host,
        "tls handshake failed"
      )?;
      Either::Right(tls_stream)
    }
    None => Either::Left(tcp),
  };

  round_trip(
    stream,
    host,
    dns_done,
    capture_hikari,
    timeout,
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
    request(tls, host, port, capture_hikari, timeout, debug, observed)
  ).await;

  let dns_ms = *dns.lock().unwrap();

  let outcome = match result {
    Ok(Ok(timing)) => HttpOutcome { timing: Some(timing), error: None },
    Ok(Err(outcome)) => outcome,
    Err(_) => {
      let ms = timeout.as_secs_f64() * 1000.0;
      let handshake_ms = *handshake.lock().unwrap();
      let slow =
        handshake_ms.is_some_and(|h| h > SLOW_MS) ||
        dns_ms.is_some_and(|d| d > SLOW_MS);

      if debug.verbose || slow {
        let event =
          serde_json::json!({
          "event": "debug",
          "level": if slow { "warn" } else { "debug" },
          "src": debug.src,
          "dst": debug.dst,
          "type": debug.kind,
          "timedOut": true,
          "dnsMs": dns_ms,
          "handshakeMs": handshake_ms,
          "responseMs": ms,
        });

        if slow {
          log::warn(event);
        } else {
          log::emit(event);
        }
      }

      HttpOutcome {
        timing: Some(HttpTiming {
          request_ms: ms,
          handshake_ms: Some(handshake_ms.unwrap_or(ms)),
          hikari: None,
        }),
        error: Some("timeout".to_string()),
      }
    }
  };

  (dns_ms, outcome)
}

#[cfg(test)]
mod tests {
  use hyper::header::{ HeaderMap, HeaderValue };

  use super::detect_hikari;

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
}
