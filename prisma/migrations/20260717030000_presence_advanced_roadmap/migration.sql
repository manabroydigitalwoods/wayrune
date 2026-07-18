-- AlterTable
ALTER TABLE `presence_pages`
  ADD COLUMN `layout_mode` VARCHAR(191) NOT NULL DEFAULT 'flow';

-- AlterTable
ALTER TABLE `presence_module_definitions`
  ADD COLUMN `style_schema_json` JSON NULL,
  ADD COLUMN `default_style_json` JSON NULL,
  ADD COLUMN `template_source` TEXT NULL,
  ADD COLUMN `module_source` TEXT NULL,
  ADD COLUMN `published_version_id` VARCHAR(191) NULL,
  ADD COLUMN `installed_from_listing_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `presence_asset_versions` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NULL,
  `asset_type` VARCHAR(191) NOT NULL,
  `asset_id` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `changelog` TEXT NULL,
  `snapshot_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_asset_versions_asset_type_asset_id_version_key` (`asset_type`, `asset_id`, `version`),
  INDEX `presence_asset_versions_organization_id_asset_type_asset_id_idx` (`organization_id`, `asset_type`, `asset_id`),
  CONSTRAINT `presence_asset_versions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `presence_marketplace_listings` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NULL,
  `source_asset_version_id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL DEFAULT 'general',
  `description` TEXT NULL,
  `price_tier` VARCHAR(191) NOT NULL DEFAULT 'free',
  `screenshots_json` JSON NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_marketplace_listings_key_key` (`key`),
  INDEX `presence_marketplace_listings_status_category_idx` (`status`, `category`),
  CONSTRAINT `presence_marketplace_listings_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `presence_marketplace_listings_source_asset_version_id_fkey` FOREIGN KEY (`source_asset_version_id`) REFERENCES `presence_asset_versions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
