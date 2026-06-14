use std::path::PathBuf;
use std::time::Duration;

pub enum Mode {
  Pull,
  Push(PushConfig),
}

pub struct PushConfig {
  pub probe_id: String,
  pub api_key: String,
  pub ingest_url: String,
  pub targets: Vec<String>,
  pub interval: Duration,
  pub batch_max: usize,
  pub buffer_dir: PathBuf,
}

pub struct Config {
  pub port: u16,
  pub region: String,
  pub environment: String,
  pub regions: Vec<String>,
  pub debug_regions: Vec<String>,
  pub dump_dir: Option<String>,
  pub mode: Mode,
}

fn split_regions(value: &str) -> Vec<String> {
  value
    .split(',')
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .collect()
}

fn read_secret_file(env_var: &str, default_path: &str) -> String {
  let path = std::env::var(env_var).unwrap_or_else(|_| default_path.into());
  std::fs
    ::read_to_string(&path)
    .unwrap_or_else(|error| panic!("read {env_var} {path}: {error}"))
    .trim()
    .to_string()
}

fn push_config(ingest_url: String) -> PushConfig {
  if crate::push::host_and_path(&ingest_url).is_none() {
    panic!("INGEST_URL must be an http(s) URL with a host, got: {ingest_url}");
  }

  let probe_id = std::env::var("PROBE_ID").unwrap_or_default();
  if probe_id.is_empty() {
    panic!(
      "PROBE_ID is required in push mode (empty id quarantines every batch)"
    );
  }

  let targets = split_regions(&std::env::var("TARGETS").unwrap_or_default());

  let interval = std::env
    ::var("PUSH_INTERVAL_MS")
    .ok()
    .and_then(|value| value.parse().ok())
    .map(Duration::from_millis)
    .unwrap_or_else(|| Duration::from_millis(5 * 1_000));

  let batch_max = std::env
    ::var("PUSH_BATCH_MAX")
    .ok()
    .and_then(|value| value.parse().ok())
    .unwrap_or(500);

  let buffer_dir = std::env
    ::var("PUSH_BUFFER_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(|_| PathBuf::from("/var/lib/probe/buffer"));

  PushConfig {
    probe_id,
    api_key: read_secret_file("API_KEY_FILE", "/etc/probe/api_key"),
    ingest_url,
    targets,
    interval,
    batch_max,
    buffer_dir,
  }
}

impl Config {
  pub fn from_env() -> Self {
    let port = std::env
      ::var("PORT")
      .ok()
      .and_then(|p| p.parse().ok())
      .unwrap_or(8080);

    let region = std::env::var("RAILWAY_REPLICA_REGION").unwrap_or_default();
    let environment = std::env
      ::var("RAILWAY_ENVIRONMENT_NAME")
      .unwrap_or_default();
    let regions = split_regions(
      &std::env::var("RAILWAY_REPLICA_REGIONS").unwrap_or_default()
    );
    let debug_regions = split_regions(
      &std::env::var("DEBUG_TARGET_REGIONS").unwrap_or_default()
    );

    let dump_dir = std::env
      ::var("RESPONSE_DUMP_DIR")
      .ok()
      .filter(|s| !s.is_empty());

    let mode = match
      std::env
        ::var("INGEST_URL")
        .ok()
        .filter(|s| !s.is_empty())
    {
      Some(ingest_url) => Mode::Push(push_config(ingest_url)),
      None => Mode::Pull,
    };

    Self {
      port,
      region,
      environment,
      regions,
      debug_regions,
      dump_dir,
      mode,
    }
  }
}

#[cfg(test)]
mod tests {
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
}
