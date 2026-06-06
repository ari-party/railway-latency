use std::sync::Arc;
use std::time::{ Duration, Instant };

use rustls::ClientConfig;

use crate::clock::epoch_millis;
use crate::measure::{ measure_dns, measure_http, DebugTarget, HttpTiming };
use crate::queue::Queue;
use crate::wire::{ ErrorCheck, ErrorEvent, Measurement, Network, ProbeSample };

const INTERVAL: Duration = Duration::from_secs(1);
const TIMEOUT: Duration = Duration::from_secs(60);
const STARTUP_SETTLE: Duration = Duration::from_millis(750);

fn private_host(region: &str) -> String {
  format!("{region}-echo.railway.internal")
}

fn public_host(region: &str) -> String {
  format!("{region}-echo.up.railway.app")
}

fn proxied_host(region: &str) -> String {
  format!("{region}-echo.railwaylatency.com")
}

fn http_samples(
  timing: Option<HttpTiming>,
  http: Measurement,
  handshake: Measurement,
  hikari: Option<Measurement>,
  last_hikari: &mut Option<bool>
) -> Vec<(Measurement, f64)> {
  let Some(timing) = timing else {
    return Vec::new();
  };

  if timing.hikari.is_some() {
    *last_hikari = timing.hikari;
  }
  let is_hikari = timing.hikari.or(*last_hikari);

  let measurement = match (hikari, is_hikari) {
    (Some(hikari), Some(true)) => hikari,
    _ => http,
  };

  let mut samples = vec![(measurement, timing.request_ms)];
  if let Some(ms) = timing.handshake_ms {
    samples.push((handshake, ms));
  }

  samples
}

fn dns_samples(
  ms: Option<f64>,
  measurement: Measurement
) -> Vec<(Measurement, f64)> {
  match ms {
    Some(ms) => vec![(measurement, ms)],
    None => Vec::new(),
  }
}

#[derive(Clone, Copy)]
enum Check {
  PrivateHttp,
  PrivateDns,
  PublicHttp,
  PublicDns,
  ProxiedHttp,
  ProxiedDns,
}

const CHECKS: [Check; 6] = [
  Check::PrivateHttp,
  Check::PrivateDns,
  Check::PublicHttp,
  Check::PublicDns,
  Check::ProxiedHttp,
  Check::ProxiedDns,
];

impl Check {
  fn debug_kind(self) -> &'static str {
    match self {
      Check::PrivateHttp | Check::PrivateDns => "private",
      Check::PublicHttp | Check::PublicDns => "public",
      Check::ProxiedHttp | Check::ProxiedDns => "proxied",
    }
  }

  fn verbose(self) -> bool {
    matches!(self, Check::PublicHttp | Check::ProxiedHttp)
  }

  fn network(self) -> Network {
    match self {
      Check::PrivateHttp | Check::PrivateDns => Network::Private,
      Check::PublicHttp | Check::PublicDns => Network::Public,
      Check::ProxiedHttp | Check::ProxiedDns => Network::Proxied,
    }
  }

  fn error_check(self) -> ErrorCheck {
    match self {
      Check::PrivateHttp | Check::PublicHttp | Check::ProxiedHttp =>
        ErrorCheck::Http,
      Check::PrivateDns | Check::PublicDns | Check::ProxiedDns =>
        ErrorCheck::Dns,
    }
  }

  async fn run(
    self,
    region: &str,
    tls: &Arc<ClientConfig>,
    debug: &DebugTarget,
    last_hikari: &mut Option<bool>
  ) -> (Vec<(Measurement, f64)>, Option<String>) {
    match self {
      Check::PrivateHttp => {
        let outcome = measure_http(
          None,
          &private_host(region),
          8080,
          false,
          TIMEOUT,
          debug
        ).await;
        let samples = http_samples(
          outcome.timing,
          Measurement::Http,
          Measurement::Handshake,
          None,
          last_hikari
        );
        (samples, outcome.error)
      }

      Check::PrivateDns => {
        let (ms, error) = measure_dns(
          &private_host(region),
          TIMEOUT,
          debug
        ).await;
        (dns_samples(ms, Measurement::Dns), error)
      }

      Check::PublicHttp => {
        let outcome = measure_http(
          Some(tls),
          &public_host(region),
          443,
          true,
          TIMEOUT,
          debug
        ).await;
        let samples = http_samples(
          outcome.timing,
          Measurement::HttpPublic,
          Measurement::HandshakePublic,
          Some(Measurement::HttpPublicHikari),
          last_hikari
        );
        (samples, outcome.error)
      }

      Check::PublicDns => {
        let (ms, error) = measure_dns(
          &public_host(region),
          TIMEOUT,
          debug
        ).await;
        (dns_samples(ms, Measurement::DnsPublic), error)
      }

      Check::ProxiedHttp => {
        let outcome = measure_http(
          Some(tls),
          &proxied_host(region),
          443,
          true,
          TIMEOUT,
          debug
        ).await;
        let samples = http_samples(
          outcome.timing,
          Measurement::HttpProxied,
          Measurement::HandshakeProxied,
          Some(Measurement::HttpProxiedHikari),
          last_hikari
        );
        (samples, outcome.error)
      }

      Check::ProxiedDns => {
        let (ms, error) = measure_dns(
          &proxied_host(region),
          TIMEOUT,
          debug
        ).await;
        (dns_samples(ms, Measurement::DnsProxied), error)
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

      for (measurement, ms) in sample_list {
        samples.enqueue(ProbeSample {
          measurement,
          dst: region.clone(),
          time,
          ms,
        });
      }

      if let Some(reason) = error {
        errors.enqueue(ErrorEvent {
          dst: region.clone(),
          network: check.network(),
          check: check.error_check(),
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
  debug_regions: Vec<String>
) {
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
  use super::{ http_samples, Check };
  use crate::measure::HttpTiming;
  use crate::wire::Measurement;

  #[test]
  fn picks_hikari_variant_when_detected() {
    let timing = HttpTiming {
      request_ms: 5.0,
      handshake_ms: Some(2.0),
      hikari: Some(true),
    };

    let samples = http_samples(
      Some(timing),
      Measurement::HttpPublic,
      Measurement::HandshakePublic,
      Some(Measurement::HttpPublicHikari),
      &mut None
    );

    assert_eq!(
      samples,
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
    };

    let samples = http_samples(
      Some(timing),
      Measurement::HttpPublic,
      Measurement::HandshakePublic,
      Some(Measurement::HttpPublicHikari),
      &mut None
    );

    assert_eq!(samples, vec![(Measurement::HttpPublic, 5.0)]);
  }

  #[test]
  fn empty_when_measurement_dropped() {
    let samples = http_samples(
      None,
      Measurement::Http,
      Measurement::Handshake,
      None,
      &mut None
    );
    assert!(samples.is_empty());
  }

  #[test]
  fn timeout_reuses_last_hikari_classification() {
    let mut last_hikari = Some(true);
    let timing = HttpTiming {
      request_ms: 60_000.0,
      handshake_ms: Some(2.0),
      hikari: None,
    };

    let samples = http_samples(
      Some(timing),
      Measurement::HttpPublic,
      Measurement::HandshakePublic,
      Some(Measurement::HttpPublicHikari),
      &mut last_hikari
    );

    assert_eq!(samples[0].0, Measurement::HttpPublicHikari);
  }

  #[test]
  fn debug_kind_is_the_network() {
    assert_eq!(Check::PrivateHttp.debug_kind(), "private");
    assert_eq!(Check::PublicDns.debug_kind(), "public");
    assert_eq!(Check::ProxiedHttp.debug_kind(), "proxied");
  }

  #[test]
  fn only_public_and_proxied_http_log_every_request() {
    assert!(Check::PublicHttp.verbose());
    assert!(Check::ProxiedHttp.verbose());
    assert!(!Check::PrivateHttp.verbose());
    assert!(!Check::PublicDns.verbose());
    assert!(!Check::ProxiedDns.verbose());
  }
}
