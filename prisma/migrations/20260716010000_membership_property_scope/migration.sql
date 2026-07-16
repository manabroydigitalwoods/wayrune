-- RBAC Integrity 1.0 (P1-3): property/branch scope assignment.
-- Links a membership to the PartnerAsset(s) it is scoped to. A membership with
-- no rows is treated as org-wide (all properties) for backward compatibility.

CREATE TABLE `membership_property_scopes` (
  `membership_id` VARCHAR(191) NOT NULL,
  `partner_asset_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`membership_id`, `partner_asset_id`),
  INDEX `membership_property_scopes_partner_asset_id_idx` (`partner_asset_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `membership_property_scopes`
  ADD CONSTRAINT `membership_property_scopes_membership_id_fkey`
  FOREIGN KEY (`membership_id`) REFERENCES `organization_memberships`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `membership_property_scopes`
  ADD CONSTRAINT `membership_property_scopes_partner_asset_id_fkey`
  FOREIGN KEY (`partner_asset_id`) REFERENCES `partner_assets`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
