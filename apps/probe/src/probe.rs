use std::sync::{ Arc, OnceLock };
use std::time::{ Duration, Instant };

use rustls::ClientConfig;

use crate::clock::epoch_millis;
use crate::measure::{
  measure_http,
  DebugTarget,
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
  hikari: Option<Measurement>,
  last_hikari: &mut Option<bool>
) -> Vec<(Measurement, f64, Routing)> {
  let mut samples = Vec::new();

  if let Some(ms) = dns_ms {
    samples.push((dns, ms, Routing::default()));
  }

  let Some(timing) = timing else {
    return samples;
  };

  if timing.hikari.is_some() {
    *last_hikari = timing.hikari;
  }
  let is_hikari = timing.hikari.or(*last_hikari);

  let measurement = match (hikari, is_hikari) {
    (Some(hikari), Some(true)) => hikari,
    _ => http,
  };

  samples.push((measurement, timing.request_ms, timing.routing.clone()));
  if let Some(ms) = timing.handshake_ms {
    samples.push((handshake, ms, Routing::default()));
  }

  samples
}

fn fail_stage_from_reason(reason: &str) -> CheckEventFailStage {
  if reason.contains("dns") || reason.contains("address") {
    CheckEventFailStage::Dns
  } else if
    reason.contains("tls") ||
    reason.contains("tcp") ||
    reason.contains("handshake")
  {
    CheckEventFailStage::Handshake
  } else {
    CheckEventFailStage::Http
  }
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
  error: Option<String>
) -> CheckEvent {
  let fail_stage = match &capture {
    Some(_) => None,
    None => error.as_deref().map(fail_stage_from_reason),
  };

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
  fn debug_kind(self) -> &'static str {
    match self {
      Check::Private => "private",
      Check::Public => "public",
      Check::Proxied => "proxied",
    }
  }

  fn verbose(self) -> bool {
    matches!(self, Check::Public | Check::Proxied)
  }

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
    tls: &Arc<ClientConfig>,
    debug: &DebugTarget,
    last_hikari: &mut Option<bool>
  ) -> CheckResult {
    match self {
      Check::Private => {
        let (dns_ms, outcome) = measure_http(
          None,
          &private_host(region),
          8080,
          false,
          TIMEOUT,
          debug
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
          None,
          last_hikari
        );
        CheckResult {
          samples,
          error: outcome.error,
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
          debug
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
          Some(Measurement::HttpPublicHikari),
          last_hikari
        );
        CheckResult {
          samples,
          error: outcome.error,
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
          debug
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
          Some(Measurement::HttpProxiedHikari),
          last_hikari
        );
        CheckResult {
          samples,
          error: outcome.error,
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
  debug: DebugTarget,
  mtr: Option<Arc<MtrRegistry>>
) {
  let samples = queues.samples.clone();
  let errors = queues.errors.clone();
  let checks = queues.checks.clone();

  tokio::spawn(async move {
    let mut last_hikari: Option<bool> = None;

    loop {
      let started = Instant::now();
      let time = epoch_millis();

      let result = check.run(&region, &tls, &debug, &mut last_hikari).await;

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
          error
        )
      );

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
  src: String,
  debug_regions: Vec<String>,
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
    let in_debug_regions = debug_regions.iter().any(|r| r == &region);

    for check in checks.iter().copied() {
      let debug = DebugTarget {
        src: src.clone(),
        dst: region.clone(),
        kind: check.debug_kind(),
        verbose: in_debug_regions && check.verbose(),
      };

      spawn_loop(
        queues,
        tls.clone(),
        region.clone(),
        check,
        debug,
        mtr.clone()
      );
    }
  }
}

pub async fn start(
  queues: &Queues,
  tls: Arc<ClientConfig>,
  regions: Vec<String>,
  src: String,
  debug_regions: Vec<String>,
  environment: String
) {
  let _ = ECHO_SUFFIX.set(env_suffix(&environment));

  let mtr = start_mtr(&regions).await;

  start_checks(
    queues,
    tls,
    regions,
    src,
    debug_regions,
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

  start_checks(
    queues,
    tls,
    targets,
    String::new(),
    Vec::new(),
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
mod tests {
  use super::{
    build_check_event,
    env_suffix,
    http_samples,
    mtr_key,
    private_host,
    proxied_host,
    public_host,
    sample_mtr,
    Check,
  };
  use crate::measure::{ HttpTiming, ResponseCapture, Routing };
  use crate::mtr::MtrRegistry;
  use crate::wire::{ CheckEventFailStage, Measurement, MtrHop, Network };

  fn shape(samples: &[(Measurement, f64, Routing)]) -> Vec<(Measurement, f64)> {
    samples
      .iter()
      .map(|(m, ms, _)| (*m, *ms))
      .collect()
  }

  #[test]
  fn dev_environment_appends_a_suffix() {
    assert_eq!(env_suffix("dev"), "-dev");
    assert_eq!(env_suffix("prod"), "");
    assert_eq!(env_suffix(""), "");
  }

  #[test]
  fn hosts_default_to_no_suffix() {
    assert_eq!(public_host("us-west2"), "us-west2-echo.up.railway.app");
    assert_eq!(proxied_host("us-west2"), "us-west2-echo.railwaylatency.com");
    assert_eq!(private_host("us-west2"), "us-west2-echo.railway.internal");
  }

  #[test]
  fn picks_hikari_variant_when_detected() {
    let timing = HttpTiming {
      request_ms: 5.0,
      handshake_ms: Some(2.0),
      hikari: Some(true),
      routing: Routing::default(),
    };

    let samples = http_samples(
      None,
      Measurement::DnsPublic,
      Some(timing),
      Measurement::HttpPublic,
      Measurement::HandshakePublic,
      Some(Measurement::HttpPublicHikari),
      &mut None
    );

    assert_eq!(
      shape(&samples),
      vec![
        (Measurement::HttpPublicHikari, 5.0),
        (Measurement::HandshakePublic, 2.0)
      ]
    );
  }

  #[test]
  fn uses_base_measurement_without_hikari() {
    let timing = HttpTiming {
      request_ms: 5.0,
      handshake_ms: None,
      hikari: Some(false),
      routing: Routing::default(),
    };

    let samples = http_samples(
      None,
      Measurement::DnsPublic,
      Some(timing),
      Measurement::HttpPublic,
      Measurement::HandshakePublic,
      Some(Measurement::HttpPublicHikari),
      &mut None
    );

    assert_eq!(shape(&samples), vec![(Measurement::HttpPublic, 5.0)]);
  }

  #[test]
  fn empty_when_nothing_measured() {
    let samples = http_samples(
      None,
      Measurement::Dns,
      None,
      Measurement::Http,
      Measurement::Handshake,
      None,
      &mut None
    );
    assert!(samples.is_empty());
  }

  #[test]
  fn dns_sample_survives_a_failed_request() {
    let samples = http_samples(
      Some(3.0),
      Measurement::DnsPublic,
      None,
      Measurement::HttpPublic,
      Measurement::HandshakePublic,
      Some(Measurement::HttpPublicHikari),
      &mut None
    );
    assert_eq!(shape(&samples), vec![(Measurement::DnsPublic, 3.0)]);
  }

  #[test]
  fn timeout_reuses_last_hikari_classification() {
    let mut last_hikari = Some(true);
    let timing = HttpTiming {
      request_ms: 60_000.0,
      handshake_ms: Some(2.0),
      hikari: None,
      routing: Routing::default(),
    };

    let samples = http_samples(
      None,
      Measurement::DnsPublic,
      Some(timing),
      Measurement::HttpPublic,
      Measurement::HandshakePublic,
      Some(Measurement::HttpPublicHikari),
      &mut last_hikari
    );

    assert_eq!(samples[0].0, Measurement::HttpPublicHikari);
  }

  #[test]
  fn routing_attaches_to_the_http_sample_only() {
    let timing = HttpTiming {
      request_ms: 5.0,
      handshake_ms: Some(2.0),
      hikari: Some(true),
      routing: Routing {
        railway_edge: Some("railway/us-east4".to_string()),
        cf_pop: Some("IAD".to_string()),
        hikari_pop: Some("iad1".to_string()),
      },
    };

    let samples = http_samples(
      Some(3.0),
      Measurement::DnsPublic,
      Some(timing),
      Measurement::HttpPublic,
      Measurement::HandshakePublic,
      Some(Measurement::HttpPublicHikari),
      &mut None
    );

    assert_eq!(samples.len(), 3);
    assert_eq!(samples[0].0, Measurement::DnsPublic);
    assert_eq!(samples[0].2.cf_pop, None);
    assert_eq!(samples[1].0, Measurement::HttpPublicHikari);
    assert_eq!(samples[1].2.cf_pop, Some("IAD".to_string()));
    assert_eq!(samples[1].2.railway_edge, Some("railway/us-east4".to_string()));
    assert_eq!(samples[2].0, Measurement::HandshakePublic);
    assert_eq!(samples[2].2.hikari_pop, None);
  }

  #[test]
  fn debug_kind_is_the_network() {
    assert_eq!(Check::Private.debug_kind(), "private");
    assert_eq!(Check::Public.debug_kind(), "public");
    assert_eq!(Check::Proxied.debug_kind(), "proxied");
  }

  #[test]
  fn only_public_and_proxied_log_every_request() {
    assert!(Check::Public.verbose());
    assert!(Check::Proxied.verbose());
    assert!(!Check::Private.verbose());
  }

  #[test]
  fn mtr_rides_each_networks_http_sample() {
    let registry = MtrRegistry::new();
    let hops = vec![MtrHop {
      hop: 1.0,
      ip: Some("10.0.0.1".to_string()),
      ms: Some(0.5),
    }];
    registry.publish(&mtr_key("public", "dst"), hops.clone());
    registry.publish(&mtr_key("proxied", "dst"), hops.clone());

    assert!(
      sample_mtr(Measurement::DnsProxied, Some(&registry), "dst").is_empty()
    );
    assert!(
      sample_mtr(
        Measurement::HandshakePublic,
        Some(&registry),
        "dst"
      ).is_empty()
    );

    assert_eq!(
      sample_mtr(Measurement::HttpPublic, Some(&registry), "dst"),
      hops
    );
    assert!(
      sample_mtr(Measurement::HttpPublic, Some(&registry), "dst").is_empty()
    );
    assert_eq!(
      sample_mtr(Measurement::HttpProxied, Some(&registry), "dst"),
      hops
    );
    assert!(
      sample_mtr(Measurement::HttpProxied, Some(&registry), "dst").is_empty()
    );
  }

  #[test]
  fn check_event_reaching_http_sets_status_and_clears_fail_stage() {
    let capture = ResponseCapture {
      status: 200,
      headers: std::collections::HashMap::new(),
      body: String::new(),
      body_truncated: false,
      request_id: Some("req_9b2".to_string()),
      handshake_ms: Some(38.0),
      request_ms: 312.0,
      routing: Routing::default(),
    };
    let event = build_check_event(
      "europe-west4",
      Network::Public,
      1_700_000_000_000.0,
      Some(2.0),
      Some(38.0),
      Some(312.0),
      Routing {
        railway_edge: Some("iad".into()),
        cf_pop: Some("SIN".into()),
        hikari_pop: None,
      },
      Some(capture),
      None
    );
    assert_eq!(event.dst, "europe-west4");
    assert!(event.fail_stage.is_none());
    assert_eq!(event.http_status, Some(200.0));
    assert_eq!(event.railway_edge.as_deref(), Some("iad"));
    assert_eq!(event.request_id.as_deref(), Some("req_9b2"));
    assert_eq!(event.body, None);
  }

  #[test]
  fn check_event_dns_failure_sets_fail_stage_and_reason() {
    let event = build_check_event(
      "europe-west4",
      Network::Public,
      1_700_000_000_000.0,
      Some(51.0),
      None,
      None,
      Routing::default(),
      None,
      Some("dns lookup failed".into())
    );
    assert!(matches!(event.fail_stage, Some(CheckEventFailStage::Dns)));
    assert_eq!(event.reason.as_deref(), Some("dns lookup failed"));
    assert_eq!(event.http_status, None);
  }

  #[test]
  fn check_event_no_addresses_resolved_is_dns_stage() {
    let event = build_check_event(
      "europe-west4",
      Network::Public,
      1_700_000_000_000.0,
      None,
      None,
      None,
      Routing::default(),
      None,
      Some("no addresses resolved".into())
    );
    assert!(matches!(event.fail_stage, Some(CheckEventFailStage::Dns)));
  }

  #[test]
  fn check_event_non_2xx_response_is_not_a_stage_failure() {
    let capture = ResponseCapture {
      status: 503,
      headers: std::collections::HashMap::from([
        ("x-railway-edge".to_string(), "iad".to_string()),
      ]),
      body: "{\"error\":\"upstream\"}".to_string(),
      body_truncated: false,
      request_id: None,
      handshake_ms: Some(38.0),
      request_ms: 312.0,
      routing: Routing {
        railway_edge: Some("railway/europe-west4".to_string()),
        cf_pop: None,
        hikari_pop: None,
      },
    };
    let outcome_timing = None;
    let outcome_capture = Some(capture);
    let (handshake_ms, http_ms, routing) = super::diagnostic_timings(
      &outcome_timing,
      &outcome_capture
    );
    let event = build_check_event(
      "europe-west4",
      Network::Public,
      1_700_000_000_000.0,
      Some(2.0),
      handshake_ms,
      http_ms,
      routing,
      outcome_capture,
      Some("status 503".into())
    );
    assert!(event.fail_stage.is_none());
    assert_eq!(event.http_status, Some(503.0));
    assert_eq!(event.handshake_ms, Some(38.0));
    assert_eq!(event.http_ms, Some(312.0));
    assert_eq!(event.railway_edge.as_deref(), Some("railway/europe-west4"));
    assert_eq!(event.body.as_deref(), Some("{\"error\":\"upstream\"}"));
    assert_eq!(
      event.headers.get("x-railway-edge").map(String::as_str),
      Some("iad")
    );
  }

  #[test]
  fn external_checks_exclude_private() {
    let kinds: Vec<&str> = super::EXTERNAL_CHECKS
      .iter()
      .map(|check| check.debug_kind())
      .collect();
    assert_eq!(kinds, vec!["public", "proxied"]);
    assert!(!kinds.contains(&"private"));
  }
}
