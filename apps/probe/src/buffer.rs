use std::fs::{ self, File };
use std::io::Write;
use std::path::{ Path, PathBuf };
use std::sync::atomic::{ AtomicU64, Ordering };
use std::time::{ SystemTime, UNIX_EPOCH };

use serde::Serialize;

use crate::dropped::LogOnDrop;
use crate::queue::Queue;
use crate::wire::{ CheckEvent, ErrorEvent, ProbeSample };

const MAX_BUFFER_BYTES: u64 = 64 * 1024 * 1024;

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug)]
pub struct Batch {
  pub samples: Vec<ProbeSample>,
  pub errors: Vec<ErrorEvent>,
  pub checks: Vec<CheckEvent>,
}

impl Batch {
  pub fn is_empty(&self) -> bool {
    self.samples.is_empty() && self.errors.is_empty() && self.checks.is_empty()
  }
}

pub struct Segment {
  pub path: PathBuf,
  pub bytes: Vec<u8>,
}

fn epoch_millis() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0)
}

// Never name a field `type`: typify silently drops it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IngestBatch<'a> {
  probe_id: &'a str,
  samples: &'a [ProbeSample],
  errors: &'a [ErrorEvent],
  checks: &'a [CheckEvent],
}

pub fn drain_batch(
  samples: &Queue<ProbeSample>,
  errors: &Queue<ErrorEvent>,
  checks: &Queue<CheckEvent>,
  max: usize
) -> Batch {
  Batch {
    samples: samples.drain(max),
    errors: errors.drain(max),
    checks: checks.drain(max),
  }
}

pub fn spill(
  directory: &Path,
  probe_id: &str,
  batch: Batch
) -> Result<(), Batch> {
  if batch.is_empty() {
    return Ok(());
  }

  let envelope = IngestBatch {
    probe_id,
    samples: &batch.samples,
    errors: &batch.errors,
    checks: &batch.checks,
  };
  let mut line = match serde_json::to_vec(&envelope) {
    Ok(bytes) => bytes,
    Err(error) => {
      tracing::error!(
        event = "error",
        source = "spill_serialize",
        error = %error,
        "failed to serialize segment",
      );
      return Err(batch);
    }
  };
  line.push(b'\n');

  let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
  // pid keeps a restart's reset SEQUENCE from clobbering a prior segment.
  let stem = format!(
    "{}-{:010}-{sequence:020}",
    epoch_millis(),
    std::process::id()
  );
  let committed = directory.join(format!("{stem}.ndjson"));
  let temporary = directory.join(format!("{stem}.ndjson.tmp"));

  if let Err(error) = write_and_sync(&temporary, &line) {
    tracing::error!(
      event = "error",
      source = "spill_write",
      error = %error,
      "failed to write segment",
    );
    let _ = fs::remove_file(&temporary);
    return Err(batch);
  }

  if let Err(error) = fs::rename(&temporary, &committed) {
    tracing::error!(
      event = "error",
      source = "spill_rename",
      error = %error,
      "failed to commit segment",
    );
    let _ = fs::remove_file(&temporary);
    return Err(batch);
  }

  enforce_cap(directory, MAX_BUFFER_BYTES);
  Ok(())
}

fn write_and_sync(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
  let mut file = File::create(path)?;
  file.write_all(bytes)?;
  file.sync_all()?;
  Ok(())
}

fn segment_paths_oldest_first(directory: &Path) -> Vec<PathBuf> {
  let mut paths: Vec<PathBuf> = match fs::read_dir(directory) {
    Ok(entries) =>
      entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
          path.extension().and_then(|ext| ext.to_str()) == Some("ndjson")
        })
        .collect(),
    Err(_) => Vec::new(),
  };

  paths.sort();
  paths
}

pub fn oldest_segment_paths(directory: &Path) -> Vec<PathBuf> {
  segment_paths_oldest_first(directory)
}

pub fn read_segment(path: &Path) -> Option<Segment> {
  fs::read(path)
    .ok()
    .map(|bytes| Segment { path: path.to_path_buf(), bytes })
}

#[cfg(test)]
pub fn oldest_segments(directory: &Path) -> Vec<Segment> {
  segment_paths_oldest_first(directory)
    .into_iter()
    .filter_map(|path| {
      fs::read(&path)
        .ok()
        .map(|bytes| Segment { path, bytes })
    })
    .collect()
}

pub fn remove_blocking(path: &Path) {
  let _ = fs::remove_file(path);
}

pub fn quarantine(path: &Path) {
  let Some(parent) = path.parent() else {
    return;
  };
  let quarantine_dir = parent.join("quarantine");
  if fs::create_dir_all(&quarantine_dir).is_err() {
    let _ = fs::remove_file(path);
    return;
  }
  let Some(name) = path.file_name() else {
    return;
  };
  let target = quarantine_dir.join(name);
  if fs::rename(path, &target).is_err() {
    let _ = fs::remove_file(path);
  }
  tracing::warn!(
    event = "segment_quarantined",
    path = %path.display(),
    "quarantined a non-retryable segment",
  );
}

fn sized_paths(paths: Vec<PathBuf>) -> Vec<(PathBuf, u64)> {
  paths
    .into_iter()
    .map(|path| {
      let length = fs
        ::metadata(&path)
        .map(|meta| meta.len())
        .unwrap_or(0);
      (path, length)
    })
    .collect()
}

pub fn enforce_cap(directory: &Path, cap: u64) {
  let quarantined = sized_paths(
    segment_paths_oldest_first(&directory.join("quarantine"))
  );
  let live = sized_paths(segment_paths_oldest_first(directory));

  let quarantined_bytes: u64 = quarantined
    .iter()
    .map(|(_, length)| length)
    .sum();
  let live_bytes: u64 = live
    .iter()
    .map(|(_, length)| length)
    .sum();
  let mut total = quarantined_bytes + live_bytes;
  let mut dropped = false;

  for (path, length) in quarantined.into_iter().chain(live) {
    if total <= cap {
      break;
    }
    log_dropped_segment(&path, "buffer_full");
    total -= length;
    remove_blocking(&path);
    dropped = true;
  }

  if dropped {
    tracing::error!(
      event = "buffer_full",
      cap = cap,
      "buffer over cap, dropping oldest segments"
    );
  }
}

fn log_dropped_segment(path: &Path, reason: &'static str) {
  let Ok(bytes) = fs::read(path) else {
    return;
  };

  let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
    tracing::error!(
      event = "dropped",
      dropReason = reason,
      queue = "buffer",
      path = %path.display(),
      "dropped buffered segment before ingest",
    );
    return;
  };

  if let Some(errors) = value.get("errors").and_then(|v| v.as_array()) {
    for error in errors {
      let Some(event) = parse_error_event(error) else {
        continue;
      };
      event.log_dropped("buffer", reason);
    }
  }

  if let Some(checks) = value.get("checks").and_then(|v| v.as_array()) {
    for check in checks {
      let Some(event) = parse_check_event(check) else {
        continue;
      };
      event.log_dropped("buffer", reason);
    }
  }
}

fn parse_error_event(value: &serde_json::Value) -> Option<ErrorEvent> {
  Some(ErrorEvent {
    dst: value.get("dst")?.as_str()?.to_string(),
    network: serde_json::from_value(value.get("network")?.clone()).ok()?,
    time: value.get("time")?.as_f64()?,
    reason: value.get("reason")?.as_str()?.to_string(),
  })
}

fn parse_check_event(value: &serde_json::Value) -> Option<CheckEvent> {
  Some(CheckEvent {
    dst: value.get("dst")?.as_str()?.to_string(),
    network: serde_json::from_value(value.get("network")?.clone()).ok()?,
    time: value.get("time")?.as_f64()?,
    fail_stage: value
      .get("failStage")
      .and_then(|v| serde_json::from_value(v.clone()).ok()),
    reason: value
      .get("reason")
      .and_then(|v| v.as_str())
      .map(str::to_string),
    dns_ms: value.get("dnsMs").and_then(|v| v.as_f64()),
    handshake_ms: value.get("handshakeMs").and_then(|v| v.as_f64()),
    http_ms: value.get("httpMs").and_then(|v| v.as_f64()),
    http_status: value.get("httpStatus").and_then(|v| v.as_f64()),
    railway_edge: value
      .get("railwayEdge")
      .and_then(|v| v.as_str())
      .map(str::to_string),
    cf_pop: value.get("cfPop").and_then(|v| v.as_str()).map(str::to_string),
    hikari_pop: value
      .get("hikariPop")
      .and_then(|v| v.as_str())
      .map(str::to_string),
    request_id: value
      .get("requestId")
      .and_then(|v| v.as_str())
      .map(str::to_string),
    headers: value
      .get("headers")
      .and_then(|v| serde_json::from_value(v.clone()).ok())
      .unwrap_or_default(),
    body: value
      .get("body")
      .and_then(|v| v.as_str())
      .map(str::to_string),
    body_truncated: value.get("bodyTruncated").and_then(|v| v.as_bool()),
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn unique_dir(label: &str) -> PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    let dir = std::env
      ::temp_dir()
      .join(format!("probe-buffer-{label}-{nanos}"));
    fs::create_dir_all(&dir).unwrap();
    dir
  }

  fn sample(time: f64) -> ProbeSample {
    ProbeSample {
      measurement: crate::wire::Measurement::HttpPublic,
      dst: "europe-west4-drams3a".to_string(),
      time,
      ms: 1.0,
      railway_edge: None,
      cf_pop: None,
      hikari_pop: None,
      mtr: Vec::new(),
    }
  }

  fn sample_check(time: f64) -> CheckEvent {
    CheckEvent {
      dst: "europe-west4".to_string(),
      network: crate::wire::Network::Public,
      time,
      fail_stage: None,
      reason: None,
      dns_ms: Some(2.0),
      handshake_ms: Some(38.0),
      http_ms: Some(312.0),
      http_status: Some(200.0),
      railway_edge: None,
      cf_pop: None,
      hikari_pop: None,
      request_id: None,
      headers: Default::default(),
      body: None,
      body_truncated: None,
    }
  }

  #[test]
  fn spill_writes_one_committed_ndjson_segment_with_no_tmp_left() {
    let dir = unique_dir("spill");
    let batch = Batch {
      samples: vec![sample(1.0)],
      errors: vec![],
      checks: vec![],
    };

    spill(&dir, "asia-hcloud-sin1", batch).unwrap();

    let entries: Vec<_> = fs
      ::read_dir(&dir)
      .unwrap()
      .map(|e| e.unwrap().path())
      .collect();
    let committed: Vec<_> = entries
      .iter()
      .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("ndjson"))
      .collect();
    let tmp: Vec<_> = entries
      .iter()
      .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("tmp"))
      .collect();

    assert_eq!(committed.len(), 1, "exactly one committed segment");
    assert!(tmp.is_empty(), "no .tmp left after atomic rename");

    let contents = fs::read_to_string(committed[0]).unwrap();
    assert_eq!(contents.lines().count(), 1);
    assert!(contents.contains(r#""probeId":"asia-hcloud-sin1""#));
    assert!(contents.contains(r#""samples""#));
  }

  #[test]
  fn oldest_segments_orders_by_filename_oldest_first() {
    let dir = unique_dir("order");
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(1.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(2.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(3.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();

    let segments = oldest_segments(&dir);
    assert_eq!(segments.len(), 3);

    let mut names: Vec<String> = segments
      .iter()
      .map(|s| s.path.file_name().unwrap().to_str().unwrap().to_string())
      .collect();
    let mut sorted = names.clone();
    sorted.sort();
    assert_eq!(names, sorted, "returned in ascending filename order");

    let first = String::from_utf8(segments[0].bytes.clone()).unwrap();
    assert!(first.contains(r#""time":1"#));
    names.clear();
  }

  #[test]
  fn segment_names_carry_pid_and_stay_unique_within_a_run() {
    let dir = unique_dir("pid-name");
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(1.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(2.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();

    let pid = format!("{:010}", std::process::id());
    let names: Vec<String> = oldest_segments(&dir)
      .iter()
      .map(|s| s.path.file_name().unwrap().to_str().unwrap().to_string())
      .collect();

    assert_eq!(names.len(), 2);
    assert!(
      names.iter().all(|n| n.contains(&pid)),
      "pid is in the name"
    );
    assert_ne!(names[0], names[1], "same-millisecond spills do not collide");
  }

  #[test]
  fn partial_tmp_is_ignored_and_does_not_break_ordering() {
    let dir = unique_dir("partial");
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(1.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();

    let mut tmp = File::create(dir.join("9999999999-0.ndjson.tmp")).unwrap();
    tmp.write_all(b"{ partial").unwrap();
    drop(tmp);

    let segments = oldest_segments(&dir);
    assert_eq!(segments.len(), 1, "only the committed segment is visible");
  }

  #[test]
  fn remove_deletes_an_acked_segment() {
    let dir = unique_dir("remove");
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(1.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();
    let segments = oldest_segments(&dir);
    assert_eq!(segments.len(), 1);

    remove_blocking(&segments[0].path);
    assert!(oldest_segments(&dir).is_empty());
  }

  #[test]
  fn quarantine_moves_a_poisoned_segment_out_of_replay() {
    let dir = unique_dir("quarantine");
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(1.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();
    let segments = oldest_segments(&dir);

    quarantine(&segments[0].path);

    assert!(oldest_segments(&dir).is_empty(), "no longer replayed");
    let quarantined: Vec<_> = fs
      ::read_dir(dir.join("quarantine"))
      .unwrap()
      .map(|e| e.unwrap().path())
      .collect();
    assert_eq!(quarantined.len(), 1, "moved into the quarantine subdir");
  }

  #[test]
  fn enforce_cap_drops_oldest_when_over_budget() {
    let dir = unique_dir("cap");
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(1.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(2.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(3.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();

    let before = oldest_segments(&dir);
    let total: u64 = before
      .iter()
      .map(|s| s.bytes.len() as u64)
      .sum();
    let cap = total - (before[0].bytes.len() as u64);

    enforce_cap(&dir, cap);

    let after = oldest_segments(&dir);
    assert_eq!(after.len(), 2, "oldest dropped to fit the cap");
    let first = String::from_utf8(after[0].bytes.clone()).unwrap();
    assert!(first.contains(r#""time":2"#), "kept the two newest");
  }

  #[test]
  fn spill_failure_returns_the_batch_so_it_is_not_lost() {
    let dir = unique_dir("spill-fail").join("does-not-exist");

    let batch = Batch {
      samples: vec![sample(7.0)],
      errors: vec![],
      checks: vec![],
    };
    let returned = spill(&dir, "asia-hcloud-sin1", batch);

    let Err(returned) = returned else {
      panic!("spill into a missing directory should fail");
    };
    assert_eq!(
      returned.samples.len(),
      1,
      "the drained batch is handed back intact"
    );
    assert_eq!(returned.samples[0].time, 7.0);
  }

  #[test]
  fn enforce_cap_prunes_quarantine_before_live_segments() {
    let dir = unique_dir("quarantine-cap");
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(1.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();
    spill(&dir, "asia-hcloud-sin1", Batch {
      samples: vec![sample(2.0)],
      errors: vec![],
      checks: vec![],
    }).unwrap();

    let segments = oldest_segments(&dir);
    quarantine(&segments[0].path);

    let live = oldest_segments(&dir);
    assert_eq!(live.len(), 1, "one live segment remains");
    let quarantined = oldest_segments(&dir.join("quarantine"));
    assert_eq!(quarantined.len(), 1, "one quarantined segment present");

    let live_bytes = live[0].bytes.len() as u64;
    enforce_cap(&dir, live_bytes);

    assert_eq!(oldest_segments(&dir).len(), 1, "live segment kept under cap");
    assert!(
      oldest_segments(&dir.join("quarantine")).is_empty(),
      "quarantined dead weight reclaimed first"
    );
  }

  #[test]
  fn batch_is_not_empty_when_only_checks_present() {
    let batch = Batch {
      samples: vec![],
      errors: vec![],
      checks: vec![sample_check(1_700_000_000_000.0)],
    };
    assert!(!batch.is_empty());
  }

  #[test]
  fn drain_batch_pulls_from_all_queues_up_to_max() {
    let samples = std::sync::Arc::new(Queue::<ProbeSample>::new("samples"));
    let errors = std::sync::Arc::new(Queue::<ErrorEvent>::new("errors"));
    let checks = std::sync::Arc::new(Queue::<CheckEvent>::new("checks"));
    for value in 0..5 {
      samples.enqueue(sample(value as f64));
    }
    checks.enqueue(sample_check(1_700_000_000_000.0));

    let batch = drain_batch(&samples, &errors, &checks, 3);
    assert_eq!(batch.samples.len(), 3);
    assert_eq!(batch.errors.len(), 0);
    assert_eq!(batch.checks.len(), 1);
    assert!(!batch.is_empty());

    let rest = drain_batch(&samples, &errors, &checks, 10);
    assert_eq!(rest.samples.len(), 2);
    assert_eq!(rest.checks.len(), 0);
  }
}
