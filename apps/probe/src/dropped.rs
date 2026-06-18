use crate::wire::{ CheckEvent, ErrorEvent, ProbeSample };

pub trait LogOnDrop {
  fn log_dropped(&self, queue: &'static str, reason: &'static str);
}

impl LogOnDrop for ErrorEvent {
  fn log_dropped(&self, queue: &'static str, reason: &'static str) {
    tracing::error!(
      event = "dropped",
      queue,
      dropReason = reason,
      dst = %self.dst,
      network = ?self.network,
      probeReason = %self.reason,
      time = self.time,
      "error event dropped before ingest",
    );
  }
}

impl LogOnDrop for CheckEvent {
  fn log_dropped(&self, queue: &'static str, reason: &'static str) {
    if self.fail_stage.is_none() && self.reason.is_none() {
      return;
    }

    tracing::error!(
      event = "dropped",
      queue,
      dropReason = reason,
      dst = %self.dst,
      network = ?self.network,
      failStage = ?self.fail_stage,
      probeReason = self.reason.as_deref(),
      time = self.time,
      "failed check dropped before ingest",
    );
  }
}

impl LogOnDrop for ProbeSample {
  fn log_dropped(&self, queue: &'static str, reason: &'static str) {
    tracing::warn!(
      event = "dropped",
      queue,
      dropReason = reason,
      measurement = ?self.measurement,
      dst = %self.dst,
      ms = self.ms,
      time = self.time,
      "sample dropped before ingest",
    );
  }
}

#[cfg(test)]
impl LogOnDrop for u32 {
  fn log_dropped(&self, _queue: &'static str, _reason: &'static str) {}
}
