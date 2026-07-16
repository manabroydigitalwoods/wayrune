-- Stage B: supplier invite-to-claim
CREATE TABLE `supplier_invites` (
    `id` VARCHAR(191) NOT NULL,
    `inviting_organization_id` VARCHAR(191) NOT NULL,
    `supplier_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `suggested_kind` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `claimed_organization_id` VARCHAR(191) NULL,
    `claimed_by_user_id` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,

    UNIQUE INDEX `supplier_invites_token_hash_key`(`token_hash`),
    INDEX `supplier_invites_supplier_id_status_idx`(`supplier_id`, `status`),
    INDEX `supplier_invites_inviting_organization_id_status_idx`(`inviting_organization_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `supplier_invites` ADD CONSTRAINT `supplier_invites_inviting_organization_id_fkey` FOREIGN KEY (`inviting_organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_invites` ADD CONSTRAINT `supplier_invites_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_invites` ADD CONSTRAINT `supplier_invites_claimed_organization_id_fkey` FOREIGN KEY (`claimed_organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
