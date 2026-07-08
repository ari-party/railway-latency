use std::collections::HashMap;
use std::sync::{ Arc, Mutex };
use std::time::Duration;

use serde::Deserialize;
use tokio::process::Command;

use crate::wire::MtrHop;

const REPORT_CYCLES: u32 = 5;
const BETWEEN_RUNS: Duration = Duration::from_secs(2);
const RUN_TIMEOUT: Duration = Duration::from_secs(60);

// mtr writes "???" as the host of a hop that never answered within the cycle.
const NO_REPLY: &str = "???";

#[derive(Deserialize)]
struct Report {
  report: ReportBody,
}

#[derive(Deserialize)]
struct ReportBody {
  hubs: Vec<Hub>,
}

#[derive(Deserialize)]
struct Hub {
  count: u32,
  host: String,
  #[serde(rename = "Avg")]
  average_ms: f64,
}

fn parse_report(stdout: &[u8]) -> Option<Vec<Hub>> {
  serde_json
    ::from_slice::<Report>(stdout)
    .ok()
    .map(|report| report.report.hubs)
}

fn hops_from_hubs(hubs: &[Hub]) -> Vec<MtrHop> {
  hubs
    .iter()
    .map(|hub| {
      let responded = hub.host != NO_REPLY;

      MtrHop {
        hop: hub.count as f64,
        ip: responded.then(|| hub.host.clone()),
        ms: responded.then_some(hub.average_ms),
      }
    })
    .collect()
}

async fn run_mtr(host: &str, cycles: u32) -> Option<Vec<Hub>> {
  // kill_on_drop reaps a hung mtr when the timeout drops the future; without it a
  // wedged run would leak a process every cycle on a long-lived probe.
  let execution = Command::new("mtr")
    .args([
      "-4",
      "--no-dns",
      "--json",
      "--report-cycles",
      &cycles.to_string(),
      host,
    ])
    .kill_on_drop(true)
    .output();

  let output = tokio::time::timeout(RUN_TIMEOUT, execution).await.ok()?.ok()?;
  if !output.status.success() {
    return None;
  }

  parse_report(&output.stdout)
}

async fn run_once(host: &str) -> Option<Vec<Hub>> {
  run_mtr(host, REPORT_CYCLES).await
}

struct Snapshot {
  hops: Vec<MtrHop>,
  fresh: bool,
}

#[derive(Default)]
pub struct MtrRegistry {
  snapshots: Mutex<HashMap<String, Snapshot>>,
}

impl MtrRegistry {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn publish(&self, target: &str, hops: Vec<MtrHop>) {
    self
      .snapshots
      .lock()
      .unwrap()
      .insert(target.to_string(), Snapshot { hops, fresh: true });
  }

  pub fn take_fresh(&self, target: &str) -> Option<Vec<MtrHop>> {
    let mut snapshots = self.snapshots.lock().unwrap();
    let snapshot = snapshots.get_mut(target)?;

    if !snapshot.fresh {
      return None;
    }

    snapshot.fresh = false;
    Some(snapshot.hops.clone())
  }
}

// A loopback trace actually opens the raw ICMP socket, so a missing binary OR a sandbox
// that withholds CAP_NET_RAW is caught here instead of silently emitting empty paths.
pub async fn available() -> bool {
  run_mtr("127.0.0.1", 1).await.is_some()
}

pub fn track_target(registry: Arc<MtrRegistry>, key: String, host: String) {
  tokio::spawn(async move {
    loop {
      if let Some(hubs) = run_once(&host).await {
        registry.publish(&key, hops_from_hubs(&hubs));
      }

      tokio::time::sleep(BETWEEN_RUNS).await;
    }
  });
}

#[cfg(test)]
mod tests {
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
}
