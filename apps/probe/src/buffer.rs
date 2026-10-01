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
    .iter()
    .filter_map(|path| read_segment(path))
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
mod tests;
