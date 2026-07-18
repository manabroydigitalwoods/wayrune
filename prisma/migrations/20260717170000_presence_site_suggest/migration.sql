-- AlterTable
ALTER TABLE `presence_sites` ADD COLUMN `suggest_json` JSON NULL;

-- AlterTable
ALTER TABLE `presence_pages` ADD COLUMN `suggest_json` JSON NULL;

-- AlterTable
ALTER TABLE `presence_site_templates` ADD COLUMN `suggest_json` JSON NULL;

-- AlterTable
ALTER TABLE `presence_page_templates` ADD COLUMN `suggest_json` JSON NULL;
