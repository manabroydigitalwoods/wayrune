-- Canonical Inquiry origin as PlaceRef (parallel to destinations_json / stops_json).
-- Legacy origin + origin_place_id remain for read fallback until backfill is verified.

ALTER TABLE `inquiries` ADD COLUMN `origin_json` JSON NULL;

-- Best-effort backfill: preserve display name; keep place id when present (no guessing).
UPDATE `inquiries`
SET `origin_json` = JSON_OBJECT(
  'placeId', `origin_place_id`,
  'name', `origin`
)
WHERE `origin_json` IS NULL
  AND `origin` IS NOT NULL
  AND TRIM(`origin`) <> '';
