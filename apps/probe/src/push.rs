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
use crate::wire::{ CheckEvent, ErrorEvent, ProbeSample };

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
  let (secure, rest) = url
    .strip_prefix("https://")
    .map(|rest| (true, rest))
    .or_else(|| url.strip_prefix("http://").map(|rest| (false, rest)))?;

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
    .find(|address| address.is_ipv4())
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
  checks: Arc<Queue<CheckEvent>>,
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
        flush_remaining(&configuration, &samples, &errors, &checks).await;
        return;
      }
    }

    drain_all_to_disk(&configuration, &samples, &errors, &checks);

    flush_segments(&configuration, &mut backoff).await;
  }
}

fn drain_all_to_disk(
  configuration: &PushConfig,
  samples: &Queue<ProbeSample>,
  errors: &Queue<ErrorEvent>,
  checks: &Queue<CheckEvent>
) {
  let spill_max = spill_batch_max(configuration);

  loop {
    let batch = buffer::drain_batch(samples, errors, checks, spill_max);
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
      checks.requeue_front(unspilled.checks);
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
  errors: &Queue<ErrorEvent>,
  checks: &Queue<CheckEvent>
) {
  drain_all_to_disk(configuration, samples, errors, checks);

  let mut backoff = Backoff::new(
    Duration::from_secs(1),
    Duration::from_secs(60)
  );
  flush_segments(configuration, &mut backoff).await;
}

#[cfg(test)]
mod tests;
