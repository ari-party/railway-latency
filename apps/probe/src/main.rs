mod clock;
mod config;
mod log;
mod measure;
mod probe;
mod queue;
mod server;
mod tls;

mod wire {
  include!(concat!(env!("OUT_DIR"), "/wire_types.rs"));
}

use std::sync::Arc;

use crate::config::Config;
use crate::queue::Queue;
use crate::wire::{ ErrorEvent, ProbeSample };

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
  let config = Config::from_env();
  let samples = Arc::new(Queue::<ProbeSample>::new("samples"));
  let errors = Arc::new(Queue::<ErrorEvent>::new("errors"));
  let tls = tls::client_config();

  probe::start(
    samples.clone(),
    errors.clone(),
    tls,
    config.regions,
    config.region,
    config.debug_regions
  ).await;

  server::serve(config.port, samples, errors).await
}

#[cfg(test)]
mod tests {
  use crate::wire::{ Measurement, ProbeSample };

  #[test]
  fn measurement_variants_serialize_to_wire_strings() {
    let cases = [
      (Measurement::Http, "http"),
      (Measurement::Dns, "dns"),
      (Measurement::Handshake, "handshake"),
      (Measurement::HttpPublic, "httpPublic"),
      (Measurement::HttpPublicHikari, "httpPublicHikari"),
      (Measurement::DnsPublic, "dnsPublic"),
      (Measurement::HandshakePublic, "handshakePublic"),
      (Measurement::HttpProxied, "httpProxied"),
      (Measurement::HttpProxiedHikari, "httpProxiedHikari"),
      (Measurement::DnsProxied, "dnsProxied"),
      (Measurement::HandshakeProxied, "handshakeProxied"),
    ];

    for (variant, expected) in cases {
      let json = serde_json::to_string(&variant).unwrap();
      assert_eq!(json, format!("\"{expected}\""));
    }
  }

  #[test]
  fn probe_sample_serializes_with_expected_keys() {
    let sample = ProbeSample {
      measurement: Measurement::HandshakeProxied,
      dst: "europe-west4-drams3a".to_string(),
      time: 1_780_000_000_000.0,
      ms: 12.5,
    };

    let json = serde_json::to_string(&sample).unwrap();

    assert!(json.contains(r#""measurement":"handshakeProxied""#));
    assert!(json.contains(r#""dst":"europe-west4-drams3a""#));
    assert!(json.contains(r#""ms":12.5"#));
    assert!(json.contains(r#""time":1780000000000"#));
  }
}
