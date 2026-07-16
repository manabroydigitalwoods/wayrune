-- WhatsApp consent on Party + WhatsApp templates + org custom field definitions
ALTER TABLE `parties`
  ADD COLUMN `whatsapp_opt_in` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `email_opt_in` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `marketing_opt_in` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `opted_out_at` DATETIME(3) NULL;

CREATE TABLE `whatsapp_templates` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `meta_template_name` VARCHAR(191) NOT NULL,
    `language_code` VARCHAR(191) NOT NULL,
    `body_preview` TEXT NULL,
    `variable_count` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `whatsapp_templates_organization_id_name_key`(`organization_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `custom_field_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `field_type` VARCHAR(191) NOT NULL DEFAULT 'text',
    `options_json` JSON NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `position` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `custom_field_definitions_organization_id_entity_key_key`(`organization_id`, `entity`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `whatsapp_templates` ADD CONSTRAINT `whatsapp_templates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `custom_field_definitions` ADD CONSTRAINT `custom_field_definitions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
