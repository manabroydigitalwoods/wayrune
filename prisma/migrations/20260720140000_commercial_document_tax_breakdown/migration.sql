-- Structured tax breakdown on commercial documents (export-friendly; not filing).
ALTER TABLE `commercial_documents` ADD COLUMN `tax_breakdown_json` JSON NULL;
