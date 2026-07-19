-- Bind Razorpay order to instalment for payment-link confirm integrity.
ALTER TABLE `trip_payments`
  ADD COLUMN `payment_link_razorpay_order_id` VARCHAR(64) NULL,
  ADD COLUMN `payment_link_razorpay_amount_paise` INT NULL;

CREATE INDEX `trip_payments_razorpay_order_id_idx`
  ON `trip_payments` (`payment_link_razorpay_order_id`);
