-- Step 4: structured supplier service-area coverage (exact Place IDs).
-- served_coverage_configured=false → API servedPlaceIds=null (legacy CSV may display).
-- served_coverage_configured=true → join rows authoritative (empty = no coverage).

ALTER TABLE `suppliers`
  ADD COLUMN `served_coverage_configured` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `supplier_served_places` (
  `supplier_id` VARCHAR(191) NOT NULL,
  `place_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`supplier_id`, `place_id`),
  INDEX `supplier_served_places_place_id_idx` (`place_id`),
  CONSTRAINT `supplier_served_places_supplier_id_fkey`
    FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `supplier_served_places_place_id_fkey`
    FOREIGN KEY (`place_id`) REFERENCES `places` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
