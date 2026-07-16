-- System-capable transfer fares + hotel rates; adult/child pricing

-- Transfer fares: nullable org, system flag, pax pricing
ALTER TABLE `transfer_fares` DROP FOREIGN KEY `transfer_fares_organization_id_fkey`;

ALTER TABLE `transfer_fares`
  MODIFY `organization_id` VARCHAR(191) NULL,
  ADD COLUMN `is_system` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `child_unit_cost` DECIMAL(14, 2) NULL,
  ADD COLUMN `infant_unit_cost` DECIMAL(14, 2) NULL,
  ADD COLUMN `pricing_mode` VARCHAR(191) NOT NULL DEFAULT 'per_vehicle';

UPDATE `transfer_fares` SET `is_system` = false WHERE `is_system` = false;

ALTER TABLE `transfer_fares`
  ADD INDEX `transfer_fares_is_system_is_active_idx`(`is_system`, `is_active`),
  ADD INDEX `transfer_fares_from_to_vehicle_system_active_idx`(`from_place_id`, `to_place_id`, `vehicle_type_id`, `is_system`, `is_active`);

ALTER TABLE `transfer_fares` ADD CONSTRAINT `transfer_fares_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Hotel rates: nullable org/supplier, place defaults, system flag
ALTER TABLE `supplier_hotel_rates` DROP FOREIGN KEY `supplier_hotel_rates_organization_id_fkey`;
ALTER TABLE `supplier_hotel_rates` DROP FOREIGN KEY `supplier_hotel_rates_supplier_id_fkey`;

ALTER TABLE `supplier_hotel_rates`
  MODIFY `organization_id` VARCHAR(191) NULL,
  MODIFY `supplier_id` VARCHAR(191) NULL,
  ADD COLUMN `place_id` VARCHAR(191) NULL,
  ADD COLUMN `is_system` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `supplier_hotel_rates`
  ADD INDEX `supplier_hotel_rates_is_system_is_active_idx`(`is_system`, `is_active`),
  ADD INDEX `supplier_hotel_rates_place_id_room_type_is_active_idx`(`place_id`, `room_type`, `is_active`);

ALTER TABLE `supplier_hotel_rates` ADD CONSTRAINT `supplier_hotel_rates_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_hotel_rates` ADD CONSTRAINT `supplier_hotel_rates_supplier_id_fkey`
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_hotel_rates` ADD CONSTRAINT `supplier_hotel_rates_place_id_fkey`
  FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
