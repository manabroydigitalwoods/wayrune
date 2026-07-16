-- Family discussion PIN (hashed) for proposal share links
ALTER TABLE `itinerary_share_links` ADD COLUMN `family_pin_hash` VARCHAR(191) NULL;
