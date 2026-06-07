pub struct Config {
  pub port: u16,
  pub region: String,
  pub environment: String,
  pub regions: Vec<String>,
  pub debug_regions: Vec<String>,
  pub dump_dir: Option<String>,
}

fn split_regions(value: &str) -> Vec<String> {
  value
    .split(',')
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .collect()
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

    Self {
      port,
      region,
      environment,
      regions,
      debug_regions,
      dump_dir,
    }
  }
}
