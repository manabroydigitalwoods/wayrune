-- Administration maturity (P2): member invitations.
-- Tokenised invite to join an existing organization with a preset role set.
-- Accepting creates the membership (and the User, when the invitee has no
-- account yet). Mirrors the SupplierInvite token pattern.

CREATE TABLE `member_invites` (
  `id` VARCHAR(191) NOT NULL,
  `organization_id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `full_name` VARCHAR(191) NULL,
  `role_ids_json` JSON NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `invited_by` VARCHAR(191) NULL,
  `accepted_user_id` VARCHAR(191) NULL,
  `accepted_at` DATETIME(3) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `member_invites_token_hash_key` (`token_hash`),
  INDEX `member_invites_organization_id_status_idx` (`organization_id`, `status`),
  INDEX `member_invites_email_idx` (`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
