use std::collections::VecDeque;
use std::sync::Mutex;

use serde::Serialize;

use crate::dropped::LogOnDrop;

const MAX_QUEUE: usize = 5_000;

struct State<T> {
  items: VecDeque<T>,
  dropping: bool,
}

pub struct Queue<T> {
  kind: &'static str,
  state: Mutex<State<T>>,
}

impl<T: Serialize + LogOnDrop> Queue<T> {
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
      if let Some(evicted) = state.items.pop_front() {
        evicted.log_dropped(self.kind, "queue_full");
      }
      dropped = true;
    }

    if dropped && !state.dropping {
      tracing::error!(
        event = "queue_full",
        queue = self.kind,
        cap = MAX_QUEUE,
        "queue full, dropping oldest events",
      );
    }
    state.dropping = dropped;
  }

  pub fn drain(&self, max: usize) -> Vec<T> {
    let mut state = self.state.lock().unwrap();
    let take = max.min(state.items.len());
    state.items.drain(..take).collect()
  }

  pub fn requeue_front(&self, items: Vec<T>) {
    let mut state = self.state.lock().unwrap();
    for item in items.into_iter().rev() {
      state.items.push_front(item);
    }

    let mut dropped = false;
    while state.items.len() > MAX_QUEUE {
      if let Some(evicted) = state.items.pop_back() {
        evicted.log_dropped(self.kind, "queue_full");
      }
      dropped = true;
    }

    if dropped && !state.dropping {
      tracing::error!(
        event = "queue_full",
        queue = self.kind,
        cap = MAX_QUEUE,
        "queue full, dropping newest events on requeue",
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
      Err(error) => {
        tracing::error!(
          event = "error",
          source = "serialize",
          queue = self.kind,
          error = %error,
          "failed to serialize queue",
        );
        b"[]".to_vec()
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::Queue;

  #[test]
  fn drain_pops_oldest_first_up_to_max() {
    let queue = Queue::<u32>::new("test");
    for value in 0..5 {
      queue.enqueue(value);
    }

    let first = queue.drain(3);
    assert_eq!(first, vec![0, 1, 2]);

    let rest = queue.drain(10);
    assert_eq!(rest, vec![3, 4]);

    assert!(queue.drain(10).is_empty());
  }

  #[test]
  fn drain_zero_returns_nothing_and_keeps_items() {
    let queue = Queue::<u32>::new("test");
    queue.enqueue(7);

    assert!(queue.drain(0).is_empty());
    assert_eq!(queue.drain(1), vec![7]);
  }

  #[test]
  fn requeue_front_restores_order_ahead_of_existing_items() {
    let queue = Queue::<u32>::new("test");
    queue.enqueue(3);
    queue.enqueue(4);

    queue.requeue_front(vec![1, 2]);

    assert_eq!(queue.drain(10), vec![1, 2, 3, 4]);
  }
}
