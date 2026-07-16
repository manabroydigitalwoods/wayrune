-- AlterTable (MySQL)
ALTER TABLE `service_offerings` ADD COLUMN `modifiers_json` JSON NULL;

-- AlterTable
ALTER TABLE `service_order_items` ADD COLUMN `modifiers_snapshot_json` JSON NULL;

-- AlterTable
ALTER TABLE `commercial_documents` ADD COLUMN `e_invoice_json` JSON NULL;
