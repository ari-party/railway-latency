CREATE TABLE IF NOT EXISTS check_events (
  time           DateTime64(3),
  src            LowCardinality(String),
  dst            LowCardinality(String),
  network        LowCardinality(String),
  fail_stage     LowCardinality(String),
  reason         String,
  dns_ms         Nullable(Float32),
  handshake_ms   Nullable(Float32),
  http_ms        Nullable(Float32),
  http_status    Nullable(UInt16),
  railway_edge   LowCardinality(String),
  cf_pop         LowCardinality(String),
  hikari_pop     LowCardinality(String),
  request_id     String,
  headers        Map(String, String),
  body           String,
  body_truncated Bool
)
ENGINE = MergeTree
ORDER BY (dst, network, src, time)
PARTITION BY toYYYYMMDD(time)
TTL toDateTime(time) + INTERVAL 30 DAY;
