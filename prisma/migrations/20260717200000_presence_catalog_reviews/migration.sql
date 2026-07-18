-- CreateTable
CREATE TABLE `presence_catalog_reviews` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `target_type` VARCHAR(191) NOT NULL,
  `target_id` VARCHAR(191) NOT NULL,
  `rating` INTEGER NOT NULL,
  `body` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `presence_catalog_reviews_org_user_target_key` (`organization_id`, `user_id`, `target_type`, `target_id`),
  INDEX `presence_catalog_reviews_target_type_target_id_created_at_idx` (`target_type`, `target_id`, `created_at`),
  INDEX `presence_catalog_reviews_organization_id_created_at_idx` (`organization_id`, `created_at`),
  CONSTRAINT `presence_catalog_reviews_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `presence_catalog_reviews_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
