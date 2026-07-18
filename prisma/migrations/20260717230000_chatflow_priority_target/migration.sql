-- AlterTable
ALTER TABLE `presence_chat_widgets`
  ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN `target_rules_json` JSON NULL;

CREATE INDEX `presence_chat_widgets_organization_id_priority_idx` ON `presence_chat_widgets`(`organization_id`, `priority`);
