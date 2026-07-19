-- Link booking components to accepted quotation lines for idempotent materialization.
ALTER TABLE `booking_components`
  ADD COLUMN `quotation_line_id` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `booking_components_trip_id_quotation_line_id_key`
  ON `booking_components`(`trip_id`, `quotation_line_id`);

CREATE INDEX `booking_components_quotation_line_id_idx`
  ON `booking_components`(`quotation_line_id`);
