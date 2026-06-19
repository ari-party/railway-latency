CREATE TABLE IF NOT EXISTS mtr_events (
  time    DateTime64(3),
  src     LowCardinality(String),
  dst     LowCardinality(String),
  network LowCardinality(String),
  hops    String
)
ENGINE = MergeTree
ORDER BY (dst, network, src, time)
PARTITION BY toYYYYMMDD(time)
TTL toDateTime(time) + INTERVAL 30 DAY;
