use super::{ hops_from_hubs, parse_report, MtrRegistry };

const SAMPLE: &str =
  r#"{"report":{"mtr":{"src":"probe","dst":"echo"},"hubs":[
    {"count":1,"host":"10.0.0.1","Loss%":0.0,"Avg":0.5},
    {"count":2,"host":"???","Loss%":100.0,"Avg":0.0},
    {"count":3,"host":"203.0.113.7","Loss%":0.0,"Avg":12.3}
  ]}}"#;

#[test]
fn parses_hubs_from_report() {
  let hubs = parse_report(SAMPLE.as_bytes()).unwrap();
  assert_eq!(hubs.len(), 3);
  assert_eq!(hubs[0].host, "10.0.0.1");
  assert_eq!(hubs[2].average_ms, 12.3);
}

#[test]
fn malformed_json_yields_no_hubs() {
  assert!(parse_report(b"not json").is_none());
}

#[test]
fn responding_hop_keeps_ip_and_latency() {
  let hubs = parse_report(SAMPLE.as_bytes()).unwrap();
  let hops = hops_from_hubs(&hubs);

  assert_eq!(hops[0].hop, 1.0);
  assert_eq!(hops[0].ip.as_deref(), Some("10.0.0.1"));
  assert_eq!(hops[0].ms, Some(0.5));
}

#[test]
fn silent_hop_drops_ip_and_latency_but_keeps_position() {
  let hubs = parse_report(SAMPLE.as_bytes()).unwrap();
  let hops = hops_from_hubs(&hubs);

  assert_eq!(hops[1].hop, 2.0);
  assert_eq!(hops[1].ip, None);
  assert_eq!(hops[1].ms, None);
}

#[test]
fn fresh_snapshot_is_handed_out_once() {
  let registry = MtrRegistry::new();
  let hops = hops_from_hubs(&parse_report(SAMPLE.as_bytes()).unwrap());

  registry.publish("echo", hops.clone());

  assert_eq!(registry.take_fresh("echo"), Some(hops.clone()));
  assert_eq!(registry.take_fresh("echo"), None);

  registry.publish("echo", hops.clone());
  assert_eq!(registry.take_fresh("echo"), Some(hops));
}

#[test]
fn unknown_target_has_no_snapshot() {
  let registry = MtrRegistry::new();
  assert_eq!(registry.take_fresh("missing"), None);
}
