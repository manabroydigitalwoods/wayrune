-- Organization Identity
ALTER TABLE `organizations`
  ADD COLUMN `public_code` INT NULL,
  ADD COLUMN `subdomain` VARCHAR(191) NULL,
  ADD COLUMN `custom_domain` VARCHAR(191) NULL;

-- Backfill public_code starting at 10001 (stable order by created_at)
CREATE TEMPORARY TABLE `_org_code_assign` (
  `id` VARCHAR(191) NOT NULL,
  `code` INT NOT NULL,
  PRIMARY KEY (`id`)
);
SET @code := 10000;
INSERT INTO `_org_code_assign` (`id`, `code`)
SELECT `id`, (@code := @code + 1)
FROM `organizations`
ORDER BY `created_at` ASC, `id` ASC;
UPDATE `organizations` o
INNER JOIN `_org_code_assign` a ON a.`id` = o.`id`
SET o.`public_code` = a.`code`;
DROP TEMPORARY TABLE `_org_code_assign`;

-- Backfill subdomain from slug (strip hyphens; uniquify collisions later in app if needed)
UPDATE `organizations`
SET `subdomain` = LOWER(REPLACE(REPLACE(`slug`, '-', ''), '_', ''))
WHERE `subdomain` IS NULL AND `slug` IS NOT NULL;

-- Fix duplicate subdomains by appending public_code
UPDATE `organizations` o
INNER JOIN (
  SELECT `subdomain`, MIN(`id`) AS keep_id
  FROM `organizations`
  WHERE `subdomain` IS NOT NULL
  GROUP BY `subdomain`
  HAVING COUNT(*) > 1
) d ON o.`subdomain` = d.`subdomain` AND o.`id` <> d.keep_id
SET o.`subdomain` = CONCAT(o.`subdomain`, o.`public_code`);

ALTER TABLE `organizations`
  MODIFY COLUMN `public_code` INT NOT NULL,
  ADD UNIQUE INDEX `organizations_public_code_key` (`public_code`),
  ADD UNIQUE INDEX `organizations_subdomain_key` (`subdomain`),
  ADD UNIQUE INDEX `organizations_custom_domain_key` (`custom_domain`);

-- Digital Presence
CREATE TABLE `presence_themes` (
  `id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `preview_url` VARCHAR(191) NULL,
  `organization_id` VARCHAR(191) NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT true,
  `tokens_json` JSON NOT NULL,
  `layout_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_themes_key_key` (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `presence_sites` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `theme_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL DEFAULT 'marketing',
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `is_primary` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `presence_sites_organization_id_status_idx` (`organization_id`, `status`),
  CONSTRAINT `presence_sites_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `presence_sites_theme_id_fkey` FOREIGN KEY (`theme_id`) REFERENCES `presence_themes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `presence_pages` (
  `id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `path` VARCHAR(191) NOT NULL DEFAULT '/',
  `title` VARCHAR(191) NOT NULL,
  `seo_json` JSON NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `published_at` DATETIME(3) NULL,
  `position` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_pages_site_id_path_key` (`site_id`, `path`),
  INDEX `presence_pages_site_id_status_idx` (`site_id`, `status`),
  CONSTRAINT `presence_pages_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `presence_sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `presence_sections` (
  `id` VARCHAR(191) NOT NULL,
  `page_id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `props_json` JSON NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `presence_sections_page_id_position_idx` (`page_id`, `position`),
  CONSTRAINT `presence_sections_page_id_fkey` FOREIGN KEY (`page_id`) REFERENCES `presence_pages` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `presence_form_definitions` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `org_kind_preset` VARCHAR(191) NULL,
  `fields_json` JSON NOT NULL,
  `ingest_mode` VARCHAR(191) NOT NULL DEFAULT 'contact',
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_form_definitions_organization_id_key_key` (`organization_id`, `key`),
  INDEX `presence_form_definitions_organization_id_idx` (`organization_id`),
  CONSTRAINT `presence_form_definitions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
