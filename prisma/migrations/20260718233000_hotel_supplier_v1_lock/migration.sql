-- Hotel Supplier V1 lock: canonical room product + contract-owned rates + stop-sale JSON + versions

ALTER TABLE `supplier_hotel_rates`
  ADD COLUMN `room_product_id` VARCHAR(191) NULL,
  ADD COLUMN `contract_id` VARCHAR(191) NULL;

ALTER TABLE `supplier_contracts`
  ADD COLUMN `version_number` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `supersedes_id` VARCHAR(191) NULL,
  ADD COLUMN `stop_sale_json` JSON NULL;

CREATE INDEX `supplier_hotel_rates_room_product_id_is_active_idx`
  ON `supplier_hotel_rates`(`room_product_id`, `is_active`);

CREATE INDEX `supplier_hotel_rates_contract_id_is_active_idx`
  ON `supplier_hotel_rates`(`contract_id`, `is_active`);

CREATE INDEX `supplier_contracts_supersedes_id_idx`
  ON `supplier_contracts`(`supersedes_id`);

ALTER TABLE `supplier_hotel_rates`
  ADD CONSTRAINT `supplier_hotel_rates_room_product_id_fkey`
  FOREIGN KEY (`room_product_id`) REFERENCES `asset_room_products`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `supplier_hotel_rates`
  ADD CONSTRAINT `supplier_hotel_rates_contract_id_fkey`
  FOREIGN KEY (`contract_id`) REFERENCES `supplier_contracts`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `supplier_contracts`
  ADD CONSTRAINT `supplier_contracts_supersedes_id_fkey`
  FOREIGN KEY (`supersedes_id`) REFERENCES `supplier_contracts`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
