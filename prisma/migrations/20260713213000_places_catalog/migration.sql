-- Rename destinations catalog → places (same rows serve origin / destination / stops)
RENAME TABLE `destinations` TO `places`;

ALTER TABLE `places` DROP FOREIGN KEY `destinations_organization_id_fkey`;
ALTER TABLE `places` ADD CONSTRAINT `places_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `places` RENAME INDEX `destinations_organization_id_is_active_idx` TO `places_organization_id_is_active_idx`;
ALTER TABLE `places` RENAME INDEX `destinations_is_system_is_active_idx` TO `places_is_system_is_active_idx`;
ALTER TABLE `places` RENAME INDEX `destinations_key_idx` TO `places_key_idx`;

ALTER TABLE `inquiries` ADD COLUMN `stops_json` JSON NULL;
