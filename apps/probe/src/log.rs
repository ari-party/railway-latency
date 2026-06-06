use std::io;

pub fn init() {
  tracing_subscriber
    ::fmt()
    .event_format(tracing_subscriber::fmt::format().json().flatten_event(true))
    .with_writer(io::stdout)
    .with_target(false)
    .init();
}
