-- Transfer + activity rate version chains (mirror hotel rate-version OS).
ALTER TABLE `transfer_fares`
  ADD COLUMN `version_number` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `supersedes_id` VARCHAR(191) NULL;

CREATE INDEX `transfer_fares_supersedes_id_idx`
  ON `transfer_fares`(`supersedes_id`);

ALTER TABLE `transfer_fares`
  ADD CONSTRAINT `transfer_fares_supersedes_id_fkey`
  FOREIGN KEY (`supersedes_id`) REFERENCES `transfer_fares`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `supplier_activity_rates`
  ADD COLUMN `version_number` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `supersedes_id` VARCHAR(191) NULL;

CREATE INDEX `supplier_activity_rates_supersedes_id_idx`
  ON `supplier_activity_rates`(`supersedes_id`);

ALTER TABLE `supplier_activity_rates`
  ADD CONSTRAINT `supplier_activity_rates_supersedes_id_fkey`
  FOREIGN KEY (`supersedes_id`) REFERENCES `supplier_activity_rates`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
