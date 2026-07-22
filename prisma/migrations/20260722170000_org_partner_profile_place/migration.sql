-- Step 6 P0: optional catalog HQ/base on organisation partner profile.
ALTER TABLE `organization_partner_profiles`
  ADD COLUMN `place_id` VARCHAR(191) NULL;

CREATE INDEX `organization_partner_profiles_place_id_idx`
  ON `organization_partner_profiles`(`place_id`);

ALTER TABLE `organization_partner_profiles`
  ADD CONSTRAINT `organization_partner_profiles_place_id_fkey`
  FOREIGN KEY (`place_id`) REFERENCES `places`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
