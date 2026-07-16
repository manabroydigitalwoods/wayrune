-- Places hierarchy: kind, parent, categories

ALTER TABLE `places`
  ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT 'city',
  ADD COLUMN `parent_id` VARCHAR(191) NULL;

CREATE INDEX `places_parent_id_idx` ON `places`(`parent_id`);
CREATE INDEX `places_kind_is_active_idx` ON `places`(`kind`, `is_active`);

ALTER TABLE `places`
  ADD CONSTRAINT `places_parent_id_fkey`
  FOREIGN KEY (`parent_id`) REFERENCES `places`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `place_categories` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT false,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `place_categories_organization_id_is_active_idx` ON `place_categories`(`organization_id`, `is_active`);
CREATE INDEX `place_categories_is_system_is_active_idx` ON `place_categories`(`is_system`, `is_active`);
CREATE INDEX `place_categories_key_idx` ON `place_categories`(`key`);

ALTER TABLE `place_categories`
  ADD CONSTRAINT `place_categories_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `place_subcategories` (
  `id` VARCHAR(191) NOT NULL,
  `category_id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT false,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `place_subcategories_category_id_idx` ON `place_subcategories`(`category_id`);
CREATE INDEX `place_subcategories_organization_id_is_active_idx` ON `place_subcategories`(`organization_id`, `is_active`);
CREATE INDEX `place_subcategories_key_idx` ON `place_subcategories`(`key`);

ALTER TABLE `place_subcategories`
  ADD CONSTRAINT `place_subcategories_category_id_fkey`
  FOREIGN KEY (`category_id`) REFERENCES `place_categories`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `place_subcategories`
  ADD CONSTRAINT `place_subcategories_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `place_subcategory_links` (
  `place_id` VARCHAR(191) NOT NULL,
  `subcategory_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`place_id`, `subcategory_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `place_subcategory_links`
  ADD CONSTRAINT `place_subcategory_links_place_id_fkey`
  FOREIGN KEY (`place_id`) REFERENCES `places`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `place_subcategory_links`
  ADD CONSTRAINT `place_subcategory_links_subcategory_id_fkey`
  FOREIGN KEY (`subcategory_id`) REFERENCES `place_subcategories`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `inquiries`
  ADD COLUMN `origin_place_id` VARCHAR(191) NULL;
