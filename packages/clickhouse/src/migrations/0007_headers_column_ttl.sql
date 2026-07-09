ALTER TABLE check_events
MODIFY COLUMN headers Map(String, String) CODEC(ZSTD)
TTL toDateTime(time) + toIntervalHour(if(coalesce(http_status, 0) BETWEEN 200 AND 299, 3, 168))
SETTINGS materialize_ttl_after_modify = 0;
