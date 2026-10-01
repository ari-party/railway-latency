use super::{ split_regions, Config, Mode };
use std::sync::Mutex;
use std::time::Duration;

static ENV_LOCK: Mutex<()> = Mutex::new(());

fn clear_push_env() {
  for key in [
    "INGEST_URL",
    "PROBE_ID",
    "TARGETS",
    "PUSH_INTERVAL_MS",
    "PUSH_BATCH_MAX",
    "PUSH_BUFFER_DIR",
    "API_KEY_FILE",
  ] {
    std::env::remove_var(key);
  }
}

#[test]
fn splits_and_trims_csv() {
  assert_eq!(split_regions(" a, b ,,c "), vec!["a", "b", "c"]);
  assert!(split_regions("").is_empty());
}

#[test]
fn unset_ingest_url_is_pull_mode() {
  let _guard = ENV_LOCK.lock().unwrap();
  clear_push_env();
  let config = Config::from_env();
  assert!(matches!(config.mode, Mode::Pull));
}

#[test]
fn ingest_url_selects_push_mode_with_defaults() {
  let _guard = ENV_LOCK.lock().unwrap();

  let directory = std::env::temp_dir().join("probe-config-test");
  std::fs::create_dir_all(&directory).unwrap();
  let key_path = directory.join("api_key");
  std::fs::write(&key_path, "  rl_asia-hcloud-sin1_abc \n").unwrap();

  clear_push_env();
  std::env::set_var("INGEST_URL", "https://ingest.example/ingest");
  std::env::set_var("PROBE_ID", "asia-hcloud-sin1");
  std::env::set_var("TARGETS", "europe-west4-drams3a, us-east4-eqdc4a");
  std::env::set_var("API_KEY_FILE", &key_path);

  let config = Config::from_env();
  clear_push_env();

  let Mode::Push(push) = config.mode else {
    panic!("expected push mode");
  };
  assert_eq!(push.probe_id, "asia-hcloud-sin1");
  assert_eq!(push.api_key, "rl_asia-hcloud-sin1_abc");
  assert_eq!(push.ingest_url, "https://ingest.example/ingest");
  assert_eq!(push.targets, vec!["europe-west4-drams3a", "us-east4-eqdc4a"]);
  assert_eq!(push.interval, Duration::from_millis(5 * 1_000));
  assert_eq!(push.batch_max, 500);
  assert_eq!(push.buffer_dir.to_str().unwrap(), "/var/lib/probe/buffer");
}

#[test]
#[should_panic(expected = "INGEST_URL")]
fn malformed_ingest_url_panics_at_construction() {
  let guard = ENV_LOCK.lock().unwrap();

  let directory = std::env::temp_dir().join("probe-config-test");
  std::fs::create_dir_all(&directory).unwrap();
  let key_path = directory.join("api_key");
  std::fs::write(&key_path, "rl_asia-hcloud-sin1_abc\n").unwrap();

  clear_push_env();
  std::env::set_var("INGEST_URL", "ingest.example/ingest");
  std::env::set_var("PROBE_ID", "asia-hcloud-sin1");
  std::env::set_var("API_KEY_FILE", &key_path);

  let outcome = std::panic::catch_unwind(Config::from_env);

  clear_push_env();
  drop(guard);

  let Err(panic) = outcome else {
    panic!("expected Config::from_env to panic on malformed INGEST_URL");
  };
  std::panic::resume_unwind(panic);
}
