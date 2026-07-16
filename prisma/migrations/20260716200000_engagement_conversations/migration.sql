-- Sales EngagementConversation (distinct from commerce conversations)
CREATE TABLE `engagement_conversations` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `party_id` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `assigned_user_id` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NULL,
    `last_interaction_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unread_count` INTEGER NOT NULL DEFAULT 0,
    `journey_path_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `eng_conv_org_last_idx`(`organization_id`, `last_interaction_at`),
    INDEX `eng_conv_org_status_last_idx`(`organization_id`, `status`, `last_interaction_at`),
    INDEX `eng_conv_org_assignee_last_idx`(`organization_id`, `assigned_user_id`, `last_interaction_at`),
    INDEX `eng_conv_party_status_idx`(`party_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `engagement_conversations` ADD CONSTRAINT `engagement_conversations_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `engagement_conversations` ADD CONSTRAINT `engagement_conversations_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `interactions` ADD COLUMN `conversation_id` VARCHAR(191) NULL;
CREATE INDEX `interactions_conversation_id_occurred_at_idx` ON `interactions`(`conversation_id`, `occurred_at`);
ALTER TABLE `interactions` ADD CONSTRAINT `interactions_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `engagement_conversations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inquiries` ADD COLUMN `engagement_conversation_id` VARCHAR(191) NULL;
CREATE INDEX `inquiries_engagement_conversation_id_idx` ON `inquiries`(`engagement_conversation_id`);
ALTER TABLE `inquiries` ADD CONSTRAINT `inquiries_engagement_conversation_id_fkey` FOREIGN KEY (`engagement_conversation_id`) REFERENCES `engagement_conversations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `engagement_automation_rules` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NULL,
    `action_json` JSON NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `eng_auto_org_active_pos_idx`(`organization_id`, `is_active`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `engagement_automation_rules` ADD CONSTRAINT `engagement_automation_rules_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
