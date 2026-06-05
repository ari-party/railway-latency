use std::sync::Arc;

use rustls::crypto::ring;
use rustls::{ ClientConfig, RootCertStore };

pub fn client_config() -> Arc<ClientConfig> {
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
