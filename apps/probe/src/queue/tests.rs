use super::Queue;
use crate::dropped::LogOnDrop;

impl LogOnDrop for u32 {
  fn log_dropped(&self, _queue: &'static str, _reason: &'static str) {}
}

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
