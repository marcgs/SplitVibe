-- Add per-user preferred display currency
ALTER TABLE "User" ADD COLUMN "preferredCurrency" TEXT NOT NULL DEFAULT 'USD';

-- Enforce one ExchangeRate row per (fromCcy, toCcy, recordedAt) to support
-- daily upserts from the Frankfurter background refresh.
CREATE UNIQUE INDEX "ExchangeRate_fromCcy_toCcy_recordedAt_key"
  ON "ExchangeRate"("fromCcy", "toCcy", "recordedAt");
