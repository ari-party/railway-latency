use std::sync::{ Arc, OnceLock };
use std::time::{ Duration, Instant };

use rustls::ClientConfig;

use crate::clock::epoch_millis;
use crate::measure::{
  measure_http,
  HttpTiming,
  ResponseCapture,
  Routing,
};
use crate::mtr::MtrRegistry;
use crate::queue::Queue;
use crate::wire::{
  CheckEvent,
  CheckEventFailStage,
  ErrorEvent,
  Measurement,
  MtrHop,
  Network,
  ProbeSample,
};

const INTERVAL: Duration = Duration::from_secs(1);
const TIMEOUT: Duration = Duration::from_secs(60);
const STARTUP_SETTLE: Duration = Duration::from_millis(750);

const BASELINE_HOST: &str = "baseline.railwaylatency.com";
const BASELINE_DST: &str = "baseline";

static ECHO_SUFFIX: OnceLock<&'static str> = OnceLock::new();

pub struct Queues {
  pub samples: Arc<Queue<ProbeSample>>,
  pub errors: Arc<Queue<ErrorEvent>>,
  pub checks: Arc<Queue<CheckEvent>>,
}

fn env_suffix(environment: &str) -> &'static str {
  if environment == "dev" { "-dev" } else { "" }
}

fn echo_suffix() -> &'static str {
  ECHO_SUFFIX.get().copied().unwrap_or("")
}

fn private_host(region: &str) -> String {
  format!("{region}-echo.railway.internal")
}

fn public_host(region: &str) -> String {
  format!("{region}-echo{}.up.railway.app", echo_suffix())
}

fn proxied_host(region: &str) -> String {
  format!("{region}-echo{}.railwaylatency.com", echo_suffix())
}

fn http_samples(
  dns_ms: Option<f64>,
  dns: Measurement,
  timing: Option<HttpTiming>,
  http: Measurement,
  handshake: Measurement,
  hikari: Option<Measurement>
) -> Vec<(Measurement, f64, Routing)> {
  let mut samples = Vec::new();

  if let Some(ms) = dns_ms {
    samples.push((dns, ms, Routing::default()));
  }

  let Some(timing) = timing else {
    return samples;
  };

  let measurement = hikari.unwrap_or(http);

  samples.push((measurement, timing.request_ms, timing.routing.clone()));
  if let Some(ms) = timing.handshake_ms {
    samples.push((handshake, ms, Routing::default()));
  }

  samples
}

#[allow(clippy::too_many_arguments)]
fn build_check_event(
  region: &str,
  network: Network,
  time: f64,
  dns_ms: Option<f64>,
  handshake_ms: Option<f64>,
  http_ms: Option<f64>,
  routing: Routing,
  capture: Option<ResponseCapture>,
  error: Option<String>,
  fail_stage: Option<CheckEventFailStage>
) -> CheckEvent {
  let (http_status, request_id, headers, body, body_truncated) = match capture {
    None => (None, None, std::collections::HashMap::new(), None, None),
    Some(c) =>
      (
        Some(c.status as f64),
        c.request_id,
        c.headers,
        if c.body.is_empty() { None } else { Some(c.body) },
        Some(c.body_truncated),
      ),
  };

  CheckEvent {
    dst: region.to_string(),
    network,
    time,
    fail_stage,
    reason: error,
    dns_ms,
    handshake_ms,
    http_ms,
    http_status,
    railway_edge: routing.railway_edge,
    cf_pop: routing.cf_pop,
    hikari_pop: routing.hikari_pop,
    request_id,
    headers,
    body,
    body_truncated,
  }
}

pub struct CheckResult {
  pub samples: Vec<(Measurement, f64, Routing)>,
  pub error: Option<String>,
  pub fail_stage: Option<CheckEventFailStage>,
  pub dns_ms: Option<f64>,
  pub handshake_ms: Option<f64>,
  pub http_ms: Option<f64>,
  pub routing: Routing,
  pub capture: Option<ResponseCapture>,
}

fn diagnostic_timings(
  timing: &Option<HttpTiming>,
  capture: &Option<ResponseCapture>
) -> (Option<f64>, Option<f64>, Routing) {
  if let Some(timing) = timing {
    (timing.handshake_ms, Some(timing.request_ms), timing.routing.clone())
  } else if let Some(capture) = capture {
    (capture.handshake_ms, Some(capture.request_ms), capture.routing.clone())
  } else {
    (None, None, Routing::default())
  }
}

#[derive(Clone, Copy)]
enum Check {
  Private,
  Public,
  Proxied,
}

const CHECKS: [Check; 3] = [Check::Private, Check::Public, Check::Proxied];

const EXTERNAL_CHECKS: [Check; 2] = [Check::Public, Check::Proxied];

impl Check {
  fn network(self) -> Network {
    match self {
      Check::Private => Network::Private,
      Check::Public => Network::Public,
      Check::Proxied => Network::Proxied,
    }
  }

  async fn run(
    self,
    region: &str,
    tls: &Arc<ClientConfig>
  ) -> CheckResult {
    match self {
      Check::Private => {
        let (dns_ms, outcome) = measure_http(
          None,
          &private_host(region),
          8080,
          false,
          TIMEOUT,
          region
        ).await;
        let (handshake_ms, http_ms, routing) = diagnostic_timings(
          &outcome.timing,
          &outcome.capture
        );
        let samples = http_samples(
          dns_ms,
          Measurement::Dns,
          outcome.timing,
          Measurement::Http,
          Measurement::Handshake,
          None
        );
        CheckResult {
          samples,
          error: outcome.error,
          fail_stage: outcome.fail_stage,
          dns_ms,
          handshake_ms,
          http_ms,
          routing,
          capture: outcome.capture,
        }
      }

      Check::Public => {
        let (dns_ms, outcome) = measure_http(
          Some(tls),
          &public_host(region),
          443,
          true,
          TIMEOUT,
          region
        ).await;
        let (handshake_ms, http_ms, routing) = diagnostic_timings(
          &outcome.timing,
          &outcome.capture
        );
        let samples = http_samples(
          dns_ms,
          Measurement::DnsPublic,
          outcome.timing,
          Measurement::HttpPublic,
          Measurement::HandshakePublic,
          Some(Measurement::HttpPublicHikari)
        );
        CheckResult {
          samples,
          error: outcome.error,
          fail_stage: outcome.fail_stage,
          dns_ms,
          handshake_ms,
          http_ms,
          routing,
          capture: outcome.capture,
        }
      }

      Check::Proxied => {
        let (dns_ms, outcome) = measure_http(
          Some(tls),
          &proxied_host(region),
          443,
          true,
          TIMEOUT,
          region
        ).await;
        let (handshake_ms, http_ms, routing) = diagnostic_timings(
          &outcome.timing,
          &outcome.capture
        );
        let samples = http_samples(
          dns_ms,
          Measurement::DnsProxied,
          outcome.timing,
          Measurement::HttpProxied,
          Measurement::HandshakeProxied,
          Some(Measurement::HttpProxiedHikari)
        );
        CheckResult {
          samples,
          error: outcome.error,
          fail_stage: outcome.fail_stage,
          dns_ms,
          handshake_ms,
          http_ms,
          routing,
          capture: outcome.capture,
        }
      }
    }
  }
}

fn mtr_network_label(measurement: Measurement) -> Option<&'static str> {
  match measurement {
    Measurement::HttpPublic | Measurement::HttpPublicHikari => Some("public"),
    Measurement::HttpProxied | Measurement::HttpProxiedHikari =>
      Some("proxied"),
    _ => None,
  }
}

fn mtr_key(network: &str, dst: &str) -> String {
  format!("{network}:{dst}")
}

// The snapshot rides the HTTP sample — the "request" whose path it describes — never the
// dns/handshake samples; public and proxied keep separate paths to separate hosts.
fn sample_mtr(
  measurement: Measurement,
  registry: Option<&MtrRegistry>,
  dst: &str
) -> Vec<MtrHop> {
  let Some(network) = mtr_network_label(measurement) else {
    return Vec::new();
  };

  registry
    .and_then(|registry| registry.take_fresh(&mtr_key(network, dst)))
    .unwrap_or_default()
}

fn spawn_loop(
  queues: &Queues,
  tls: Arc<ClientConfig>,
  region: String,
  check: Check,
  mtr: Option<Arc<MtrRegistry>>
) {
  let samples = queues.samples.clone();
  let errors = queues.errors.clone();
  let checks = queues.checks.clone();

  tokio::spawn(async move {
    loop {
      let started = Instant::now();
      let time = epoch_millis();

      let result = check.run(&region, &tls).await;

      for (measurement, ms, routing) in result.samples {
        samples.enqueue(ProbeSample {
          measurement,
          dst: region.clone(),
          time,
          ms,
          railway_edge: routing.railway_edge,
          cf_pop: routing.cf_pop,
          hikari_pop: routing.hikari_pop,
          mtr: sample_mtr(measurement, mtr.as_deref(), &region),
        });
      }

      let error = result.error;
      if let Some(reason) = error.as_ref() {
        errors.enqueue(ErrorEvent {
          dst: region.clone(),
          network: check.network(),
          time,
          reason: reason.clone(),
        });
      }

      checks.enqueue(
        build_check_event(
          &region,
          check.network(),
          time,
          result.dns_ms,
          result.handshake_ms,
          result.http_ms,
          result.routing,
          result.capture,
          error,
          result.fail_stage
        )
      );

      let delay = INTERVAL.saturating_sub(started.elapsed());
      tokio::time::sleep(delay).await;
    }
  });
}

fn spawn_baseline_loop(queues: &Queues, tls: Arc<ClientConfig>) {
  let samples = queues.samples.clone();

  tokio::spawn(async move {
    loop {
      let started = Instant::now();
      let time = epoch_millis();

      let (dns_ms, outcome) = measure_http(
        Some(&tls),
        BASELINE_HOST,
        443,
        true,
        TIMEOUT,
        BASELINE_DST
      ).await;

      let built = http_samples(
        dns_ms,
        Measurement::DnsBaseline,
        outcome.timing,
        Measurement::HttpBaseline,
        Measurement::HandshakeBaseline,
        None
      );

      for (measurement, ms, routing) in built {
        samples.enqueue(ProbeSample {
          measurement,
          dst: BASELINE_DST.to_string(),
          time,
          ms,
          railway_edge: routing.railway_edge,
          cf_pop: routing.cf_pop,
          hikari_pop: routing.hikari_pop,
          mtr: Vec::new(),
        });
      }

      let delay = INTERVAL.saturating_sub(started.elapsed());
      tokio::time::sleep(delay).await;
    }
  });
}

#[allow(clippy::too_many_arguments)]
async fn start_checks(
  queues: &Queues,
  tls: Arc<ClientConfig>,
  regions: Vec<String>,
  environment: String,
  checks: &[Check],
  mtr: Option<Arc<MtrRegistry>>
) {
  let _ = ECHO_SUFFIX.set(env_suffix(&environment));

  for region in &regions {
    for host in [
      private_host(region),
      public_host(region),
      proxied_host(region),
    ] {
      let _ = tokio::net::lookup_host((host.as_str(), 0u16)).await;
    }
  }

  tokio::time::sleep(STARTUP_SETTLE).await;

  for region in regions {
    for check in checks.iter().copied() {
      spawn_loop(
        queues,
        tls.clone(),
        region.clone(),
        check,
        mtr.clone()
      );
    }
  }
}

pub async fn start(
  queues: &Queues,
  tls: Arc<ClientConfig>,
  regions: Vec<String>,
  environment: String
) {
  let _ = ECHO_SUFFIX.set(env_suffix(&environment));

  let mtr = start_mtr(&regions).await;

  start_checks(
    queues,
    tls,
    regions,
    environment,
    &CHECKS,
    mtr
  ).await;
}

pub async fn start_external(
  queues: &Queues,
  tls: Arc<ClientConfig>,
  targets: Vec<String>,
  environment: String
) {
  // Set before start_mtr resolves proxied hosts; start_checks re-sets it as a no-op.
  let _ = ECHO_SUFFIX.set(env_suffix(&environment));

  let mtr = start_mtr(&targets).await;

  spawn_baseline_loop(queues, tls.clone());

  start_checks(
    queues,
    tls,
    targets,
    environment,
    &EXTERNAL_CHECKS,
    mtr
  ).await;
}

async fn start_mtr(targets: &[String]) -> Option<Arc<MtrRegistry>> {
  if !crate::mtr::available().await {
    tracing::warn!(
      event = "mtr_unavailable",
      "mtr missing or cannot open raw sockets; continuous MTR disabled"
    );
    return None;
  }

  let registry = Arc::new(MtrRegistry::new());

  for target in targets {
    crate::mtr::track_target(
      registry.clone(),
      mtr_key("public", target),
      public_host(target)
    );
    crate::mtr::track_target(
      registry.clone(),
      mtr_key("proxied", target),
      proxied_host(target)
    );
  }

  tracing::info!(
    event = "mtr_enabled",
    targets = targets.len(),
    "continuous MTR running against public and proxied echo endpoints"
  );

  Some(registry)
}

#[cfg(test)]
mod tests;
