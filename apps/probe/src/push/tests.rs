use crate::buffer::{ self, Batch };
use crate::wire::{
  CheckEvent,
  ErrorEvent,
  Measurement,
  Network,
  ProbeSample,
};

fn unique_temp_dir(label: &str) -> std::path::PathBuf {
  let nanos = std::time::SystemTime
    ::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_nanos();
  let directory = std::env::temp_dir().join(format!("probe-{label}-{nanos}"));
  std::fs::create_dir_all(&directory).unwrap();
  directory
}

#[test]
fn spilled_segment_is_the_ingest_batch_envelope() {
  let directory = unique_temp_dir("envelope");

  let batch = Batch {
    samples: vec![ProbeSample {
      measurement: Measurement::HttpPublic,
      dst: "europe-west4-drams3a".to_string(),
      time: 1_780_000_000_000.0,
      ms: 12.5,
      railway_edge: None,
      cf_pop: None,
      hikari_pop: None,
      mtr: Vec::new(),
    }],
    errors: vec![ErrorEvent {
      dst: "us-east4-eqdc4a".to_string(),
      network: Network::Public,
      time: 1_780_000_000_001.0,
      reason: "timeout".to_string(),
    }],
    checks: vec![CheckEvent {
      dst: "europe-west4-drams3a".to_string(),
      network: Network::Public,
      time: 1_780_000_000_000.0,
      fail_stage: None,
      reason: None,
      dns_ms: Some(2.0),
      handshake_ms: Some(38.0),
      http_ms: Some(312.0),
      http_status: Some(200.0),
      railway_edge: None,
      cf_pop: None,
      hikari_pop: None,
      request_id: None,
      headers: Default::default(),
      body: None,
      body_truncated: None,
    }],
  };

  buffer::spill(&directory, "asia-hcloud-sin1", batch).unwrap();
  let segment = buffer::oldest_segments(&directory).pop().unwrap();
  let json = String::from_utf8(segment.bytes).unwrap();

  assert!(json.contains(r#""probeId":"asia-hcloud-sin1""#));
  assert!(json.contains(r#""samples":["#));
  assert!(json.contains(r#""errors":["#));
  assert!(json.contains(r#""checks":["#));
  assert!(json.contains(r#""measurement":"httpPublic""#));
  assert!(json.contains(r#""dst":"europe-west4-drams3a""#));
  assert!(json.contains(r#""reason":"timeout""#));
  assert!(json.contains(r#""httpStatus":200"#));
  assert!(!json.contains("source"));
  assert!(!json.contains("wireVersion"));
}

#[test]
fn drain_all_to_disk_empties_a_queue_larger_than_one_batch() {
  use super::drain_all_to_disk;
  use crate::queue::Queue;

  let directory = unique_temp_dir("drain-all");
  let configuration = test_push_config(
    "http://unused/ingest".to_string(),
    directory.clone()
  );

  let samples = std::sync::Arc::new(Queue::<ProbeSample>::new("samples"));
  let errors = std::sync::Arc::new(Queue::<ErrorEvent>::new("errors"));
  let checks = std::sync::Arc::new(Queue::<CheckEvent>::new("checks"));
  let total = configuration.batch_max * 3 + 7;
  for index in 0..total {
    samples.enqueue(ProbeSample {
      measurement: Measurement::HttpPublic,
      dst: "europe-west4-drams3a".to_string(),
      time: index as f64,
      ms: 1.0,
      railway_edge: None,
      cf_pop: None,
      hikari_pop: None,
      mtr: Vec::new(),
    });
  }

  drain_all_to_disk(&configuration, &samples, &errors, &checks);

  assert!(
    samples.drain(usize::MAX).is_empty(),
    "single call drained the whole in-memory queue"
  );
  assert!(
    buffer::oldest_segments(&directory).len() >= 4,
    "spilled more than one batch to disk in one tick"
  );
}

use super::{ classify_status, post_batch, Backoff, PostError };
use crate::buffer::Segment;
use crate::config::PushConfig;
use std::path::PathBuf;
use std::time::Duration;

#[test]
fn backoff_grows_then_caps_and_resets() {
  let mut backoff = Backoff::new(
    Duration::from_secs(1),
    Duration::from_secs(60)
  );
  assert_eq!(backoff.current, Duration::from_secs(1));
  backoff.advance();
  assert_eq!(backoff.current, Duration::from_secs(2));
  backoff.advance();
  assert_eq!(backoff.current, Duration::from_secs(4));
  for _ in 0..10 {
    backoff.advance();
  }
  assert_eq!(backoff.current, Duration::from_secs(60));
  backoff.reset();
  assert_eq!(backoff.current, Duration::from_secs(1));
}

#[test]
fn status_maps_4xx_to_rejected_and_5xx_to_retry() {
  for code in [400u16, 401, 403, 422] {
    assert!(
      matches!(classify_status(code), Some(PostError::Rejected)),
      "{code} -> Rejected"
    );
  }
  for code in [500u16, 502, 503, 504, 429] {
    assert!(
      matches!(classify_status(code), Some(PostError::Retry)),
      "{code} -> Retry"
    );
  }
  assert!(classify_status(202).is_none(), "2xx -> Ok");
  assert!(classify_status(200).is_none(), "2xx -> Ok");
}

fn test_push_config(ingest_url: String, buffer_dir: PathBuf) -> PushConfig {
  PushConfig {
    probe_id: "asia-hcloud-sin1".to_string(),
    api_key: "rl_asia-hcloud-sin1_secret".to_string(),
    ingest_url,
    targets: vec!["europe-west4-drams3a".to_string()],
    interval: Duration::from_millis(50),
    batch_max: 500,
    buffer_dir,
  }
}

async fn spawn_sink(
  status: hyper::StatusCode,
  captured: std::sync::Arc<tokio::sync::Mutex<Vec<u8>>>
) -> std::net::SocketAddr {
  use http_body_util::{ BodyExt, Full };
  use hyper::body::Bytes;
  use hyper::server::conn::http1;
  use hyper::service::service_fn;
  use hyper_util::rt::TokioIo;

  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let addr = listener.local_addr().unwrap();

  tokio::spawn(async move {
    let (stream, _) = listener.accept().await.unwrap();
    let captured = captured.clone();
    let service = service_fn(
      move |request: hyper::Request<hyper::body::Incoming>| {
        let captured = captured.clone();
        async move {
          let body = request.into_body().collect().await.unwrap().to_bytes();
          *captured.lock().await = body.to_vec();
          Ok::<_, std::convert::Infallible>(
            hyper::Response
              ::builder()
              .status(status)
              .body(Full::new(Bytes::from_static(b"")))
              .unwrap()
          )
        }
      }
    );
    let _ = http1::Builder
      ::new()
      .serve_connection(TokioIo::new(stream), service).await;
  });

  addr
}

#[tokio::test]
async fn post_batch_returns_ok_on_2xx_and_sends_body_and_bearer() {
  let captured = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::new()));
  let addr = spawn_sink(hyper::StatusCode::ACCEPTED, captured.clone()).await;
  let configuration = test_push_config(
    format!("http://{addr}/ingest"),
    std::env::temp_dir()
  );
  let segment = Segment {
    path: PathBuf::from("unused.ndjson"),
    bytes: br#"{"probeId":"asia-hcloud-sin1","samples":[],"errors":[]}"#.to_vec(),
  };

  let result = post_batch(&configuration, &segment).await;
  assert!(result.is_ok());
  assert_eq!(*captured.lock().await, segment.bytes);
}

#[tokio::test]
async fn post_batch_quarantines_on_4xx() {
  let captured = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::new()));
  let addr = spawn_sink(
    hyper::StatusCode::UNPROCESSABLE_ENTITY,
    captured.clone()
  ).await;
  let configuration = test_push_config(
    format!("http://{addr}/ingest"),
    std::env::temp_dir()
  );
  let segment = Segment {
    path: PathBuf::from("unused.ndjson"),
    bytes: b"{}".to_vec(),
  };

  let result = post_batch(&configuration, &segment).await;
  assert!(matches!(result, Err(PostError::Rejected)));
}

#[tokio::test]
async fn post_batch_retries_on_503() {
  let captured = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::new()));
  let addr = spawn_sink(
    hyper::StatusCode::SERVICE_UNAVAILABLE,
    captured.clone()
  ).await;
  let configuration = test_push_config(
    format!("http://{addr}/ingest"),
    std::env::temp_dir()
  );
  let segment = Segment {
    path: PathBuf::from("unused.ndjson"),
    bytes: b"{}".to_vec(),
  };

  let result = post_batch(&configuration, &segment).await;
  assert!(matches!(result, Err(PostError::Retry)));
}

#[tokio::test]
async fn boot_replay_delivers_oldest_first_then_quarantines_poison() {
  use super::flush_segments;
  use crate::buffer::{ self, Batch };

  let directory = unique_temp_dir("replay");

  fn sample(time: f64) -> ProbeSample {
    ProbeSample {
      measurement: Measurement::HttpPublic,
      dst: "europe-west4-drams3a".to_string(),
      time,
      ms: 1.0,
      railway_edge: None,
      cf_pop: None,
      hikari_pop: None,
      mtr: Vec::new(),
    }
  }

  buffer
    ::spill(&directory, "asia-hcloud-sin1", Batch {
      samples: vec![sample(1.0)],
      errors: vec![],
      checks: vec![],
    })
    .unwrap();
  buffer
    ::spill(&directory, "asia-hcloud-sin1", Batch {
      samples: vec![sample(2.0)],
      errors: vec![],
      checks: vec![],
    })
    .unwrap();
  assert_eq!(buffer::oldest_segments(&directory).len(), 2);

  let bodies = std::sync::Arc::new(
    tokio::sync::Mutex::new(Vec::<Vec<u8>>::new())
  );
  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
  let addr = listener.local_addr().unwrap();
  let bodies_for_sink = bodies.clone();
  tokio::spawn(async move {
    use http_body_util::{ BodyExt, Full };
    use hyper::body::Bytes;
    use hyper::server::conn::http1;
    use hyper::service::service_fn;
    use hyper_util::rt::TokioIo;
    loop {
      let (stream, _) = match listener.accept().await {
        Ok(connection) => connection,
        Err(_) => {
          break;
        }
      };
      let bodies = bodies_for_sink.clone();
      tokio::spawn(async move {
        let service = service_fn(
          move |request: hyper::Request<hyper::body::Incoming>| {
            let bodies = bodies.clone();
            async move {
              let body = request
                .into_body()
                .collect().await
                .unwrap()
                .to_bytes();
              bodies.lock().await.push(body.to_vec());
              Ok::<_, std::convert::Infallible>(
                hyper::Response
                  ::builder()
                  .status(hyper::StatusCode::ACCEPTED)
                  .body(Full::new(Bytes::from_static(b"")))
                  .unwrap()
              )
            }
          }
        );
        let _ = http1::Builder
          ::new()
          .serve_connection(TokioIo::new(stream), service).await;
      });
    }
  });

  let configuration = test_push_config(
    format!("http://{addr}/ingest"),
    directory.clone()
  );
  let mut backoff = Backoff::new(
    Duration::from_secs(1),
    Duration::from_secs(60)
  );
  flush_segments(&configuration, &mut backoff).await;

  let delivered = bodies.lock().await.clone();
  assert_eq!(delivered.len(), 2);
  assert!(
    String::from_utf8(delivered[0].clone()).unwrap().contains(r#""time":1"#)
  );
  assert!(
    String::from_utf8(delivered[1].clone()).unwrap().contains(r#""time":2"#)
  );
  assert!(
    buffer::oldest_segments(&directory).is_empty(),
    "delivered segments removed"
  );
}
