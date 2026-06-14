use std::sync::Arc;
use std::sync::OnceLock;

use rustls::crypto::ring;
use rustls::{ ClientConfig, RootCertStore };

static CONFIG: OnceLock<Arc<ClientConfig>> = OnceLock::new();

pub fn client_config() -> Arc<ClientConfig> {
  CONFIG.get_or_init(build_client_config).clone()
}

fn build_client_config() -> Arc<ClientConfig> {
  let mut roots = RootCertStore::empty();
  roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

  let config = ClientConfig::builder_with_provider(
    Arc::new(ring::default_provider())
  )
    .with_safe_default_protocol_versions()
    .expect("ring supports the default protocol versions")
    .with_root_certificates(roots)
    .with_no_client_auth();

  Arc::new(config)
}
