use std::sync::{ Arc, OnceLock };
use std::time::{ Duration, Instant };

use rustls::ClientConfig;

use crate::clock::epoch_millis;
use crate::measure::{ measure_http, DebugTarget, HttpTiming, Routing };
use crate::queue::Queue;
use crate::wire::{ ErrorEvent, Measurement, Network, ProbeSample };

const INTERVAL: Duration = Duration::from_secs(1);
const TIMEOUT: Duration = Duration::from_secs(60);
const STARTUP_SETTLE: Duration = Duration::from_millis(750);

static ECHO_SUFFIX: OnceLock<&'static str> = OnceLock::new();

fn env_suffix(environment: &str) -> &'static str {
  if environment == "dev" {
    "-dev"
  } else {
    ""
  }
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

// Each http check also resolves DNS and times the handshake, so one check per
// network yields the dns/handshake/http breakdown.
#[derive(Clone, Copy)]
enum Check {
  Private,
  Public,
  Proxied,
}

const CHECKS: [Check; 3] = [Check::Private, Check::Public, Check::Proxied];

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
  ) -> (Vec<(Measurement, f64, Routing)>, Option<String>) {
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
        let samples = http_samples(
          dns_ms,
          Measurement::Dns,
          outcome.timing,
          Measurement::Http,
          Measurement::Handshake,
          None,
          last_hikari
        );
        (samples, outcome.error)
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
        let samples = http_samples(
          dns_ms,
          Measurement::DnsPublic,
          outcome.timing,
          Measurement::HttpPublic,
          Measurement::HandshakePublic,
          Some(Measurement::HttpPublicHikari),
          last_hikari
        );
        (samples, outcome.error)
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
        let samples = http_samples(
          dns_ms,
          Measurement::DnsProxied,
          outcome.timing,
          Measurement::HttpProxied,
          Measurement::HandshakeProxied,
          Some(Measurement::HttpProxiedHikari),
          last_hikari
        );
        (samples, outcome.error)
      }
    }
  }
}

fn spawn_loop(
  samples: Arc<Queue<ProbeSample>>,
  errors: Arc<Queue<ErrorEvent>>,
  tls: Arc<ClientConfig>,
  region: String,
  check: Check,
  debug: DebugTarget
) {
  tokio::spawn(async move {
    let mut last_hikari: Option<bool> = None;

    loop {
      let started = Instant::now();
      let time = epoch_millis();

      let (sample_list, error) = check.run(
        &region,
        &tls,
        &debug,
        &mut last_hikari
      ).await;

      for (measurement, ms, routing) in sample_list {
        samples.enqueue(ProbeSample {
          measurement,
          dst: region.clone(),
          time,
          ms,
          railway_edge: routing.railway_edge,
          cf_pop: routing.cf_pop,
          hikari_pop: routing.hikari_pop,
        });
      }

      if let Some(reason) = error {
        errors.enqueue(ErrorEvent {
          dst: region.clone(),
          network: check.network(),
          time,
          reason,
        });
      }

      let delay = INTERVAL.saturating_sub(started.elapsed());
      tokio::time::sleep(delay).await;
    }
  });
}

pub async fn start(
  samples: Arc<Queue<ProbeSample>>,
  errors: Arc<Queue<ErrorEvent>>,
  tls: Arc<ClientConfig>,
  regions: Vec<String>,
  src: String,
  debug_regions: Vec<String>,
  environment: String
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

    for check in CHECKS {
      let debug = DebugTarget {
        src: src.clone(),
        dst: region.clone(),
        kind: check.debug_kind(),
        verbose: in_debug_regions && check.verbose(),
      };

      spawn_loop(
        samples.clone(),
        errors.clone(),
        tls.clone(),
        region.clone(),
        check,
        debug
      );
    }
  }
}

#[cfg(test)]
mod tests {
  use super::{
    env_suffix, http_samples, private_host, proxied_host, public_host, Check,
  };
  use crate::measure::{ HttpTiming, Routing };
  use crate::wire::Measurement;

  fn shape(samples: &[(Measurement, f64, Routing)]) -> Vec<(Measurement, f64)> {
    samples.iter().map(|(m, ms, _)| (*m, *ms)).collect()
  }

  #[test]
  fn dev_environment_appends_a_suffix() {
    assert_eq!(env_suffix("dev"), "-dev");
    assert_eq!(env_suffix("production"), "");
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

    // dns, http(hikari), handshake
    assert_eq!(samples.len(), 3);
    assert_eq!(samples[0].0, Measurement::DnsPublic);
    assert_eq!(samples[0].2.cf_pop, None);
    assert_eq!(samples[1].0, Measurement::HttpPublicHikari);
    assert_eq!(samples[1].2.cf_pop, Some("IAD".to_string()));
    assert_eq!(
      samples[1].2.railway_edge,
      Some("railway/us-east4".to_string())
    );
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
}
