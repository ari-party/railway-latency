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
