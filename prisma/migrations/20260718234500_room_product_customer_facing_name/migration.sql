-- Customer-facing room product alias for proposals (canonical name stays internal).
ALTER TABLE `asset_room_products`
  ADD COLUMN `customer_facing_name` VARCHAR(191) NULL;
