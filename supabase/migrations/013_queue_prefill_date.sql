-- Visit date carried from imported data (CSV Date column / smart parse);
-- prefills the visit-date picker when rating the import.
ALTER TABLE import_queue ADD COLUMN IF NOT EXISTS prefill_date DATE;
