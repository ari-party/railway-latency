use std::time::Duration;

use hyper::header::{ HeaderMap, HeaderValue };
use tokio::net::TcpListener;

use super::{
  capture_body,
  captured_headers,
  cf_pop_from_cf_ray,
  hikari_pop_from_trace,
  measure_http,
};
use crate::wire::CheckEventFailStage;

const TEST_TIMEOUT: Duration = Duration::from_secs(5);

async fn listen_locally() -> (TcpListener, u16) {
  let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
  let port = listener.local_addr().unwrap().port();
  (listener, port)
}

#[tokio::test]
async fn unresolvable_host_is_a_dns_stage_failure() {
  let (_, outcome) = measure_http(
    None,
    "probe-test.invalid",
    80,
    false,
    TEST_TIMEOUT,
    "dst"
  ).await;
  assert!(matches!(outcome.fail_stage, Some(CheckEventFailStage::Dns)));
}

#[tokio::test]
async fn refused_connection_is_a_handshake_stage_failure() {
  let (listener, port) = listen_locally().await;
  drop(listener);

  let (_, outcome) = measure_http(
    None,
    "127.0.0.1",
    port,
    false,
    TEST_TIMEOUT,
    "dst"
  ).await;
  assert_eq!(outcome.error.as_deref(), Some("tcp connect failed"));
  assert!(
    matches!(outcome.fail_stage, Some(CheckEventFailStage::Handshake))
  );
}

#[tokio::test]
async fn connection_closed_before_a_response_is_an_http_stage_failure() {
  let (listener, port) = listen_locally().await;
  tokio::spawn(async move {
    let (stream, _) = listener.accept().await.unwrap();
    drop(stream);
  });

  let (_, outcome) = measure_http(
    None,
    "127.0.0.1",
    port,
    false,
    TEST_TIMEOUT,
    "dst"
  ).await;
  assert_eq!(outcome.error.as_deref(), Some("request send failed"));
  assert!(matches!(outcome.fail_stage, Some(CheckEventFailStage::Http)));
}

#[tokio::test]
async fn timeout_is_an_http_stage_failure_at_the_full_timeout() {
  let (listener, port) = listen_locally().await;
  tokio::spawn(async move {
    let (_stream, _) = listener.accept().await.unwrap();
    std::future::pending::<()>().await;
  });

  let timeout = Duration::from_millis(200);
  let (_, outcome) = measure_http(
    None,
    "127.0.0.1",
    port,
    false,
    timeout,
    "dst"
  ).await;
  assert_eq!(outcome.error.as_deref(), Some("timeout"));
  assert!(matches!(outcome.fail_stage, Some(CheckEventFailStage::Http)));
  assert_eq!(outcome.timing.map(|timing| timing.request_ms), Some(200.0));
}

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
