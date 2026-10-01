use super::{
  build_check_event,
  env_suffix,
  http_samples,
  mtr_key,
  private_host,
  proxied_host,
  public_host,
  sample_mtr,
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
fn picks_hikari_variant_when_available() {
  let timing = HttpTiming {
    request_ms: 5.0,
    handshake_ms: Some(2.0),
    routing: Routing::default(),
  };

  let samples = http_samples(
    None,
    Measurement::DnsPublic,
    Some(timing),
    Measurement::HttpPublic,
    Measurement::HandshakePublic,
    Some(Measurement::HttpPublicHikari)
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
fn falls_back_to_base_when_no_hikari_variant() {
  let timing = HttpTiming {
    request_ms: 5.0,
    handshake_ms: None,
    routing: Routing::default(),
  };

  let samples = http_samples(
    None,
    Measurement::Dns,
    Some(timing),
    Measurement::Http,
    Measurement::Handshake,
    None
  );

  assert_eq!(shape(&samples), vec![(Measurement::Http, 5.0)]);
}

#[test]
fn empty_when_nothing_measured() {
  let samples = http_samples(
    None,
    Measurement::Dns,
    None,
    Measurement::Http,
    Measurement::Handshake,
    None
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
    Some(Measurement::HttpPublicHikari)
  );
  assert_eq!(shape(&samples), vec![(Measurement::DnsPublic, 3.0)]);
}

#[test]
fn routing_attaches_to_the_http_sample_only() {
  let timing = HttpTiming {
    request_ms: 5.0,
    handshake_ms: Some(2.0),
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
    Some(Measurement::HttpPublicHikari)
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
    None,
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
    Some("dns lookup failed".into()),
    Some(CheckEventFailStage::Dns)
  );
  assert!(matches!(event.fail_stage, Some(CheckEventFailStage::Dns)));
  assert_eq!(event.reason.as_deref(), Some("dns lookup failed"));
  assert_eq!(event.http_status, None);
}

#[test]
fn check_event_takes_the_fail_stage_reported_by_the_measurement() {
  let event = build_check_event(
    "europe-west4",
    Network::Public,
    1_700_000_000_000.0,
    Some(2.0),
    Some(38.0),
    None,
    Routing::default(),
    None,
    Some("http handshake failed".into()),
    Some(CheckEventFailStage::Http)
  );
  assert!(matches!(event.fail_stage, Some(CheckEventFailStage::Http)));
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
    Some("status 503".into()),
    None
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
  let networks: Vec<Network> = super::EXTERNAL_CHECKS
    .iter()
    .map(|check| check.network())
    .collect();
  assert_eq!(networks, vec![Network::Public, Network::Proxied]);
  assert!(!networks.contains(&Network::Private));
}
