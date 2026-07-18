ALTER TABLE `presence_themes`
  DROP INDEX `presence_themes_key_key`,
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'published',
  ADD COLUMN `tokens_schema_json` JSON NULL,
  ADD COLUMN `schema_json` JSON NULL,
  ADD COLUMN `regions_json` JSON NULL,
  ADD COLUMN `preview_assets_json` JSON NULL,
  ADD UNIQUE INDEX `presence_themes_organization_id_key_key` (`organization_id`, `key`),
  ADD INDEX `presence_themes_organization_id_status_idx` (`organization_id`, `status`);

ALTER TABLE `presence_sites`
  ADD COLUMN `template_id` VARCHAR(191) NULL,
  ADD COLUMN `home_page_id` VARCHAR(191) NULL,
  ADD COLUMN `primary_domain` VARCHAR(191) NULL,
  ADD COLUMN `settings_json` JSON NULL,
  ADD COLUMN `navigation_json` JSON NULL,
  ADD COLUMN `global_regions_json` JSON NULL,
  ADD COLUMN `published_snapshot_json` JSON NULL,
  ADD UNIQUE INDEX `presence_sites_home_page_id_key` (`home_page_id`),
  ADD INDEX `presence_sites_organization_id_primary_domain_idx` (`organization_id`, `primary_domain`);

ALTER TABLE `presence_pages`
  ADD COLUMN `template_id` VARCHAR(191) NULL,
  ADD COLUMN `layout_key` VARCHAR(191) NULL,
  ADD COLUMN `draft_json` JSON NULL,
  ADD COLUMN `published_snapshot_json` JSON NULL;

ALTER TABLE `presence_sections`
  ADD COLUMN `parent_id` VARCHAR(191) NULL,
  ADD COLUMN `slot_key` VARCHAR(191) NULL,
  ADD COLUMN `module_definition_id` VARCHAR(191) NULL,
  ADD INDEX `presence_sections_parent_id_position_idx` (`parent_id`, `position`);

CREATE TABLE `presence_module_definitions` (
  `id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `renderer_key` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT false,
  `status` VARCHAR(191) NOT NULL DEFAULT 'published',
  `schema_json` JSON NULL,
  `default_props_json` JSON NOT NULL,
  `preview_json` JSON NULL,
  `assets_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_module_definitions_organization_id_key_key` (`organization_id`, `key`),
  INDEX `presence_module_definitions_category_status_idx` (`category`, `status`),
  CONSTRAINT `presence_module_definitions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `presence_site_templates` (
  `id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL DEFAULT 'marketing',
  `organization_id` VARCHAR(191) NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT false,
  `status` VARCHAR(191) NOT NULL DEFAULT 'published',
  `description` TEXT NULL,
  `preview_url` VARCHAR(191) NULL,
  `recommended_theme_keys_json` JSON NULL,
  `structure_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_site_templates_organization_id_key_key` (`organization_id`, `key`),
  INDEX `presence_site_templates_category_status_idx` (`category`, `status`),
  CONSTRAINT `presence_site_templates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `presence_page_templates` (
  `id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL DEFAULT 'page',
  `organization_id` VARCHAR(191) NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT false,
  `status` VARCHAR(191) NOT NULL DEFAULT 'published',
  `description` TEXT NULL,
  `preview_url` VARCHAR(191) NULL,
  `layout_key` VARCHAR(191) NULL,
  `structure_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_page_templates_organization_id_key_key` (`organization_id`, `key`),
  INDEX `presence_page_templates_category_status_idx` (`category`, `status`),
  CONSTRAINT `presence_page_templates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `presence_sites`
  ADD CONSTRAINT `presence_sites_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `presence_site_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `presence_sites_home_page_id_fkey` FOREIGN KEY (`home_page_id`) REFERENCES `presence_pages` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `presence_pages`
  ADD CONSTRAINT `presence_pages_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `presence_page_templates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `presence_sections`
  ADD CONSTRAINT `presence_sections_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `presence_sections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `presence_sections_module_definition_id_fkey` FOREIGN KEY (`module_definition_id`) REFERENCES `presence_module_definitions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
