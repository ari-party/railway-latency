ALTER TABLE check_events MODIFY COLUMN headers Map(String, String) CODEC(ZSTD);
ALTER TABLE check_events MODIFY COLUMN body String CODEC(ZSTD);
