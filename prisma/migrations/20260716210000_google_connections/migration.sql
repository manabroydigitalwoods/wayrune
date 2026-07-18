-- Org-scoped Google Workspace / Business Profile connection
CREATE TABLE `google_connections` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `connected_by_user_id` VARCHAR(191) NULL,
    `google_account_email` VARCHAR(191) NULL,
    `refresh_token_enc` TEXT NOT NULL,
    `scopes_json` JSON NOT NULL,
    `access_token_enc` TEXT NULL,
    `token_expiry` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'connected',
    `locations_json` JSON NULL,
    `calendar_id` VARCHAR(191) NULL,
    `drive_root_folder_id` VARCHAR(191) NULL,
    `sync_follow_ups_to_calendar` BOOLEAN NOT NULL DEFAULT true,
    `last_sync_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `google_connections_organization_id_key`(`organization_id`),
    INDEX `google_connections_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `google_connections` ADD CONSTRAINT `google_connections_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
