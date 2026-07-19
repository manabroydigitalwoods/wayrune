-- Hotel rate version chain (thin rate-version OS).
ALTER TABLE `supplier_hotel_rates`
  ADD COLUMN `version_number` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `supersedes_id` VARCHAR(191) NULL;

CREATE INDEX `supplier_hotel_rates_supersedes_id_idx`
  ON `supplier_hotel_rates`(`supersedes_id`);

ALTER TABLE `supplier_hotel_rates`
  ADD CONSTRAINT `supplier_hotel_rates_supersedes_id_fkey`
  FOREIGN KEY (`supersedes_id`) REFERENCES `supplier_hotel_rates`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
