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
    (Measurement::HttpBaseline, "httpBaseline"),
    (Measurement::DnsBaseline, "dnsBaseline"),
    (Measurement::HandshakeBaseline, "handshakeBaseline"),
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
    railway_edge: None,
    cf_pop: None,
    hikari_pop: None,
    mtr: Vec::new(),
  };

  let json = serde_json::to_string(&sample).unwrap();

  assert!(json.contains(r#""measurement":"handshakeProxied""#));
  assert!(json.contains(r#""dst":"europe-west4-drams3a""#));
  assert!(json.contains(r#""ms":12.5"#));
  assert!(json.contains(r#""time":1780000000000"#));
}
