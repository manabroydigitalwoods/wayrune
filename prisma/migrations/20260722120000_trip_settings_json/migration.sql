-- AlterTable
ALTER TABLE `trips` ADD COLUMN `settings_json` JSON NULL;

-- CreateIndex
CREATE INDEX `trips_organization_id_inquiry_id_idx` ON `trips`(`organization_id`, `inquiry_id`);
