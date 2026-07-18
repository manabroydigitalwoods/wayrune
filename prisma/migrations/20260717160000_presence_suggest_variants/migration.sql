-- AlterTable
ALTER TABLE `presence_themes` ADD COLUMN `suggest_json` JSON NULL;

-- AlterTable
ALTER TABLE `presence_module_definitions` ADD COLUMN `variants_json` JSON NULL,
    ADD COLUMN `suggest_json` JSON NULL;
