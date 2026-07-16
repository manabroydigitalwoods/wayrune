-- RBAC Integrity 1.0: session invalidation on role/membership change.
-- `auth_version` is snapshotted into the access token; the guard rejects a token
-- once this value is bumped, so permission changes take effect promptly.

ALTER TABLE `organization_memberships`
  ADD COLUMN `auth_version` INTEGER NOT NULL DEFAULT 0;
