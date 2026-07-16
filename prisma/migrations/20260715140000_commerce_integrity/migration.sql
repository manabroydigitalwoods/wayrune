-- Commerce Integrity 1.0

-- Replace unique service_request_id with non-unique (FK must be dropped first)
ALTER TABLE `booking_components` DROP FOREIGN KEY `booking_components_service_request_id_fkey`;

ALTER TABLE `booking_components` DROP INDEX `booking_components_service_request_id_key`;

CREATE INDEX `booking_components_service_request_id_idx` ON `booking_components`(`service_request_id`);

ALTER TABLE `booking_components`
  ADD CONSTRAINT `booking_components_service_request_id_fkey`
  FOREIGN KEY (`service_request_id`) REFERENCES `service_requests`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `booking_components`
  ADD COLUMN `required_quantity` DECIMAL(14, 2) NULL,
  ADD COLUMN `traveller_requirements_json` JSON NULL,
  ADD COLUMN `itinerary_item_ids_json` JSON NULL;

ALTER TABLE `service_requests`
  ADD COLUMN `confirm_idempotency_key` VARCHAR(191) NULL;

CREATE INDEX `service_requests_buyer_confirm_key_idx` ON `service_requests`(`buyer_organization_id`, `confirm_idempotency_key`);

CREATE TABLE `service_request_items` (
  `id` VARCHAR(191) NOT NULL,
  `service_request_id` VARCHAR(191) NOT NULL,
  `booking_component_id` VARCHAR(191) NULL,
  `product_ref` VARCHAR(191) NULL,
  `quantity` DECIMAL(14, 2) NOT NULL DEFAULT 1,
  `requested_terms_json` JSON NULL,
  `offered_terms_json` JSON NULL,
  `selected` BOOLEAN NOT NULL DEFAULT false,
  `status` VARCHAR(191) NOT NULL DEFAULT 'drafted',
  `reservation_type` VARCHAR(191) NULL,
  `reservation_id` VARCHAR(191) NULL,
  `rate_snapshot_json` JSON NULL,
  `policy_snapshot_json` JSON NULL,
  `agreed_amount` DECIMAL(14, 2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `service_request_items_service_request_id_idx`(`service_request_id`),
  INDEX `service_request_items_booking_component_id_idx`(`booking_component_id`),
  INDEX `service_request_items_reservation_idx`(`reservation_type`, `reservation_id`),
  CONSTRAINT `service_request_items_sr_fkey` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `service_request_items_booking_fkey` FOREIGN KEY (`booking_component_id`) REFERENCES `booking_components`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inventory_holds` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `resource_type` VARCHAR(191) NOT NULL,
  `resource_id` VARCHAR(191) NOT NULL,
  `quantity` DECIMAL(14, 2) NOT NULL DEFAULT 1,
  `window_start` DATETIME(3) NULL,
  `window_end` DATETIME(3) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `source_service_request_item_id` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `idempotency_key` VARCHAR(191) NULL,
  `released_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `inventory_holds_source_item_key`(`source_service_request_item_id`),
  INDEX `inventory_holds_org_key_idx`(`organization_id`, `idempotency_key`),
  INDEX `inventory_holds_expiry_idx`(`organization_id`, `status`, `expires_at`),
  INDEX `inventory_holds_resource_idx`(`resource_type`, `resource_id`, `status`),
  CONSTRAINT `inventory_holds_org_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inventory_holds_item_fkey` FOREIGN KEY (`source_service_request_item_id`) REFERENCES `service_request_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payment_allocations` (
  `id` VARCHAR(191) NOT NULL,
  `payment_id` VARCHAR(191) NOT NULL,
  `commercial_document_id` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(14, 2) NOT NULL,
  `allocated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `payment_allocations_payment_id_idx`(`payment_id`),
  INDEX `payment_allocations_doc_id_idx`(`commercial_document_id`),
  CONSTRAINT `payment_allocations_payment_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payment_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `payment_allocations_doc_fkey` FOREIGN KEY (`commercial_document_id`) REFERENCES `commercial_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `cancellation_cases` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `trip_id` VARCHAR(191) NULL,
  `scope` VARCHAR(191) NOT NULL,
  `requested_by` VARCHAR(191) NULL,
  `reason` VARCHAR(191) NULL,
  `affected_entities_json` JSON NULL,
  `applicable_policy_snapshot_json` JSON NULL,
  `calculated_charges` DECIMAL(14, 2) NULL,
  `expected_refund` DECIMAL(14, 2) NULL,
  `supplier_penalty` DECIMAL(14, 2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `approval_status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `execution_status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `evaluation_json` JSON NULL,
  `idempotency_key` VARCHAR(191) NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `cancellation_cases_org_exec_idx`(`organization_id`, `execution_status`),
  INDEX `cancellation_cases_trip_idx`(`trip_id`),
  INDEX `cancellation_cases_idem_idx`(`organization_id`, `idempotency_key`),
  CONSTRAINT `cancellation_cases_org_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cancellation_cases_trip_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `data_quality_issues` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `rule_code` VARCHAR(191) NOT NULL,
  `entity_type` VARCHAR(191) NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `severity` VARCHAR(191) NOT NULL DEFAULT 'warn',
  `state` VARCHAR(191) NOT NULL DEFAULT 'open',
  `message` TEXT NULL,
  `detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolved_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `data_quality_issues_org_state_idx`(`organization_id`, `state`),
  INDEX `data_quality_issues_entity_idx`(`entity_type`, `entity_id`),
  INDEX `data_quality_issues_rule_idx`(`rule_code`, `state`),
  CONSTRAINT `data_quality_issues_org_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `service_request_items` (
  `id`, `service_request_id`, `booking_component_id`, `quantity`, `selected`, `status`,
  `agreed_amount`, `currency`, `created_at`, `updated_at`
)
SELECT
  CONCAT('migrated_', bc.id),
  bc.service_request_id,
  bc.id,
  1,
  true,
  CASE WHEN bc.status = 'confirmed' THEN 'confirmed' ELSE 'drafted' END,
  bc.confirmed_amount,
  bc.currency,
  NOW(3),
  NOW(3)
FROM `booking_components` bc
WHERE bc.service_request_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `service_request_items` sri
    WHERE sri.booking_component_id = bc.id AND sri.service_request_id = bc.service_request_id
  );
