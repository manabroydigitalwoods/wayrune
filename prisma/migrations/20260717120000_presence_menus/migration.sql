-- Named site menus + theme location assignments (v1; no separate menu table).
ALTER TABLE `presence_sites`
  ADD COLUMN `menus_json` JSON NULL,
  ADD COLUMN `menu_assignments_json` JSON NULL;
