pub struct Config {
  pub port: u16,
  pub regions: Vec<String>,
}

impl Config {
  pub fn from_env() -> Self {
    let port = std::env
      ::var("PORT")
      .ok()
      .and_then(|p| p.parse().ok())
      .unwrap_or(8080);

    let regions = std::env
      ::var("RAILWAY_REPLICA_REGIONS")
      .unwrap_or_default()
      .split(',')
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .collect();

    Self { port, regions }
  }
}
