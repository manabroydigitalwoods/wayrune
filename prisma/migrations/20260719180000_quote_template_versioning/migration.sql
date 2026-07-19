-- Quote template versioning (supersede chain; list shows active only)
ALTER TABLE `quote_templates`
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  ADD COLUMN `version_number` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `supersedes_id` VARCHAR(191) NULL;

CREATE INDEX `quote_templates_organization_id_status_idx` ON `quote_templates`(`organization_id`, `status`);
CREATE INDEX `quote_templates_supersedes_id_idx` ON `quote_templates`(`supersedes_id`);

ALTER TABLE `quote_templates`
  ADD CONSTRAINT `quote_templates_supersedes_id_fkey`
  FOREIGN KEY (`supersedes_id`) REFERENCES `quote_templates`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
