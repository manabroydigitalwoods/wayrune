-- Seasonal hotel rate depth: meal plan match + optional weekend night cost.
ALTER TABLE `supplier_hotel_rates` ADD COLUMN `meal_plan` VARCHAR(191) NULL;
ALTER TABLE `supplier_hotel_rates` ADD COLUMN `weekend_unit_cost` DECIMAL(14, 2) NULL;

CREATE INDEX `supplier_hotel_rates_place_id_room_type_meal_plan_is_active_idx`
  ON `supplier_hotel_rates`(`place_id`, `room_type`, `meal_plan`, `is_active`);
