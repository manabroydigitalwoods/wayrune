-- Interaction webhook idempotency (Phase 3 website ingest)
ALTER TABLE `interactions` ADD COLUMN `idempotency_key` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `interactions_organization_id_idempotency_key_key` ON `interactions`(`organization_id`, `idempotency_key`);
