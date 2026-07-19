-- Bind public accept to the quotation version that was shared/sent.
ALTER TABLE `itinerary_share_links`
  ADD COLUMN `quotation_version_id` VARCHAR(191) NULL;

CREATE INDEX `itinerary_share_links_quotation_version_id_idx`
  ON `itinerary_share_links` (`quotation_version_id`);
