use std::io;

use tracing_subscriber::EnvFilter;

pub fn init() {
  let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_|
    EnvFilter::new("info,probe=debug")
  );

  tracing_subscriber
    ::fmt()
    .with_env_filter(filter)
    .event_format(tracing_subscriber::fmt::format().json().flatten_event(true))
    .with_writer(io::stdout)
    .with_target(false)
    .init();
}
