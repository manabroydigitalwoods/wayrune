-- Trip-level destination place of supply (GST display split override).
ALTER TABLE `trips`
  ADD COLUMN `destination_place_of_supply` VARCHAR(191) NULL;
