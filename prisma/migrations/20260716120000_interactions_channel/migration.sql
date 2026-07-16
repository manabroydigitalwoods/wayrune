-- Omnichannel Interaction + Lead.channel for journey attribution
ALTER TABLE `leads` ADD COLUMN `channel` VARCHAR(191) NULL;

CREATE TABLE `interactions` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `party_id` VARCHAR(191) NULL,
    `lead_id` VARCHAR(191) NULL,
    `inquiry_id` VARCHAR(191) NULL,
    `channel` VARCHAR(191) NOT NULL,
    `acquisition_source_key` VARCHAR(191) NULL,
    `staff_user_id` VARCHAR(191) NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `outcome` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `unread` BOOLEAN NOT NULL DEFAULT true,
    `summary` TEXT NULL,
    `raw_payload_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `interactions_organization_id_occurred_at_idx`(`organization_id`, `occurred_at`),
    INDEX `interactions_organization_id_channel_occurred_at_idx`(`organization_id`, `channel`, `occurred_at`),
    INDEX `interactions_organization_id_unread_occurred_at_idx`(`organization_id`, `unread`, `occurred_at`),
    INDEX `interactions_party_id_occurred_at_idx`(`party_id`, `occurred_at`),
    INDEX `interactions_inquiry_id_idx`(`inquiry_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `interactions` ADD CONSTRAINT `interactions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `interactions` ADD CONSTRAINT `interactions_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `interactions` ADD CONSTRAINT `interactions_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
