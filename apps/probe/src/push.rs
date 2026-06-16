use std::sync::Arc;
use std::time::Duration;

use http_body_util::{ BodyExt, Full };
use hyper::body::Bytes;
use hyper::header::{ AUTHORIZATION, CONTENT_TYPE, HOST };
use hyper::Request;
use hyper_util::rt::TokioIo;
use rustls::ClientConfig;
use rustls_pki_types::ServerName;
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use tokio_util::either::Either;

use crate::buffer::{ self, Segment };
use crate::config::PushConfig;
use crate::queue::Queue;
use crate::wire::{ ErrorEvent, ProbeSample };

const HTTP_TIMEOUT: Duration = Duration::from_secs(60);

const INGEST_BATCH_CAP: usize = 600;

#[derive(Debug)]
pub enum PostError {
  Rejected,
  Retry,
}

pub fn classify_status(status: u16) -> Option<PostError> {
  match status {
    200..=299 => None,
    400 | 401 | 403 | 422 => Some(PostError::Rejected),
    _ => Some(PostError::Retry),
  }
}

pub struct Backoff {
  base: Duration,
  current: Duration,
  max: Duration,
}

impl Backoff {
  pub fn new(base: Duration, max: Duration) -> Self {
    Self { base, current: base, max }
  }

  #[cfg(test)]
  pub fn current(&self) -> Duration {
    self.current
  }

  pub fn advance(&mut self) {
    self.current = (self.current * 2).min(self.max);
  }

  pub fn reset(&mut self) {
    self.current = self.base;
  }

  pub async fn sleep(&mut self) {
    let delay = jitter(self.current);
    tokio::time::sleep(delay).await;
    self.advance();
  }
}

fn jitter(delay: Duration) -> Duration {
  let nanos = std::time::SystemTime
    ::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.subsec_nanos())
    .unwrap_or(0);

  let fraction = ((nanos % 1000) as f64) / 1000.0;
  let factor = 0.75 + fraction * 0.5;
  delay.mul_f64(factor)
}

pub(crate) fn host_and_path(url: &str) -> Option<(bool, String, u16, String)> {
  let (secure, rest) = if let Some(rest) = url.strip_prefix("https://") {
    (true, rest)
  } else if let Some(rest) = url.strip_prefix("http://") {
    (false, rest)
  } else {
    return None;
  };

  let (authority, path) = match rest.split_once('/') {
    Some((authority, path)) => (authority, format!("/{path}")),
    None => (rest, "/".to_string()),
  };

  let (host, port) = match authority.split_once(':') {
    Some((host, port)) => (host.to_string(), port.parse().ok()?),
    None => (authority.to_string(), if secure { 443 } else { 80 }),
  };

  Some((secure, host, port, path))
}

pub async fn post_batch(
  configuration: &PushConfig,
  segment: &Segment
) -> Result<(), PostError> {
  let tls = crate::tls::client_config();
  let result = tokio::time::timeout(
    HTTP_TIMEOUT,
    send(configuration, segment, &tls)
  ).await;

  match result {
    Ok(Ok(status)) =>
      match classify_status(status) {
        None => Ok(()),
        Some(error) => Err(error),
      }
    Ok(Err(_)) => Err(PostError::Retry),
    Err(_) => Err(PostError::Retry),
  }
}

async fn send(
  configuration: &PushConfig,
  segment: &Segment,
  tls: &Arc<ClientConfig>
) -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
  let (secure, host, port, path) = host_and_path(
    &configuration.ingest_url
  ).ok_or("invalid ingest url")?;

  let address = tokio::net
    ::lookup_host((host.as_str(), port)).await?
    .next()
    .ok_or("no addresses resolved")?;
  let tcp = TcpStream::connect(address).await?;
  tcp.set_nodelay(true).ok();

  let stream = if secure {
    let server_name = ServerName::try_from(host.clone())?;
    let tls_stream = TlsConnector::from(tls.clone()).connect(
      server_name,
      tcp
    ).await?;
    Either::Right(tls_stream)
  } else {
    Either::Left(tcp)
  };

  let (mut sender, connection) = hyper::client::conn::http1::handshake(
    TokioIo::new(stream)
  ).await?;
  tokio::spawn(async move {
    let _ = connection.await;
  });

  let request = Request::builder()
    .method("POST")
    .uri(&path)
    .header(HOST, &host)
    .header(AUTHORIZATION, format!("Bearer {}", configuration.api_key))
    .header(CONTENT_TYPE, "application/json")
    .body(Full::new(Bytes::from(segment.bytes.clone())))?;

  let response = sender.send_request(request).await?;
  let status = response.status().as_u16();
  let _ = response.into_body().collect().await;

  Ok(status)
}

fn spill_batch_max(configuration: &PushConfig) -> usize {
  configuration.batch_max.clamp(1, INGEST_BATCH_CAP)
}

pub async fn run(
  samples: Arc<Queue<ProbeSample>>,
  errors: Arc<Queue<ErrorEvent>>,
  configuration: PushConfig,
  mut shutdown: tokio::sync::watch::Receiver<bool>
) {
  let mut backoff = Backoff::new(
    Duration::from_secs(1),
    Duration::from_secs(60)
  );

  flush_segments(&configuration, &mut backoff).await;

  loop {
    tokio::select! {
      _ = tokio::time::sleep(configuration.interval) => {}
      _ = shutdown.changed() => {
        flush_remaining(&configuration, &samples, &errors).await;
        return;
      }
    }

    drain_all_to_disk(&configuration, &samples, &errors);

    flush_segments(&configuration, &mut backoff).await;
  }
}

fn drain_all_to_disk(
  configuration: &PushConfig,
  samples: &Queue<ProbeSample>,
  errors: &Queue<ErrorEvent>
) {
  let spill_max = spill_batch_max(configuration);

  loop {
    let batch = buffer::drain_batch(samples, errors, spill_max);
    if batch.is_empty() {
      break;
    }
    if
      let Err(unspilled) = buffer::spill(
        &configuration.buffer_dir,
        &configuration.probe_id,
        batch
      )
    {
      samples.requeue_front(unspilled.samples);
      errors.requeue_front(unspilled.errors);
      break;
    }
  }
}

async fn flush_segments(configuration: &PushConfig, backoff: &mut Backoff) {
  for path in buffer::oldest_segment_paths(&configuration.buffer_dir) {
    let Some(segment) = buffer::read_segment(&path) else {
      continue;
    };
    match post_batch(configuration, &segment).await {
      Ok(()) => {
        buffer::remove_blocking(&segment.path);
        backoff.reset();
      }
      Err(PostError::Rejected) => {
        tracing::error!(
          event = "segment_rejected",
          path = %segment.path.display(),
          "ingestor rejected segment, quarantining",
        );
        buffer::quarantine(&segment.path);
      }
      Err(PostError::Retry) => {
        backoff.sleep().await;
        break;
      }
    }
  }
}

async fn flush_remaining(
  configuration: &PushConfig,
  samples: &Queue<ProbeSample>,
  errors: &Queue<ErrorEvent>
) {
  drain_all_to_disk(configuration, samples, errors);

  let mut backoff = Backoff::new(
    Duration::from_secs(1),
    Duration::from_secs(60)
  );
  flush_segments(configuration, &mut backoff).await;
}

#[cfg(test)]
mod tests {
  use crate::buffer::{ self, Batch };
  use crate::wire::{ ErrorEvent, Measurement, Network, ProbeSample };

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
    };

    buffer::spill(&directory, "asia-hcloud-sin1", batch).unwrap();
    let segment = buffer::oldest_segments(&directory).pop().unwrap();
    let json = String::from_utf8(segment.bytes).unwrap();

    assert!(json.contains(r#""probeId":"asia-hcloud-sin1""#));
    assert!(json.contains(r#""samples":["#));
    assert!(json.contains(r#""errors":["#));
    assert!(json.contains(r#""measurement":"httpPublic""#));
    assert!(json.contains(r#""dst":"europe-west4-drams3a""#));
    assert!(json.contains(r#""reason":"timeout""#));
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

    drain_all_to_disk(&configuration, &samples, &errors);

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
    assert_eq!(backoff.current(), Duration::from_secs(1));
    backoff.advance();
    assert_eq!(backoff.current(), Duration::from_secs(2));
    backoff.advance();
    assert_eq!(backoff.current(), Duration::from_secs(4));
    for _ in 0..10 {
      backoff.advance();
    }
    assert_eq!(backoff.current(), Duration::from_secs(60));
    backoff.reset();
    assert_eq!(backoff.current(), Duration::from_secs(1));
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
      })
      .unwrap();
    buffer
      ::spill(&directory, "asia-hcloud-sin1", Batch {
        samples: vec![sample(2.0)],
        errors: vec![],
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
}
