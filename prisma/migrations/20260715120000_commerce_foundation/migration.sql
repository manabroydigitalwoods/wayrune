-- Multi-Organization Commerce Foundation (Phases 1–6 schema)

-- Organization partner profile enrichment
ALTER TABLE `organization_partner_profiles`
  ADD COLUMN `profile_json` JSON NULL,
  ADD COLUMN `legal_name` VARCHAR(191) NULL,
  ADD COLUMN `display_name` VARCHAR(191) NULL,
  ADD COLUMN `logo_url` VARCHAR(191) NULL,
  ADD COLUMN `website` VARCHAR(191) NULL,
  ADD COLUMN `latitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `longitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `verification_status` VARCHAR(191) NOT NULL DEFAULT 'unverified';

-- Documents
ALTER TABLE `documents`
  ADD COLUMN `document_type` VARCHAR(191) NOT NULL DEFAULT 'other',
  ADD COLUMN `version` INT NOT NULL DEFAULT 1,
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'active';
CREATE INDEX `documents_organization_id_document_type_idx` ON `documents`(`organization_id`, `document_type`);

-- Rate plans depth
ALTER TABLE `asset_rate_plans`
  ADD COLUMN `meal_plan` VARCHAR(191) NULL,
  ADD COLUMN `refundable` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `min_stay_nights` INT NULL,
  ADD COLUMN `max_stay_nights` INT NULL,
  ADD COLUMN `closed_to_arrival` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `closed_to_departure` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `extra_adult_amount` DECIMAL(14, 2) NULL,
  ADD COLUMN `child_with_bed_amount` DECIMAL(14, 2) NULL,
  ADD COLUMN `child_without_bed_amount` DECIMAL(14, 2) NULL,
  ADD COLUMN `restrictions_json` JSON NULL;

-- Room units hierarchy
ALTER TABLE `asset_room_units`
  ADD COLUMN `building_id` VARCHAR(191) NULL,
  ADD COLUMN `floor_id` VARCHAR(191) NULL;
CREATE INDEX `asset_room_units_building_id_idx` ON `asset_room_units`(`building_id`);
CREATE INDEX `asset_room_units_floor_id_idx` ON `asset_room_units`(`floor_id`);

-- Stay reservations commerce fields
ALTER TABLE `stay_reservations`
  ADD COLUMN `party_id` VARCHAR(191) NULL,
  ADD COLUMN `service_request_id` VARCHAR(191) NULL,
  ADD COLUMN `meal_plan` VARCHAR(191) NULL,
  ADD COLUMN `adults` INT NOT NULL DEFAULT 1,
  ADD COLUMN `children` INT NOT NULL DEFAULT 0,
  ADD COLUMN `rate_snapshot_json` JSON NULL,
  ADD COLUMN `policy_snapshot_json` JSON NULL;
CREATE INDEX `stay_reservations_service_request_id_idx` ON `stay_reservations`(`service_request_id`);

-- Booking components
ALTER TABLE `booking_components`
  ADD COLUMN `service_request_id` VARCHAR(191) NULL,
  ADD COLUMN `quoted_amount` DECIMAL(14, 2) NULL,
  ADD COLUMN `confirmed_amount` DECIMAL(14, 2) NULL;
CREATE UNIQUE INDEX `booking_components_service_request_id_key` ON `booking_components`(`service_request_id`);

CREATE TABLE `party_context_roles` (
  `id` VARCHAR(191) NOT NULL,
  `party_id` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL,
  `entity_type` VARCHAR(191) NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `party_context_roles_party_id_role_entity_type_entity_id_key`(`party_id`, `role`, `entity_type`, `entity_id`),
  INDEX `party_context_roles_party_id_idx`(`party_id`),
  INDEX `party_context_roles_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `policies` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `policy_type` VARCHAR(191) NOT NULL,
  `rules_json` JSON NULL,
  `text_body` TEXT NULL,
  `is_default` BOOLEAN NOT NULL DEFAULT false,
  `effective_from` DATE NULL,
  `effective_until` DATE NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `policies_organization_id_policy_type_idx`(`organization_id`, `policy_type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `policy_attachments` (
  `id` VARCHAR(191) NOT NULL,
  `policy_id` VARCHAR(191) NOT NULL,
  `entity_type` VARCHAR(191) NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `policy_attachments_policy_id_entity_type_entity_id_key`(`policy_id`, `entity_type`, `entity_id`),
  INDEX `policy_attachments_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `service_requests` (
  `id` VARCHAR(191) NOT NULL,
  `buyer_organization_id` VARCHAR(191) NOT NULL,
  `seller_organization_id` VARCHAR(191) NULL,
  `supplier_id` VARCHAR(191) NULL,
  `partner_asset_id` VARCHAR(191) NULL,
  `service_type` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'drafted',
  `source_entity_type` VARCHAR(191) NULL,
  `source_entity_id` VARCHAR(191) NULL,
  `trip_id` VARCHAR(191) NULL,
  `quotation_line_id` VARCHAR(191) NULL,
  `service_start_at` DATETIME(3) NULL,
  `service_end_at` DATETIME(3) NULL,
  `quantity` DECIMAL(14, 2) NULL,
  `adults` INT NULL,
  `children` INT NULL,
  `requirements_json` JSON NULL,
  `quoted_amount` DECIMAL(14, 2) NULL,
  `agreed_amount` DECIMAL(14, 2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `confirmation_ref` VARCHAR(191) NULL,
  `reservation_id` VARCHAR(191) NULL,
  `reservation_type` VARCHAR(191) NULL,
  `rate_snapshot_json` JSON NULL,
  `policy_snapshot_json` JSON NULL,
  `reject_reason` TEXT NULL,
  `notes` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `updated_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `service_requests_buyer_organization_id_status_idx`(`buyer_organization_id`, `status`),
  INDEX `service_requests_seller_organization_id_status_idx`(`seller_organization_id`, `status`),
  INDEX `service_requests_trip_id_idx`(`trip_id`),
  INDEX `service_requests_partner_asset_id_idx`(`partner_asset_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commercial_documents` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `doc_type` VARCHAR(191) NOT NULL DEFAULT 'invoice',
  `direction` VARCHAR(191) NOT NULL,
  `counterparty_party_id` VARCHAR(191) NULL,
  `counterparty_org_id` VARCHAR(191) NULL,
  `supplier_id` VARCHAR(191) NULL,
  `linked_entity_type` VARCHAR(191) NULL,
  `linked_entity_id` VARCHAR(191) NULL,
  `trip_id` VARCHAR(191) NULL,
  `service_request_id` VARCHAR(191) NULL,
  `document_number` VARCHAR(191) NULL,
  `label` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(14, 2) NOT NULL,
  `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `due_at` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `commercial_documents_organization_id_direction_status_idx`(`organization_id`, `direction`, `status`),
  INDEX `commercial_documents_service_request_id_idx`(`service_request_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `commercial_document_lines` (
  `id` VARCHAR(191) NOT NULL,
  `commercial_document_id` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NOT NULL,
  `quantity` DECIMAL(14, 2) NOT NULL DEFAULT 1,
  `unit_amount` DECIMAL(14, 2) NOT NULL,
  `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  INDEX `commercial_document_lines_commercial_document_id_idx`(`commercial_document_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payment_records` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `commercial_document_id` VARCHAR(191) NULL,
  `direction` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(14, 2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `method` VARCHAR(191) NULL,
  `reference` VARCHAR(191) NULL,
  `paid_at` DATETIME(3) NULL,
  `linked_entity_type` VARCHAR(191) NULL,
  `linked_entity_id` VARCHAR(191) NULL,
  `trip_id` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `payment_records_organization_id_created_at_idx`(`organization_id`, `created_at`),
  INDEX `payment_records_commercial_document_id_idx`(`commercial_document_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `conversations` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `linked_entity_type` VARCHAR(191) NULL,
  `linked_entity_id` VARCHAR(191) NULL,
  `counterparty_org_id` VARCHAR(191) NULL,
  `party_id` VARCHAR(191) NULL,
  `assigned_user_id` VARCHAR(191) NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `conversations_organization_id_status_idx`(`organization_id`, `status`),
  INDEX `conversations_linked_entity_type_linked_entity_id_idx`(`linked_entity_type`, `linked_entity_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `conversation_messages` (
  `id` VARCHAR(191) NOT NULL,
  `conversation_id` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `visibility` VARCHAR(191) NOT NULL DEFAULT 'internal',
  `author_user_id` VARCHAR(191) NULL,
  `attachments_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `conversation_messages_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `business_timeline_events` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `event_type` VARCHAR(191) NOT NULL,
  `entity_type` VARCHAR(191) NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `summary` VARCHAR(191) NOT NULL,
  `payload_json` JSON NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `business_timeline_events_organization_id_occurred_at_idx`(`organization_id`, `occurred_at`),
  INDEX `business_timeline_events_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `supplier_contracts` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `supplier_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `effective_from` DATE NULL,
  `effective_until` DATE NULL,
  `credit_limit` DECIMAL(14, 2) NULL,
  `payment_terms` VARCHAR(191) NULL,
  `cancellation_terms` TEXT NULL,
  `commission_percent` DECIMAL(5, 2) NULL,
  `preferred` BOOLEAN NOT NULL DEFAULT false,
  `blackout_json` JSON NULL,
  `notes` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `supplier_contracts_organization_id_supplier_id_idx`(`organization_id`, `supplier_id`),
  INDEX `supplier_contracts_organization_id_status_idx`(`organization_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `trip_change_cases` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `trip_id` VARCHAR(191) NOT NULL,
  `change_type` VARCHAR(191) NOT NULL,
  `summary` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'requested',
  `impact_json` JSON NULL,
  `additional_amount` DECIMAL(14, 2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `resolution_note` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `trip_change_cases_trip_id_status_idx`(`trip_id`, `status`),
  INDEX `trip_change_cases_organization_id_idx`(`organization_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `service_incidents` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `trip_id` VARCHAR(191) NULL,
  `service_request_id` VARCHAR(191) NULL,
  `supplier_id` VARCHAR(191) NULL,
  `severity` VARCHAR(191) NOT NULL DEFAULT 'medium',
  `category` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `reported_by` VARCHAR(191) NULL,
  `assigned_user_id` VARCHAR(191) NULL,
  `traveller_impact` TEXT NULL,
  `resolution` TEXT NULL,
  `compensation_amount` DECIMAL(14, 2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `service_incidents_organization_id_status_idx`(`organization_id`, `status`),
  INDEX `service_incidents_trip_id_idx`(`trip_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `trip_closures` (
  `id` VARCHAR(191) NOT NULL,
  `trip_id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `reconciliation_note` TEXT NULL,
  `suppliers_settled` BOOLEAN NOT NULL DEFAULT false,
  `feedback_requested` BOOLEAN NOT NULL DEFAULT false,
  `close_reason` VARCHAR(191) NULL,
  `closed_by` VARCHAR(191) NULL,
  `closed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `trip_closures_trip_id_key`(`trip_id`),
  INDEX `trip_closures_organization_id_idx`(`organization_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `asset_buildings` (
  `id` VARCHAR(191) NOT NULL,
  `asset_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `floors_hint` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `asset_buildings_asset_id_idx`(`asset_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `asset_floors` (
  `id` VARCHAR(191) NOT NULL,
  `building_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `level` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `asset_floors_building_id_idx`(`building_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `housekeeping_tasks` (
  `id` VARCHAR(191) NOT NULL,
  `asset_id` VARCHAR(191) NOT NULL,
  `room_unit_id` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `priority` VARCHAR(191) NOT NULL DEFAULT 'normal',
  `checklist_json` JSON NULL,
  `assigned_user_id` VARCHAR(191) NULL,
  `due_at` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `housekeeping_tasks_asset_id_status_idx`(`asset_id`, `status`),
  INDEX `housekeeping_tasks_room_unit_id_idx`(`room_unit_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `maintenance_work_orders` (
  `id` VARCHAR(191) NOT NULL,
  `asset_id` VARCHAR(191) NOT NULL,
  `room_unit_id` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `priority` VARCHAR(191) NOT NULL DEFAULT 'normal',
  `assigned_to` VARCHAR(191) NULL,
  `estimated_cost` DECIMAL(14, 2) NULL,
  `actual_cost` DECIMAL(14, 2) NULL,
  `block_inventory` BOOLEAN NOT NULL DEFAULT false,
  `resolution` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `maintenance_work_orders_asset_id_status_idx`(`asset_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `folio_charges` (
  `id` VARCHAR(191) NOT NULL,
  `stay_reservation_id` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NOT NULL DEFAULT 'other',
  `amount` DECIMAL(14, 2) NOT NULL,
  `tax_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `folio_charges_stay_reservation_id_idx`(`stay_reservation_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `experience_products` (
  `id` VARCHAR(191) NOT NULL,
  `asset_id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `category` VARCHAR(191) NULL,
  `duration_minutes` INT NULL,
  `capacity` INT NULL,
  `age_min` INT NULL,
  `age_max` INT NULL,
  `seasonal_json` JSON NULL,
  `safety_json` JSON NULL,
  `price` DECIMAL(14, 2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `instructor_required` BOOLEAN NOT NULL DEFAULT false,
  `weather_dependent` BOOLEAN NOT NULL DEFAULT false,
  `description` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `experience_products_asset_id_is_active_idx`(`asset_id`, `is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `experience_slots` (
  `id` VARCHAR(191) NOT NULL,
  `experience_product_id` VARCHAR(191) NOT NULL,
  `start_at` DATETIME(3) NOT NULL,
  `end_at` DATETIME(3) NOT NULL,
  `capacity` INT NOT NULL,
  `reserved` INT NOT NULL DEFAULT 0,
  `held` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(191) NOT NULL DEFAULT 'available',
  INDEX `experience_slots_experience_product_id_start_at_idx`(`experience_product_id`, `start_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `meal_packages` (
  `id` VARCHAR(191) NOT NULL,
  `asset_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `meal_type` VARCHAR(191) NOT NULL,
  `price_per_person` DECIMAL(14, 2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `min_guests` INT NULL,
  `max_guests` INT NULL,
  `advance_notice_hours` INT NULL,
  `service_window` VARCHAR(191) NULL,
  `items_included_json` JSON NULL,
  `dietary_options_json` JSON NULL,
  `description` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `meal_packages_asset_id_is_active_idx`(`asset_id`, `is_active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dining_capacities` (
  `id` VARCHAR(191) NOT NULL,
  `asset_id` VARCHAR(191) NOT NULL,
  `service_date` DATE NOT NULL,
  `slot_start` DATETIME(3) NOT NULL,
  `slot_end` DATETIME(3) NOT NULL,
  `total_capacity` INT NOT NULL,
  `reserved` INT NOT NULL DEFAULT 0,
  `held` INT NOT NULL DEFAULT 0,
  `zone` VARCHAR(191) NULL,
  `stop_sell` BOOLEAN NOT NULL DEFAULT false,
  INDEX `dining_capacities_asset_id_service_date_idx`(`asset_id`, `service_date`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `meal_reservations` (
  `id` VARCHAR(191) NOT NULL,
  `asset_id` VARCHAR(191) NOT NULL,
  `meal_package_id` VARCHAR(191) NULL,
  `dining_capacity_id` VARCHAR(191) NULL,
  `service_request_id` VARCHAR(191) NULL,
  `party_id` VARCHAR(191) NULL,
  `service_at` DATETIME(3) NOT NULL,
  `guest_count` INT NOT NULL,
  `guest_name` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'requested',
  `preparation_status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `source` VARCHAR(191) NOT NULL DEFAULT 'manual',
  `dietary_json` JSON NULL,
  `rate_amount` DECIMAL(14, 2) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `rate_snapshot_json` JSON NULL,
  `policy_snapshot_json` JSON NULL,
  `notes` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `meal_reservations_asset_id_status_idx`(`asset_id`, `status`),
  INDEX `meal_reservations_asset_id_service_at_idx`(`asset_id`, `service_at`),
  INDEX `meal_reservations_service_request_id_idx`(`service_request_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `negotiated_rates` (
  `id` VARCHAR(191) NOT NULL,
  `relationship_id` VARCHAR(191) NOT NULL,
  `buyer_organization_id` VARCHAR(191) NOT NULL,
  `service_type` VARCHAR(191) NOT NULL,
  `partner_asset_id` VARCHAR(191) NULL,
  `product_ref` VARCHAR(191) NULL,
  `amount` DECIMAL(14, 2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `effective_from` DATE NULL,
  `effective_until` DATE NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `negotiated_rates_relationship_id_idx`(`relationship_id`),
  INDEX `negotiated_rates_buyer_organization_id_service_type_idx`(`buyer_organization_id`, `service_type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `partner_settlements` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `counterparty_org_id` VARCHAR(191) NOT NULL,
  `service_request_id` VARCHAR(191) NULL,
  `amount` DECIMAL(14, 2) NOT NULL,
  `commission_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `notes` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `partner_settlements_organization_id_status_idx`(`organization_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `partner_ratings` (
  `id` VARCHAR(191) NOT NULL,
  `from_organization_id` VARCHAR(191) NOT NULL,
  `target_organization_id` VARCHAR(191) NOT NULL,
  `service_request_id` VARCHAR(191) NULL,
  `score` INT NOT NULL,
  `note` TEXT NULL,
  `created_by` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `partner_ratings_target_organization_id_idx`(`target_organization_id`),
  INDEX `partner_ratings_from_organization_id_idx`(`from_organization_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `party_context_roles` ADD CONSTRAINT `party_context_roles_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `policies` ADD CONSTRAINT `policies_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `policy_attachments` ADD CONSTRAINT `policy_attachments_policy_id_fkey` FOREIGN KEY (`policy_id`) REFERENCES `policies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_buyer_organization_id_fkey` FOREIGN KEY (`buyer_organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_seller_organization_id_fkey` FOREIGN KEY (`seller_organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_partner_asset_id_fkey` FOREIGN KEY (`partner_asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `booking_components` ADD CONSTRAINT `booking_components_service_request_id_fkey` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `stay_reservations` ADD CONSTRAINT `stay_reservations_service_request_id_fkey` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `commercial_documents` ADD CONSTRAINT `commercial_documents_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `commercial_documents` ADD CONSTRAINT `commercial_documents_service_request_id_fkey` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `commercial_document_lines` ADD CONSTRAINT `commercial_document_lines_commercial_document_id_fkey` FOREIGN KEY (`commercial_document_id`) REFERENCES `commercial_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `payment_records` ADD CONSTRAINT `payment_records_commercial_document_id_fkey` FOREIGN KEY (`commercial_document_id`) REFERENCES `commercial_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `conversation_messages` ADD CONSTRAINT `conversation_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `business_timeline_events` ADD CONSTRAINT `business_timeline_events_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_contracts` ADD CONSTRAINT `supplier_contracts_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_contracts` ADD CONSTRAINT `supplier_contracts_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `trip_change_cases` ADD CONSTRAINT `trip_change_cases_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `trip_change_cases` ADD CONSTRAINT `trip_change_cases_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `service_incidents` ADD CONSTRAINT `service_incidents_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `service_incidents` ADD CONSTRAINT `service_incidents_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `service_incidents` ADD CONSTRAINT `service_incidents_service_request_id_fkey` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `service_incidents` ADD CONSTRAINT `service_incidents_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `trip_closures` ADD CONSTRAINT `trip_closures_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_buildings` ADD CONSTRAINT `asset_buildings_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_floors` ADD CONSTRAINT `asset_floors_building_id_fkey` FOREIGN KEY (`building_id`) REFERENCES `asset_buildings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_room_units` ADD CONSTRAINT `asset_room_units_building_id_fkey` FOREIGN KEY (`building_id`) REFERENCES `asset_buildings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `asset_room_units` ADD CONSTRAINT `asset_room_units_floor_id_fkey` FOREIGN KEY (`floor_id`) REFERENCES `asset_floors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `housekeeping_tasks` ADD CONSTRAINT `housekeeping_tasks_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `housekeeping_tasks` ADD CONSTRAINT `housekeeping_tasks_room_unit_id_fkey` FOREIGN KEY (`room_unit_id`) REFERENCES `asset_room_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `maintenance_work_orders` ADD CONSTRAINT `maintenance_work_orders_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `maintenance_work_orders` ADD CONSTRAINT `maintenance_work_orders_room_unit_id_fkey` FOREIGN KEY (`room_unit_id`) REFERENCES `asset_room_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `folio_charges` ADD CONSTRAINT `folio_charges_stay_reservation_id_fkey` FOREIGN KEY (`stay_reservation_id`) REFERENCES `stay_reservations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `experience_products` ADD CONSTRAINT `experience_products_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `experience_slots` ADD CONSTRAINT `experience_slots_experience_product_id_fkey` FOREIGN KEY (`experience_product_id`) REFERENCES `experience_products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meal_packages` ADD CONSTRAINT `meal_packages_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `dining_capacities` ADD CONSTRAINT `dining_capacities_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meal_reservations` ADD CONSTRAINT `meal_reservations_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meal_reservations` ADD CONSTRAINT `meal_reservations_meal_package_id_fkey` FOREIGN KEY (`meal_package_id`) REFERENCES `meal_packages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `meal_reservations` ADD CONSTRAINT `meal_reservations_dining_capacity_id_fkey` FOREIGN KEY (`dining_capacity_id`) REFERENCES `dining_capacities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `meal_reservations` ADD CONSTRAINT `meal_reservations_service_request_id_fkey` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `negotiated_rates` ADD CONSTRAINT `negotiated_rates_relationship_id_fkey` FOREIGN KEY (`relationship_id`) REFERENCES `org_relationships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `negotiated_rates` ADD CONSTRAINT `negotiated_rates_buyer_organization_id_fkey` FOREIGN KEY (`buyer_organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `partner_settlements` ADD CONSTRAINT `partner_settlements_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `partner_settlements` ADD CONSTRAINT `partner_settlements_service_request_id_fkey` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `partner_ratings` ADD CONSTRAINT `partner_ratings_from_organization_id_fkey` FOREIGN KEY (`from_organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `partner_ratings` ADD CONSTRAINT `partner_ratings_target_organization_id_fkey` FOREIGN KEY (`target_organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `partner_ratings` ADD CONSTRAINT `partner_ratings_service_request_id_fkey` FOREIGN KEY (`service_request_id`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
