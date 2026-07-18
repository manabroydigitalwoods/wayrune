-- Platform subdomain slug for non-primary websites (HubSpot-style hosts).
ALTER TABLE `presence_sites` ADD COLUMN `platform_slug` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `presence_sites_platform_slug_key` ON `presence_sites`(`platform_slug`);
