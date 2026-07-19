-- AlterTable
ALTER TABLE `trip_payments` ADD COLUMN `payment_link_token` VARCHAR(191) NULL,
    ADD COLUMN `payment_link_expires_at` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `trip_payments_payment_link_token_key` ON `trip_payments`(`payment_link_token`);
