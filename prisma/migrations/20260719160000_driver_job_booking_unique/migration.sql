-- One DriverJob per agency booking component (agency upsert).
-- MySQL unique indexes allow multiple NULLs on booking_component_id.
CREATE UNIQUE INDEX `driver_jobs_booking_component_id_uidx`
  ON `driver_jobs` (`booking_component_id`);
