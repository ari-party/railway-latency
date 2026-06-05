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

use crate::log;

pub struct HttpTiming {
  pub request_ms: f64,
  pub handshake_ms: Option<f64>,
  pub hikari: Option<bool>,
}

pub struct DebugTarget {
  pub src: String,
  pub dst: String,
  pub kind: &'static str,
}

fn millis_since(start: Instant) -> f64 {
  start.elapsed().as_secs_f64() * 1000.0
}

fn log_drop<T, E: Display>(
  result: Result<T, E>,
  host: &str,
  what: &str
) -> Option<T> {
  match result {
    Ok(value) => Some(value),
    Err(err) => {
      log::error(
        serde_json::json!({
          "event": "drop",
          "host": host,
          "reason": what,
          "error": err.to_string(),
        })
      );
      None
    }
  }
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
  handshake_ms: f64,
  response_ms: f64,
  headers: &HeaderMap
) {
  log::emit(
    serde_json::json!({
      "event": "debug",
      "src": target.src,
      "dst": target.dst,
      "type": target.kind,
      "status": status,
      "handshakeMs": handshake_ms,
      "responseMs": response_ms,
      "x-hikari-trace": opt_header(headers, "x-hikari-trace"),
      "x-railway-edge": opt_header(headers, "x-railway-edge"),
      "cf-ray": opt_header(headers, "cf-ray"),
      "x-railway-request-id": opt_header(headers, "x-railway-request-id"),
    })
  );
}

async fn round_trip<S>(
  stream: S,
  host: &str,
  dns_done: Instant,
  capture_hikari: bool,
  timeout: Duration,
  debug: Option<&DebugTarget>,
  handshake_out: &Mutex<Option<f64>>
) -> Option<HttpTiming>
  where S: AsyncRead + AsyncWrite + Unpin + Send + 'static
{
  let connect_ready = Instant::now();
  let handshake_ms = (connect_ready - dns_done).as_secs_f64() * 1000.0;

  // Publish the handshake so a later timeout can report the observed value
  // rather than the full timeout.
  *handshake_out.lock().unwrap() = Some(handshake_ms);

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

  if let Some(target) = debug {
    log_debug(
      target,
      status.as_u16(),
      handshake_ms,
      response_ms,
      res.headers()
    );
  }

  if status.as_u16() == 502 {
    return Some(HttpTiming {
      request_ms: timeout.as_secs_f64() * 1000.0,
      handshake_ms: Some(handshake_ms),
      hikari: None,
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
    return None;
  }

  let hikari = if capture_hikari { detect_hikari(res.headers()) } else { None };

  log_drop(res.into_body().collect().await, host, "response body read failed")?;
  let request_ms = millis_since(connect_ready);

  Some(HttpTiming {
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
  debug: Option<&DebugTarget>,
  handshake_out: &Mutex<Option<f64>>
) -> Option<HttpTiming> {
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
      return None;
    }
  };
  let dns_done = Instant::now();

  let tcp = log_drop(
    TcpStream::connect(addr).await,
    host,
    "tcp connect failed"
  )?;
  tcp.set_nodelay(true).ok();

  match tls {
    Some(config) => {
      let server_name = log_drop(
        ServerName::try_from(host.to_string()),
        host,
        "invalid tls server name"
      )?;
      let stream = log_drop(
        TlsConnector::from(config.clone()).connect(server_name, tcp).await,
        host,
        "tls handshake failed"
      )?;

      round_trip(
        stream,
        host,
        dns_done,
        capture_hikari,
        timeout,
        debug,
        handshake_out
      ).await
    }
    None => {
      round_trip(
        tcp,
        host,
        dns_done,
        capture_hikari,
        timeout,
        debug,
        handshake_out
      ).await
    }
  }
}

pub async fn measure_http(
  tls: Option<&Arc<ClientConfig>>,
  host: &str,
  port: u16,
  capture_hikari: bool,
  timeout: Duration,
  debug: Option<&DebugTarget>
) -> Option<HttpTiming> {
  let handshake = Mutex::new(None);
  let result = tokio::time::timeout(
    timeout,
    request(tls, host, port, capture_hikari, timeout, debug, &handshake)
  ).await;

  match result {
    Ok(timing) => timing,
    Err(_) => {
      let ms = timeout.as_secs_f64() * 1000.0;
      let handshake_ms = *handshake.lock().unwrap();

      if let Some(target) = debug {
        log::emit(
          serde_json::json!({
            "event": "debug",
            "src": target.src,
            "dst": target.dst,
            "type": target.kind,
            "timedOut": true,
            "handshakeMs": handshake_ms,
            "responseMs": ms,
          })
        );
      }

      Some(HttpTiming {
        request_ms: ms,
        handshake_ms: Some(handshake_ms.unwrap_or(ms)),
        hikari: None,
      })
    }
  }
}

pub async fn measure_dns(host: &str, timeout: Duration) -> Option<f64> {
  let start = Instant::now();

  match tokio::time::timeout(timeout, lookup_host((host, 0u16))).await {
    Ok(Ok(_)) => Some(millis_since(start)),
    Ok(Err(err)) => {
      log::error(
        serde_json::json!({
          "event": "drop",
          "host": host,
          "reason": "dns lookup failed",
          "error": err.to_string(),
        })
      );
      None
    }
    Err(_) => Some(timeout.as_secs_f64() * 1000.0),
  }
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
