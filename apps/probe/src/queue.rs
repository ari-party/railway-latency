use std::collections::VecDeque;
use std::sync::Mutex;

use serde::Serialize;

const MAX_QUEUE: usize = 5_000;

struct State<T> {
  items: VecDeque<T>,
  dropping: bool,
}

pub struct Queue<T> {
  // Identifies the queue ("samples" or "errors") in its logs so an alert
  // points at the right one.
  kind: &'static str,
  state: Mutex<State<T>>,
}

impl<T: Serialize> Queue<T> {
  pub fn new(kind: &'static str) -> Self {
    Self {
      kind,
      state: Mutex::new(State {
        items: VecDeque::new(),
        dropping: false,
      }),
    }
  }

  pub fn enqueue(&self, item: T) {
    let mut state = self.state.lock().unwrap();
    state.items.push_back(item);

    let mut dropped = false;
    while state.items.len() > MAX_QUEUE {
      state.items.pop_front();
      dropped = true;
    }

    if dropped && !state.dropping {
      crate::log::error(
        serde_json::json!({
          "event": "queue_full",
          "queue": self.kind,
          "cap": MAX_QUEUE,
        })
      );
    }
    state.dropping = dropped;
  }

  pub fn serialize_and_clear(&self) -> Vec<u8> {
    let mut state = self.state.lock().unwrap();
    match serde_json::to_vec(&state.items) {
      Ok(bytes) => {
        state.items.clear();
        bytes
      }
      Err(err) => {
        crate::log::error(
          serde_json::json!({
            "event": "error",
            "source": "serialize",
            "queue": self.kind,
            "error": err.to_string(),
          })
        );
        b"[]".to_vec()
      }
    }
  }
}
