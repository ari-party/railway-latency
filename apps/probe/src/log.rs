pub fn emit(event: serde_json::Value) {
  println!("{event}");
}

pub fn error(event: serde_json::Value) {
  eprintln!("{event}");
}
