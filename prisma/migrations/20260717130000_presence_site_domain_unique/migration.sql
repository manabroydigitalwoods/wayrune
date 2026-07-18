-- Unique custom domain per website (multiple NULLs allowed).
CREATE UNIQUE INDEX `presence_sites_primary_domain_key` ON `presence_sites`(`primary_domain`);
