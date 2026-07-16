-- Travel OS knowledge layer
ALTER TABLE `places` ADD COLUMN `profile_json` JSON NULL;

CREATE TABLE `place_edges` (
    `id` VARCHAR(191) NOT NULL,
    `from_place_id` VARCHAR(191) NOT NULL,
    `to_place_id` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(191) NOT NULL DEFAULT 'drive',
    `distance_km` DOUBLE NULL,
    `duration_min` INTEGER NULL,
    `road_hint` VARCHAR(191) NULL,
    `stops_json` JSON NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT true,
    `organization_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `place_edges_from_place_id_to_place_id_mode_key`(`from_place_id`, `to_place_id`, `mode`),
    INDEX `place_edges_to_place_id_idx`(`to_place_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `place_edges` ADD CONSTRAINT `place_edges_from_place_id_fkey` FOREIGN KEY (`from_place_id`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `place_edges` ADD CONSTRAINT `place_edges_to_place_id_fkey` FOREIGN KEY (`to_place_id`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `place_contributions` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `submitted_by_user_id` VARCHAR(191) NOT NULL,
    `place_id` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'create',
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `payload_json` JSON NOT NULL,
    `review_note` TEXT NULL,
    `reviewed_by_user_id` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `place_contributions_status_created_at_idx`(`status`, `created_at`),
    INDEX `place_contributions_organization_id_idx`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `place_contributions` ADD CONSTRAINT `place_contributions_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `place_knowledge` (
    `id` VARCHAR(191) NOT NULL,
    `place_id` VARCHAR(191) NOT NULL,
    `season` VARCHAR(191) NOT NULL DEFAULT 'all',
    `kind` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `meta_json` JSON NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `place_knowledge_place_id_season_kind_idx`(`place_id`, `season`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `place_knowledge` ADD CONSTRAINT `place_knowledge_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `suppliers` ADD COLUMN `place_id` VARCHAR(191) NULL;
ALTER TABLE `suppliers` ADD COLUMN `profile_json` JSON NULL;
CREATE INDEX `suppliers_place_id_idx` ON `suppliers`(`place_id`);
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_place_id_fkey` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `itinerary_blocks` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
