CREATE TABLE IF NOT EXISTS error_events (
  time    DateTime64(3),
  src     LowCardinality(String),
  dst     LowCardinality(String),
  network LowCardinality(String),
  origin  LowCardinality(String),
  reason  String
)
ENGINE = MergeTree
ORDER BY (dst, network, src, time)
PARTITION BY toYYYYMMDD(time)
TTL toDateTime(time) + INTERVAL 30 DAY;
