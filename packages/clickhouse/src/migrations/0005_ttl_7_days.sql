ALTER TABLE check_events MODIFY TTL toDateTime(time) + INTERVAL 7 DAY SETTINGS materialize_ttl_after_modify = 0;
ALTER TABLE samples MODIFY TTL toDateTime(time) + INTERVAL 7 DAY SETTINGS materialize_ttl_after_modify = 0;
ALTER TABLE error_events MODIFY TTL toDateTime(time) + INTERVAL 7 DAY SETTINGS materialize_ttl_after_modify = 0;
ALTER TABLE mtr_events MODIFY TTL toDateTime(time) + INTERVAL 7 DAY SETTINGS materialize_ttl_after_modify = 0;
