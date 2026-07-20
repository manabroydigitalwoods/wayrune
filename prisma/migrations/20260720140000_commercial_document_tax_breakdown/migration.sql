-- Structured tax breakdown on commercial documents (export-friendly; not filing).
ALTER TABLE "commercial_documents" ADD COLUMN IF NOT EXISTS "tax_breakdown_json" JSONB;
