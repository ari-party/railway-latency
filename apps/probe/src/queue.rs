use std::collections::VecDeque;
use std::sync::Mutex;

use crate::wire::ProbeSample;

const MAX_QUEUE: usize = 5_000;

struct State {
  samples: VecDeque<ProbeSample>,
  dropping: bool,
}

pub struct SampleQueue {
  state: Mutex<State>,
}

impl SampleQueue {
  pub fn new() -> Self {
    Self {
      state: Mutex::new(State {
        samples: VecDeque::new(),
        dropping: false,
      }),
    }
  }

  pub fn enqueue(&self, sample: ProbeSample) {
    let mut state = self.state.lock().unwrap();
    state.samples.push_back(sample);

    let mut dropped = false;
    while state.samples.len() > MAX_QUEUE {
      state.samples.pop_front();
      dropped = true;
    }

    if dropped && !state.dropping {
      crate::log::error(
        serde_json::json!({
          "event": "queue_full",
          "cap": MAX_QUEUE,
        })
      );
    }
    state.dropping = dropped;
  }

  pub fn serialize_and_clear(&self) -> Vec<u8> {
    let mut state = self.state.lock().unwrap();
    match serde_json::to_vec(&state.samples) {
      Ok(bytes) => {
        state.samples.clear();
        bytes
      }
      Err(err) => {
        crate::log::error(
          serde_json::json!({
            "event": "error",
            "source": "serialize_samples",
            "error": err.to_string(),
          })
        );
        b"[]".to_vec()
      }
    }
  }
}
