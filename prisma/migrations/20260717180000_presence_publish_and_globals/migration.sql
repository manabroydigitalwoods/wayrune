-- CreateTable
CREATE TABLE `presence_publish_versions` (
  `id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `label` VARCHAR(191) NULL,
  `snapshot_json` JSON NOT NULL,
  `created_by_user_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_publish_versions_site_id_version_key` (`site_id`, `version`),
  INDEX `presence_publish_versions_site_id_created_at_idx` (`site_id`, `created_at`),
  CONSTRAINT `presence_publish_versions_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `presence_sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `presence_global_sections` (
  `id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `slot_key` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `module_definition_id` VARCHAR(191) NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'rich_text',
  `props_json` JSON NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `position` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_global_sections_site_id_slot_key_key` (`site_id`, `slot_key`),
  INDEX `presence_global_sections_site_id_enabled_idx` (`site_id`, `enabled`),
  CONSTRAINT `presence_global_sections_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `presence_sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
