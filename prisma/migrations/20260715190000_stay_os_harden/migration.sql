-- Stay OS harden (A-STAY-02): soft-folio payments on stay reservations

ALTER TABLE `stay_reservations`
  ADD COLUMN `amount_paid` DECIMAL(14, 2) NOT NULL DEFAULT 0;
