-- Guest Services QR Phase 1
ALTER TABLE `stay_reservations` ADD COLUMN `room_service_pin` VARCHAR(8) NULL;

ALTER TABLE `folio_charges` ADD COLUMN `table_session_id` VARCHAR(191) NULL;
CREATE INDEX `folio_charges_table_session_id_idx` ON `folio_charges`(`table_session_id`);

CREATE TABLE `service_locations` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `location_type` VARCHAR(191) NOT NULL,
    `location_ref` VARCHAR(191) NULL,
    `label` VARCHAR(191) NOT NULL,
    `public_token` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `last_scanned_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_locations_public_token_key`(`public_token`),
    INDEX `service_locations_organization_id_asset_id_idx`(`organization_id`, `asset_id`),
    INDEX `service_locations_asset_id_status_idx`(`asset_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `service_offerings` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'other',
    `kind` VARCHAR(191) NOT NULL DEFAULT 'food',
    `unit_price` DECIMAL(14, 2) NOT NULL,
    `tax_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `dietary_labels` JSON NULL,
    `image_url` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `stop_sell` BOOLEAN NOT NULL DEFAULT false,
    `max_quantity` INTEGER NULL,
    `prep_minutes` INTEGER NULL,
    `available_from` VARCHAR(5) NULL,
    `available_until` VARCHAR(5) NULL,
    `created_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `service_offerings_organization_id_asset_id_is_active_idx`(`organization_id`, `asset_id`, `is_active`),
    INDEX `service_offerings_asset_id_category_idx`(`asset_id`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `table_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `service_location_id` VARCHAR(191) NOT NULL,
    `guest_count` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `opened_by` VARCHAR(191) NULL,
    `opened_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `table_sessions_asset_id_status_idx`(`asset_id`, `status`),
    INDEX `table_sessions_service_location_id_status_idx`(`service_location_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `service_orders` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `service_location_id` VARCHAR(191) NOT NULL,
    `table_session_id` VARCHAR(191) NULL,
    `stay_reservation_id` VARCHAR(191) NULL,
    `source_type` VARCHAR(191) NOT NULL DEFAULT 'QR',
    `status` VARCHAR(191) NOT NULL DEFAULT 'placed',
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `tax_total` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(14, 2) NOT NULL,
    `customer_note` TEXT NULL,
    `idempotency_key` VARCHAR(191) NULL,
    `folio_posted_at` DATETIME(3) NULL,
    `placed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `accepted_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `service_orders_asset_id_status_idx`(`asset_id`, `status`),
    INDEX `service_orders_service_location_id_placed_at_idx`(`service_location_id`, `placed_at`),
    INDEX `service_orders_table_session_id_idx`(`table_session_id`),
    INDEX `service_orders_stay_reservation_id_idx`(`stay_reservation_id`),
    UNIQUE INDEX `service_orders_organization_id_idempotency_key_key`(`organization_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `service_order_items` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `offering_id` VARCHAR(191) NULL,
    `name_snapshot` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit_price_snapshot` DECIMAL(14, 2) NOT NULL,
    `tax_snapshot` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `line_total` DECIMAL(14, 2) NOT NULL,
    `instructions` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'placed',

    INDEX `service_order_items_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `guest_service_requests` (
    `id` VARCHAR(191) NOT NULL,
    `organization_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `service_location_id` VARCHAR(191) NOT NULL,
    `stay_reservation_id` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'housekeeping',
    `title` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'requested',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,

    INDEX `guest_service_requests_asset_id_status_idx`(`asset_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `service_locations` ADD CONSTRAINT `service_locations_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `service_locations` ADD CONSTRAINT `service_locations_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `service_offerings` ADD CONSTRAINT `service_offerings_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `service_offerings` ADD CONSTRAINT `service_offerings_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `table_sessions` ADD CONSTRAINT `table_sessions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `table_sessions` ADD CONSTRAINT `table_sessions_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `table_sessions` ADD CONSTRAINT `table_sessions_service_location_id_fkey` FOREIGN KEY (`service_location_id`) REFERENCES `service_locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_service_location_id_fkey` FOREIGN KEY (`service_location_id`) REFERENCES `service_locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_table_session_id_fkey` FOREIGN KEY (`table_session_id`) REFERENCES `table_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `service_orders` ADD CONSTRAINT `service_orders_stay_reservation_id_fkey` FOREIGN KEY (`stay_reservation_id`) REFERENCES `stay_reservations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `service_order_items` ADD CONSTRAINT `service_order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `service_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `service_order_items` ADD CONSTRAINT `service_order_items_offering_id_fkey` FOREIGN KEY (`offering_id`) REFERENCES `service_offerings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `guest_service_requests` ADD CONSTRAINT `guest_service_requests_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `guest_service_requests` ADD CONSTRAINT `guest_service_requests_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `partner_assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `guest_service_requests` ADD CONSTRAINT `guest_service_requests_service_location_id_fkey` FOREIGN KEY (`service_location_id`) REFERENCES `service_locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `folio_charges` ADD CONSTRAINT `folio_charges_table_session_id_fkey` FOREIGN KEY (`table_session_id`) REFERENCES `table_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
