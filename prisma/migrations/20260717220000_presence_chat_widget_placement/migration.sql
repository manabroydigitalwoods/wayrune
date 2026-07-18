-- AlterTable
ALTER TABLE `presence_chat_widgets`
  ADD COLUMN `position` VARCHAR(191) NOT NULL DEFAULT 'bottom-right',
  ADD COLUMN `include_paths_json` JSON NULL,
  ADD COLUMN `exclude_paths_json` JSON NULL;

-- Copy site-level placement onto the assigned widget (first site wins per widget).
UPDATE `presence_chat_widgets` w
INNER JOIN `presence_sites` s
  ON s.`organization_id` = w.`organization_id`
  AND JSON_UNQUOTE(JSON_EXTRACT(s.`settings_json`, '$.conversationWidget.widgetId')) = w.`id`
SET
  w.`position` = COALESCE(
    NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(s.`settings_json`, '$.conversationWidget.position'))), ''),
    w.`position`
  ),
  w.`include_paths_json` = COALESCE(
    JSON_EXTRACT(s.`settings_json`, '$.conversationWidget.includePaths'),
    w.`include_paths_json`
  ),
  w.`exclude_paths_json` = COALESCE(
    JSON_EXTRACT(s.`settings_json`, '$.conversationWidget.excludePaths'),
    w.`exclude_paths_json`
  ),
  w.`updated_at` = CURRENT_TIMESTAMP(3);
