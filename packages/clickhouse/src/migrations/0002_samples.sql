CREATE TABLE IF NOT EXISTS samples (
  time         DateTime64(3),
  src          LowCardinality(String),
  dst          LowCardinality(String),
  measurement  LowCardinality(String),
  origin       LowCardinality(String),
  ms           Float32,
  railway_edge LowCardinality(String),
  cf_pop       LowCardinality(String),
  hikari_pop   LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY (dst, measurement, src, time)
PARTITION BY toYYYYMMDD(time)
TTL toDateTime(time) + INTERVAL 30 DAY;
