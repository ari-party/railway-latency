ALTER TABLE check_events MODIFY TTL toDateTime(time) + INTERVAL 7 DAY;
ALTER TABLE samples MODIFY TTL toDateTime(time) + INTERVAL 7 DAY;
ALTER TABLE error_events MODIFY TTL toDateTime(time) + INTERVAL 7 DAY;
ALTER TABLE mtr_events MODIFY TTL toDateTime(time) + INTERVAL 7 DAY;
