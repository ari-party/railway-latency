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
  pub environment: String,
  pub regions: Vec<String>,
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

    let environment = std::env
      ::var("RAILWAY_ENVIRONMENT_NAME")
      .unwrap_or_default();
    let regions = split_regions(
      &std::env::var("RAILWAY_REPLICA_REGIONS").unwrap_or_default()
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
      environment,
      regions,
      dump_dir,
      mode,
    }
  }
}

#[cfg(test)]
mod tests;
