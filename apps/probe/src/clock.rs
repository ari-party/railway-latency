use std::time::{ SystemTime, UNIX_EPOCH };

pub fn epoch_millis() -> f64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as f64)
    .unwrap_or(0.0)
}
