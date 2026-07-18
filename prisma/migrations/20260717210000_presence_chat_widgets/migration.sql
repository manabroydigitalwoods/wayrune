-- CreateTable
CREATE TABLE `presence_chat_widgets` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `public_key` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `brand_name` VARCHAR(191) NULL,
    `primary_color` VARCHAR(191) NULL,
    `whatsapp_number` VARCHAR(191) NULL,
    `default_greeting` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `presence_chat_widgets_public_key_key`(`public_key`),
    INDEX `presence_chat_widgets_organization_id_enabled_idx`(`organization_id`, `enabled`),
    UNIQUE INDEX `presence_chat_widgets_organization_id_key_key`(`organization_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `presence_chat_widgets` ADD CONSTRAINT `presence_chat_widgets_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate Integrations conversationWidget → default Presence widgets (when key present or enabled).
INSERT IGNORE INTO `presence_chat_widgets` (
  `id`,
  `organization_id`,
  `key`,
  `name`,
  `public_key`,
  `enabled`,
  `brand_name`,
  `primary_color`,
  `whatsapp_number`,
  `default_greeting`,
  `created_at`,
  `updated_at`
)
SELECT
  CONCAT('mig_widget_', o.`id`),
  o.`id`,
  'default',
  'Default',
  COALESCE(
    NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(o.`settings_json`, '$.integrations.conversationWidget.publicKey'))), ''),
    CONCAT('cp_widget_mig_', LOWER(SUBSTRING(MD5(o.`id`), 1, 12)))
  ),
  CASE
    WHEN JSON_EXTRACT(o.`settings_json`, '$.integrations.conversationWidget.enabled') = true THEN true
    WHEN JSON_UNQUOTE(JSON_EXTRACT(o.`settings_json`, '$.integrations.conversationWidget.enabled')) = 'true' THEN true
    ELSE false
  END,
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(o.`settings_json`, '$.integrations.conversationWidget.brandName'))), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(o.`settings_json`, '$.integrations.conversationWidget.primaryColor'))), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(o.`settings_json`, '$.integrations.conversationWidget.whatsappNumber'))), ''),
  NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(o.`settings_json`, '$.integrations.conversationWidget.defaultGreeting'))), ''),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `organizations` o
WHERE o.`deleted_at` IS NULL
  AND (
    NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(o.`settings_json`, '$.integrations.conversationWidget.publicKey'))), '') IS NOT NULL
    OR JSON_EXTRACT(o.`settings_json`, '$.integrations.conversationWidget.enabled') = true
    OR JSON_UNQUOTE(JSON_EXTRACT(o.`settings_json`, '$.integrations.conversationWidget.enabled')) = 'true'
  );

-- Attach migrated default widget to sites missing widgetId.
UPDATE `presence_sites` s
INNER JOIN `presence_chat_widgets` w
  ON w.`organization_id` = s.`organization_id` AND w.`key` = 'default'
SET
  s.`settings_json` = JSON_SET(
    COALESCE(s.`settings_json`, JSON_OBJECT()),
    '$.conversationWidget',
    JSON_MERGE_PATCH(
      COALESCE(JSON_EXTRACT(s.`settings_json`, '$.conversationWidget'), JSON_OBJECT()),
      JSON_OBJECT('widgetId', w.`id`)
    )
  ),
  s.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE
  JSON_EXTRACT(s.`settings_json`, '$.conversationWidget.widgetId') IS NULL
  OR TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.`settings_json`, '$.conversationWidget.widgetId')), '')) = '';
