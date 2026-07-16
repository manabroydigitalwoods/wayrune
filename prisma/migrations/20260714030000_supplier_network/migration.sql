-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT 'travel_agency';

-- CreateIndex
CREATE INDEX `organizations_kind_idx` ON `organizations`(`kind`);

-- CreateTable
CREATE TABLE `organization_partner_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `discoverable` BOOLEAN NOT NULL DEFAULT false,
    `city` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL DEFAULT 'India',
    `bio` TEXT NULL,
    `service_tags_json` JSON NULL,
    `contact_email` VARCHAR(191) NULL,
    `contact_phone` VARCHAR(191) NULL,
    `capacity_hint` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `organization_partner_profiles_organization_id_key`(`organization_id`),
    INDEX `organization_partner_profiles_discoverable_city_idx`(`discoverable`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `org_relationships` (
    `id` VARCHAR(191) NOT NULL,
    `from_organization_id` VARCHAR(191) NOT NULL,
    `to_organization_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'following',
    `notes` TEXT NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `org_relationships_to_organization_id_status_idx`(`to_organization_id`, `status`),
    INDEX `org_relationships_from_organization_id_status_idx`(`from_organization_id`, `status`),
    UNIQUE INDEX `org_relationships_from_organization_id_to_organization_id_key`(`from_organization_id`, `to_organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `suppliers` ADD COLUMN `linked_organization_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `suppliers_linked_organization_id_idx` ON `suppliers`(`linked_organization_id`);

-- CreateIndex
CREATE UNIQUE INDEX `suppliers_organization_id_linked_organization_id_key` ON `suppliers`(`organization_id`, `linked_organization_id`);

-- AddForeignKey
ALTER TABLE `organization_partner_profiles` ADD CONSTRAINT `organization_partner_profiles_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `org_relationships` ADD CONSTRAINT `org_relationships_from_organization_id_fkey` FOREIGN KEY (`from_organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `org_relationships` ADD CONSTRAINT `org_relationships_to_organization_id_fkey` FOREIGN KEY (`to_organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_linked_organization_id_fkey` FOREIGN KEY (`linked_organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
