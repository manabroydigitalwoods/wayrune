-- AlterTable
ALTER TABLE `presence_pages`
  ADD COLUMN `publish_at` DATETIME(3) NULL,
  ADD COLUMN `unpublish_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `presence_collections` (
  `id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `fields_json` JSON NULL,
  `listing_path` VARCHAR(191) NULL,
  `detail_path_pattern` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_collections_site_id_key_key` (`site_id`, `key`),
  INDEX `presence_collections_site_id_idx` (`site_id`),
  CONSTRAINT `presence_collections_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `presence_sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `presence_collection_entries` (
  `id` VARCHAR(191) NOT NULL,
  `collection_id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `data_json` JSON NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `published_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_collection_entries_collection_id_slug_key` (`collection_id`, `slug`),
  INDEX `presence_collection_entries_collection_id_status_idx` (`collection_id`, `status`),
  CONSTRAINT `presence_collection_entries_collection_id_fkey` FOREIGN KEY (`collection_id`) REFERENCES `presence_collections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `presence_analytics_events` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `event_type` VARCHAR(191) NOT NULL,
  `path` VARCHAR(191) NULL,
  `visitor_id` VARCHAR(191) NULL,
  `meta_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `presence_analytics_events_site_id_event_type_created_at_idx` (`site_id`, `event_type`, `created_at`),
  INDEX `presence_analytics_events_organization_id_created_at_idx` (`organization_id`, `created_at`),
  CONSTRAINT `presence_analytics_events_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `presence_analytics_events_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `presence_sites` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
