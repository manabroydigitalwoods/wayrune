-- Drive as file-manager storage: Document Drive ids + org toggle
ALTER TABLE `documents` ADD COLUMN `storage_provider` VARCHAR(191) NOT NULL DEFAULT 'local';
ALTER TABLE `documents` ADD COLUMN `drive_file_id` VARCHAR(191) NULL;
ALTER TABLE `documents` ADD COLUMN `drive_web_view_link` TEXT NULL;

ALTER TABLE `google_connections` ADD COLUMN `use_drive_as_file_storage` BOOLEAN NOT NULL DEFAULT false;
