use std::path::{ Path, PathBuf };
use std::sync::atomic::{ AtomicU64, Ordering };
use std::sync::OnceLock;
use std::time::{ SystemTime, UNIX_EPOCH };

use time::macros::format_description;
use time::OffsetDateTime;

static DIR: OnceLock<PathBuf> = OnceLock::new();
static WRITES: AtomicU64 = AtomicU64::new(0);

const MAX_FILES: usize = 1000;

const PRUNE_INTERVAL: u64 = 64;

pub fn init(dir: Option<String>) {
  let Some(dir) = dir else {
    return;
  };

  let path = PathBuf::from(dir);
  if std::fs::create_dir_all(&path).is_ok() {
    let _ = DIR.set(path);
  }
}

pub fn record(kind: &'static str, request_id: Option<&str>, response: String) {
  let Some(dir) = DIR.get() else {
    return;
  };

  let path = dir.join(file_name(kind, request_id));
  let dir = dir.clone();

  tokio::spawn(async move {
    let _ = tokio::fs::write(path, response).await;

    if WRITES.fetch_add(1, Ordering::Relaxed).is_multiple_of(PRUNE_INTERVAL) {
      prune(&dir).await;
    }
  });
}

fn file_name(kind: &str, request_id: Option<&str>) -> String {
  let id = match request_id {
    Some(id) if !id.is_empty() => sanitize(id),
    _ => random_letters(),
  };

  format!("{kind}_{id}_{}.txt", timestamp())
}

fn sanitize(id: &str) -> String {
  id.chars()
    .map(|c| {
      if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
        c
      } else {
        '-'
      }
    })
    .take(64)
    .collect()
}

fn random_letters() -> String {
  let mut n = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.subsec_nanos())
    .unwrap_or(0);

  (0..3)
    .map(|_| {
      let letter = (b'a' + ((n % 26) as u8)) as char;
      n /= 26;
      letter
    })
    .collect()
}

fn timestamp() -> String {
  OffsetDateTime::now_utc()
    .format(
      format_description!("[year]-[month]-[day]T[hour]-[minute]-[second]Z")
    )
    .unwrap_or_default()
}

async fn prune(dir: &Path) {
  let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
    return;
  };

  let mut files: Vec<(SystemTime, PathBuf)> = Vec::new();
  while let Ok(Some(entry)) = entries.next_entry().await {
    if let Ok(meta) = entry.metadata().await {
      if meta.is_file() {
        files.push((meta.modified().unwrap_or(UNIX_EPOCH), entry.path()));
      }
    }
  }

  if files.len() <= MAX_FILES {
    return;
  }

  files.sort_by_key(|(modified, _)| *modified);
  let excess = files.len() - MAX_FILES;
  for (_, path) in files.into_iter().take(excess) {
    let _ = tokio::fs::remove_file(path).await;
  }
}
