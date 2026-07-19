-- AlterTable
ALTER TABLE `driver_jobs` ADD COLUMN `fleet_unit_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `driver_jobs_fleet_unit_id_start_at_end_at_idx` ON `driver_jobs`(`fleet_unit_id`, `start_at`, `end_at`);

-- AddForeignKey
ALTER TABLE `driver_jobs` ADD CONSTRAINT `driver_jobs_fleet_unit_id_fkey` FOREIGN KEY (`fleet_unit_id`) REFERENCES `asset_fleet_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
