-- CreateTable
CREATE TABLE `itinerary_share_links` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `trip_id` VARCHAR(191) NOT NULL,
    `itinerary_version_id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `itinerary_share_links_token_key`(`token`),
    INDEX `itinerary_share_links_organization_id_trip_id_idx`(`organization_id`, `trip_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `itinerary_share_links` ADD CONSTRAINT `itinerary_share_links_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `itinerary_share_links` ADD CONSTRAINT `itinerary_share_links_itinerary_version_id_fkey` FOREIGN KEY (`itinerary_version_id`) REFERENCES `itinerary_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
