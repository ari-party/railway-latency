use std::sync::Arc;
use std::time::{ Duration, Instant };

use rustls::ClientConfig;

use crate::clock::epoch_millis;
use crate::measure::{ measure_dns, measure_http, HttpTiming };
use crate::queue::SampleQueue;
use crate::wire::{ Measurement, ProbeSample };

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
  hikari: Option<Measurement>
) -> Vec<(Measurement, f64)> {
  let Some(timing) = timing else {
    return Vec::new();
  };

  let measurement = match (hikari, timing.hikari) {
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
  async fn run(
    self,
    region: &str,
    tls: &Arc<ClientConfig>
  ) -> Vec<(Measurement, f64)> {
    match self {
      Check::PrivateHttp =>
        http_samples(
          measure_http(None, &private_host(region), 8080, false, TIMEOUT).await,
          Measurement::Http,
          Measurement::Handshake,
          None
        ),

      Check::PrivateDns =>
        dns_samples(
          measure_dns(&private_host(region), TIMEOUT).await,
          Measurement::Dns
        ),

      Check::PublicHttp =>
        http_samples(
          measure_http(
            Some(tls),
            &public_host(region),
            443,
            true,
            TIMEOUT
          ).await,
          Measurement::HttpPublic,
          Measurement::HandshakePublic,
          Some(Measurement::HttpPublicHikari)
        ),

      Check::PublicDns =>
        dns_samples(
          measure_dns(&public_host(region), TIMEOUT).await,
          Measurement::DnsPublic
        ),

      Check::ProxiedHttp =>
        http_samples(
          measure_http(
            Some(tls),
            &proxied_host(region),
            443,
            true,
            TIMEOUT
          ).await,
          Measurement::HttpProxied,
          Measurement::HandshakeProxied,
          Some(Measurement::HttpProxiedHikari)
        ),

      Check::ProxiedDns =>
        dns_samples(
          measure_dns(&proxied_host(region), TIMEOUT).await,
          Measurement::DnsProxied
        ),
    }
  }
}

fn spawn_loop(
  queue: Arc<SampleQueue>,
  tls: Arc<ClientConfig>,
  region: String,
  check: Check
) {
  tokio::spawn(async move {
    loop {
      let started = Instant::now();
      let time = epoch_millis();

      for (measurement, ms) in check.run(&region, &tls).await {
        queue.enqueue(ProbeSample {
          measurement,
          dst: region.clone(),
          time,
          ms,
        });
      }

      let delay = INTERVAL.saturating_sub(started.elapsed());
      tokio::time::sleep(delay).await;
    }
  });
}

pub async fn start(
  queue: Arc<SampleQueue>,
  tls: Arc<ClientConfig>,
  regions: Vec<String>
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
    for check in CHECKS {
      spawn_loop(queue.clone(), tls.clone(), region.clone(), check);
    }
  }
}

#[cfg(test)]
mod tests {
  use super::http_samples;
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
      Some(Measurement::HttpPublicHikari)
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
      Some(Measurement::HttpPublicHikari)
    );

    assert_eq!(samples, vec![(Measurement::HttpPublic, 5.0)]);
  }

  #[test]
  fn empty_when_measurement_dropped() {
    let samples = http_samples(
      None,
      Measurement::Http,
      Measurement::Handshake,
      None
    );
    assert!(samples.is_empty());
  }
}
