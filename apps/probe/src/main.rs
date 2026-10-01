mod buffer;
mod clock;
mod config;
mod dropped;
mod dump;
mod log;
mod measure;
mod mtr;
mod probe;
mod push;
mod queue;
mod server;
mod tls;

mod wire {
  include!(concat!(env!("OUT_DIR"), "/wire_types.rs"));
}

use std::sync::Arc;

use crate::config::Config;
use crate::probe::Queues;
use crate::queue::Queue;
use crate::wire::{ CheckEvent, ErrorEvent, ProbeSample };

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
  log::init();

  tracing::info!(git_sha = env!("GIT_SHA"), "probe starting");

  let config = Config::from_env();
  dump::init(config.dump_dir);

  let samples = Arc::new(Queue::<ProbeSample>::new("samples"));
  let errors = Arc::new(Queue::<ErrorEvent>::new("errors"));
  let checks = Arc::new(Queue::<CheckEvent>::new("checks"));
  let tls = tls::client_config();

  let queues = Queues {
    samples: samples.clone(),
    errors: errors.clone(),
    checks: checks.clone(),
  };

  match config.mode {
    config::Mode::Pull => {
      probe::start(
        &queues,
        tls,
        config.regions,
        config.environment
      ).await;

      server::serve(config.port, samples, errors, checks).await
    }

    config::Mode::Push(push_config) => {
      std::fs::create_dir_all(&push_config.buffer_dir).ok();

      probe::start_external(
        &queues,
        tls,
        push_config.targets.clone(),
        config.environment
      ).await;

      let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

      #[cfg(unix)]
      tokio::spawn(async move {
        use tokio::signal::unix::{ signal, SignalKind };
        let mut sigterm = signal(SignalKind::terminate()).expect(
          "SIGTERM handler"
        );

        tokio::select! {
          _ = sigterm.recv() => {}
          _ = tokio::signal::ctrl_c() => {}
        }

        let _ = shutdown_tx.send(true);
      });

      #[cfg(not(unix))]
      tokio::spawn(async move {
        let _ = tokio::signal::ctrl_c().await;
        let _ = shutdown_tx.send(true);
      });

      push::run(samples, errors, checks, push_config, shutdown_rx).await;
      Ok(())
    }
  }
}

#[cfg(test)]
mod tests;
