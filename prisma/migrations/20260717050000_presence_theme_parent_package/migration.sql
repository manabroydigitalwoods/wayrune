-- AlterTable
ALTER TABLE `presence_themes`
  ADD COLUMN `parent_theme_id` VARCHAR(191) NULL,
  ADD COLUMN `package_format` VARCHAR(191) NOT NULL DEFAULT 'legacy_json',
  ADD COLUMN `package_root_key` VARCHAR(191) NULL,
  ADD COLUMN `manifest_json` JSON NULL;

-- CreateIndex
CREATE INDEX `presence_themes_parent_theme_id_idx` ON `presence_themes`(`parent_theme_id`);

-- AddForeignKey
ALTER TABLE `presence_themes`
  ADD CONSTRAINT `presence_themes_parent_theme_id_fkey`
  FOREIGN KEY (`parent_theme_id`) REFERENCES `presence_themes`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
