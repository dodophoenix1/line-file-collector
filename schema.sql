-- Database Schema for LINE File Collector
-- You can import this file directly into phpMyAdmin

CREATE TABLE IF NOT EXISTS `files` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `size` BIGINT NOT NULL,
  `size_formatted` VARCHAR(50) NOT NULL,
  `drive_file_id` VARCHAR(255) DEFAULT NULL,
  `drive_url` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
