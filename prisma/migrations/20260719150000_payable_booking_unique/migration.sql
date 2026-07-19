-- Idempotent payable dual-write: one commercial doc per org+direction+link.
-- MySQL unique indexes allow multiple NULLs on linked_entity_id (open drafts).
CREATE UNIQUE INDEX `commercial_documents_org_dir_link_uidx`
  ON `commercial_documents` (`organization_id`, `direction`, `linked_entity_type`, `linked_entity_id`);
