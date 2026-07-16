-- Family sharing on itinerary share links

CREATE TABLE `proposal_participants` (
    `id` VARCHAR(191) NOT NULL,
    `share_link_id` VARCHAR(191) NOT NULL,
    `viewer_key` VARCHAR(191) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `relation_hint` VARCHAR(191) NULL,
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `proposal_participants_share_link_id_viewer_key_key`(`share_link_id`, `viewer_key`),
    INDEX `proposal_participants_share_link_id_idx`(`share_link_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `proposal_reactions` (
    `id` VARCHAR(191) NOT NULL,
    `share_link_id` VARCHAR(191) NOT NULL,
    `participant_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'love',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `proposal_reactions_share_link_id_participant_id_kind_key`(`share_link_id`, `participant_id`, `kind`),
    INDEX `proposal_reactions_share_link_id_idx`(`share_link_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `proposal_messages` (
    `id` VARCHAR(191) NOT NULL,
    `share_link_id` VARCHAR(191) NOT NULL,
    `participant_id` VARCHAR(191) NULL,
    `author_role` VARCHAR(191) NOT NULL,
    `author_name` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'comment',
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `proposal_messages_share_link_id_created_at_idx`(`share_link_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `proposal_participants` ADD CONSTRAINT `proposal_participants_share_link_id_fkey` FOREIGN KEY (`share_link_id`) REFERENCES `itinerary_share_links`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `proposal_reactions` ADD CONSTRAINT `proposal_reactions_share_link_id_fkey` FOREIGN KEY (`share_link_id`) REFERENCES `itinerary_share_links`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `proposal_reactions` ADD CONSTRAINT `proposal_reactions_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `proposal_participants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `proposal_messages` ADD CONSTRAINT `proposal_messages_share_link_id_fkey` FOREIGN KEY (`share_link_id`) REFERENCES `itinerary_share_links`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `proposal_messages` ADD CONSTRAINT `proposal_messages_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `proposal_participants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
