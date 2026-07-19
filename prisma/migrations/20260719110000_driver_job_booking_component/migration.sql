-- AlterTable
ALTER TABLE `driver_jobs` ADD COLUMN `booking_component_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `driver_jobs_booking_component_id_idx` ON `driver_jobs`(`booking_component_id`);

-- AddForeignKey
ALTER TABLE `driver_jobs` ADD CONSTRAINT `driver_jobs_booking_component_id_fkey` FOREIGN KEY (`booking_component_id`) REFERENCES `booking_components`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
