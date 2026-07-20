-- Write-once tax identity freeze on quotation versions (display POS / GSTIN).
ALTER TABLE `quotation_versions`
  ADD COLUMN `tax_identity_json` JSON NULL;
