-- ========================================================
-- CƠ SỞ DỮ LIỆU SALERKINGPETRO (MYSQL / MARIADB)
-- Hệ thống Quản lý Chăm sóc Khách hàng & Sales Field
-- Database: luatdoan_dbhoanganh
-- Domain: https://luatcattien.vn
-- Bảng mã: utf8mb4_unicode_ci (Hỗ trợ tiếng Việt đầy đủ)
-- Phiên bản cập nhật mới nhất từ Git (Bao gồm RBAC, Approval Flow, Quản lý Sản phẩm)
-- ========================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. BẢNG USERS (Tài khoản người dùng: Quản lý, Sales, Admin)
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `user_id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `role` ENUM('ADMIN', 'MANAGER', 'SALES') NOT NULL DEFAULT 'SALES',
  `phone` VARCHAR(20) DEFAULT NULL,
  `team` VARCHAR(100) DEFAULT 'North Team',
  `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. BẢNG CUSTOMERS (Khách hàng & Đại lý phân phối)
DROP TABLE IF EXISTS `customers`;
CREATE TABLE `customers` (
  `customer_id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `customer_name` VARCHAR(200) NOT NULL,
  `contact_name` VARCHAR(100) DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `latitude` DECIMAL(10, 7) NOT NULL DEFAULT 0.0000000,
  `longitude` DECIMAL(10, 7) NOT NULL DEFAULT 0.0000000,
  `assigned_sales_id` VARCHAR(50) DEFAULT 'USR-002',
  `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  `note` TEXT DEFAULT NULL,
  `customer_type` ENUM('VIP', 'NORMAL', 'SMALL') NOT NULL DEFAULT 'NORMAL',
  `care_cycle_days` INT NOT NULL DEFAULT 7,
  `last_care_date` DATETIME DEFAULT NULL,
  `next_care_date` DATETIME DEFAULT NULL,
  `current_debt` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `current_stock` INT NOT NULL DEFAULT 0,
  `stock_unit` VARCHAR(50) DEFAULT 'Thùng',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_assigned_sales` (`assigned_sales_id`),
  INDEX `idx_coords` (`latitude`, `longitude`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. BẢNG WORK_SESSIONS (Phiên làm việc / Ca chấm công GPS)
DROP TABLE IF EXISTS `work_sessions`;
CREATE TABLE `work_sessions` (
  `session_id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `sales_id` VARCHAR(50) NOT NULL,
  `date` DATE NOT NULL,
  `check_in_time` DATETIME NOT NULL,
  `check_in_lat` DECIMAL(10, 7) DEFAULT NULL,
  `check_in_lng` DECIMAL(10, 7) DEFAULT NULL,
  `check_in_accuracy` DECIMAL(8, 2) DEFAULT NULL,
  `check_out_time` DATETIME DEFAULT NULL,
  `check_out_lat` DECIMAL(10, 7) DEFAULT NULL,
  `check_out_lng` DECIMAL(10, 7) DEFAULT NULL,
  `work_duration` INT NOT NULL DEFAULT 0 COMMENT 'Thời lượng làm việc tính theo phút',
  `status` ENUM('WORKING', 'COMPLETED') NOT NULL DEFAULT 'WORKING',
  INDEX `idx_sales_date` (`sales_id`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. BẢNG GPS_LOGS (Nhật ký tọa độ định kỳ di chuyển)
DROP TABLE IF EXISTS `gps_logs`;
CREATE TABLE `gps_logs` (
  `log_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `gps_log_id` VARCHAR(50) DEFAULT NULL,
  `session_id` VARCHAR(50) NOT NULL,
  `sales_id` VARCHAR(50) NOT NULL,
  `timestamp` DATETIME NOT NULL,
  `latitude` DECIMAL(10, 7) NOT NULL,
  `longitude` DECIMAL(10, 7) NOT NULL,
  `accuracy` DECIMAL(8, 2) DEFAULT 0,
  `speed` DECIMAL(8, 2) DEFAULT 0,
  `activity_status` VARCHAR(50) DEFAULT 'STATIONARY',
  INDEX `idx_session_time` (`session_id`, `timestamp`),
  INDEX `idx_sales_time` (`sales_id`, `timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. BẢNG VISITS (Lịch sử ghé thăm điểm bán & 4 khối Chăm sóc khách hàng)
DROP TABLE IF EXISTS `visits`;
CREATE TABLE `visits` (
  `visit_id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `sales_id` VARCHAR(50) NOT NULL,
  `customer_id` VARCHAR(50) NOT NULL,
  `session_id` VARCHAR(50) DEFAULT NULL,
  `check_in_time` DATETIME NOT NULL,
  `check_in_lat` DECIMAL(10, 7) DEFAULT NULL,
  `check_in_lng` DECIMAL(10, 7) DEFAULT NULL,
  `check_in_accuracy` DECIMAL(8, 2) DEFAULT NULL,
  `check_out_time` DATETIME DEFAULT NULL,
  `duration` INT NOT NULL DEFAULT 0 COMMENT 'Phút ghé thăm',
  `result` VARCHAR(100) DEFAULT NULL,
  `note` TEXT DEFAULT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
  -- 4 Khối dữ liệu Chăm sóc chuyên sâu Kingpetro
  `distributed_qty` INT DEFAULT 0,
  `inventory_qty` INT DEFAULT 0,
  `reorder_demand` INT DEFAULT 0,
  `recorded_debt` DECIMAL(15, 2) DEFAULT 0,
  `debt_limit` DECIMAL(15, 2) DEFAULT 0,
  `payment_status` VARCHAR(50) DEFAULT NULL,
  `new_order_qty` INT DEFAULT 0,
  `expected_next_order` VARCHAR(100) DEFAULT NULL,
  `consumption_rate` VARCHAR(100) DEFAULT NULL,
  `discussion_details` TEXT DEFAULT NULL,
  `customer_issues` TEXT DEFAULT NULL,
  `next_care_needs` TEXT DEFAULT NULL,
  `selected_product` VARCHAR(200) DEFAULT NULL,
  `distributed_unit` VARCHAR(50) DEFAULT 'Thùng',
  `inventory_unit` VARCHAR(50) DEFAULT 'Thùng',
  `reorder_unit` VARCHAR(50) DEFAULT 'Thùng',
  `new_order_unit` VARCHAR(50) DEFAULT 'Thùng',
  INDEX `idx_sales_cust` (`sales_id`, `customer_id`),
  INDEX `idx_checkin_time` (`check_in_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. BẢNG SCHEDULES (Lịch hẹn tuyến bán hàng)
DROP TABLE IF EXISTS `schedules`;
CREATE TABLE `schedules` (
  `schedule_id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `sales_id` VARCHAR(50) NOT NULL,
  `customer_id` VARCHAR(50) NOT NULL,
  `date` DATE NOT NULL,
  `start_time` TIME DEFAULT NULL,
  `end_time` TIME DEFAULT NULL,
  `note` TEXT DEFAULT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  INDEX `idx_sales_sched` (`sales_id`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. BẢNG CUSTOMER_UPDATE_REQUESTS (Hàng chờ phê duyệt cập nhật thông tin khách hàng)
DROP TABLE IF EXISTS `customer_update_requests`;
CREATE TABLE `customer_update_requests` (
  `request_id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `customer_id` VARCHAR(50) NOT NULL,
  `customer_name` VARCHAR(200) NOT NULL,
  `sales_id` VARCHAR(50) NOT NULL,
  `sales_name` VARCHAR(100) NOT NULL,
  `old_data` LONGTEXT NOT NULL COMMENT 'Dữ liệu cũ dạng JSON',
  `new_data` LONGTEXT NOT NULL COMMENT 'Dữ liệu mới đề xuất dạng JSON',
  `reason` TEXT DEFAULT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` DATETIME DEFAULT NULL,
  `approver_name` VARCHAR(100) DEFAULT NULL,
  `reject_reason` TEXT DEFAULT NULL,
  INDEX `idx_req_status` (`status`),
  INDEX `idx_req_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. BẢNG PRODUCTS (Danh mục sản phẩm dầu nhờn Kingpetro)
DROP TABLE IF EXISTS `products`;
CREATE TABLE `products` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `default_unit` VARCHAR(50) NOT NULL DEFAULT 'Thùng',
  `ratio` INT NOT NULL DEFAULT 1,
  `base_unit` VARCHAR(50) NOT NULL DEFAULT 'Chai',
  `price` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `spec` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_prd_category` (`category`),
  INDEX `idx_prd_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. BẢNG SETTINGS (Cấu hình hệ thống)
DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `setting_key` VARCHAR(100) NOT NULL PRIMARY KEY,
  `setting_value` TEXT NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. BẢNG LOGS (Nhật ký đồng bộ & Hoạt động)
DROP TABLE IF EXISTS `logs`;
CREATE TABLE `logs` (
  `log_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `level` VARCHAR(20) NOT NULL DEFAULT 'INFO',
  `source` VARCHAR(100) DEFAULT 'API',
  `message` TEXT NOT NULL,
  `payload` LONGTEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- KHỞI TẠO DỮ LIỆU MẪU BAN ĐẦU (SEED DATA)
-- ========================================================

-- Seed Users (Bao gồm Admin USR-000, Quản lý, Sales)
INSERT INTO `users` (`user_id`, `name`, `email`, `role`, `phone`, `team`, `status`) VALUES
('USR-000', 'Admin Hệ Thống', 'admin@company.com', 'ADMIN', '0901234500', 'HQ', 'ACTIVE'),
('USR-001', 'Quản Lý Nguyễn', 'manager@company.com', 'MANAGER', '0901234567', 'North Team', 'ACTIVE'),
('USR-002', 'Nguyễn Văn A', 'sales.a@company.com', 'SALES', '0901234568', 'North Team', 'ACTIVE'),
('USR-003', 'Trần Thị B', 'sales.b@company.com', 'SALES', '0901234569', 'North Team', 'ACTIVE'),
('USR-004', 'Lê Văn C', 'sales.c@company.com', 'SALES', '0901234570', 'North Team', 'ACTIVE');

-- Seed Customers
INSERT INTO `customers` (`customer_id`, `customer_name`, `contact_name`, `phone`, `address`, `latitude`, `longitude`, `assigned_sales_id`, `status`, `note`, `customer_type`, `care_cycle_days`, `last_care_date`, `next_care_date`, `current_debt`, `current_stock`, `stock_unit`) VALUES
('CUST-001', 'Đại lý Tạp Hóa Minh Phát', 'Anh Minh', '0912345601', '128 Nguyễn Trãi, Q.1, TP.HCM', 10.7685000, 106.6892000, 'USR-002', 'ACTIVE', 'Khách hàng lớn, cần theo dõi tồn kho sát sao', 'VIP', 3, '2026-09-11 08:30:00', '2026-09-14 08:30:00', 28000000.00, 40, 'Thùng'),
('CUST-002', 'Siêu Thị Mini VinaMart', 'Chị Lan', '0912345602', '45 Lê Lợi, Bến Nghé, Q.1, TP.HCM', 10.7769000, 106.7009000, 'USR-002', 'ACTIVE', 'Giao hàng buổi sáng', 'NORMAL', 7, '2026-09-13 09:15:00', '2026-09-20 09:15:00', 12000000.00, 85, 'Chai'),
('CUST-003', 'Nhà Phân Phối Bách Hóa Á Châu', 'Anh Hùng', '0912345603', '320 Cách Mạng Tháng 8, Q.3, TP.HCM', 10.7812000, 106.6775000, 'USR-003', 'ACTIVE', 'Doanh số tốt, đang đàm phán hợp đồng mở rộng', 'VIP', 3, '2026-09-17 10:00:00', '2026-09-20 10:00:00', 45000000.00, 180, 'Xô'),
('CUST-004', 'Cửa Hàng Tiện Lợi Sao Mai', 'Cô Mai', '0912345604', '88 Hai Bà Trưng, Q.1, TP.HCM', 10.7801000, 106.6998000, 'USR-002', 'ACTIVE', 'Đã quá hạn 7 ngày chưa được chăm sóc!', 'NORMAL', 7, '2026-09-05 14:20:00', '2026-09-12 14:20:00', 35000000.00, 30, 'Bình'),
('CUST-005', 'Đại Lý Sữa Bỉm Khang Thịnh', 'Anh Thịnh', '0912345605', '15 Lý Thường Kiệt, Q.10, TP.HCM', 10.7628000, 106.6587000, 'USR-004', 'ACTIVE', 'Khách hàng mới chưa từng được chăm sóc', 'SMALL', 14, NULL, NULL, 0.00, 0, 'Phuy');

-- Seed Products
INSERT INTO `products` (`id`, `name`, `category`, `default_unit`, `ratio`, `base_unit`, `price`, `status`, `spec`) VALUES
('PRD-001', 'Sơn Ngoại Thất Cao Cấp SuperShield', 'Sơn Phủ', 'Thùng', 24, 'Chai', 1250000.00, 'ACTIVE', 'Thùng 20L (quy cách 24 lon)'),
('PRD-002', 'Dung Dịch Phủ Bóng Nano Pro', 'Phụ Gia', 'Chai', 1, 'Chai', 180000.00, 'ACTIVE', 'Chai 1L'),
('PRD-003', 'Sơn Lót Kháng Kiềm Chống Kiềm Hóa', 'Sơn Lót', 'Xô', 18, 'Chai', 890000.00, 'ACTIVE', 'Xô tiêu chuẩn 18L'),
('PRD-004', 'Keo Chống Thấm Polyurethane Công Nghiệp', 'Chống Thấm', 'Phuy', 200, 'Chai', 9500000.00, 'ACTIVE', 'Phuy thép 200L'),
('PRD-005', 'Dung Môi Tẩy Rửa & Pha Sơn Eco', 'Dung Môi', 'Bình', 4, 'Chai', 320000.00, 'ACTIVE', 'Can 4L'),
('PRD-006', 'Dầu Nhờn Động Cơ KingPetro Heavy-Duty', 'Dầu Nhờn & Mỡ Bôi Trơn', 'Thùng', 24, 'Chai', 1450000.00, 'ACTIVE', 'Thùng 24 lon x 1L'),
('PRD-007', 'Mỡ Bôi Trơn Công Nghiệp Chịu Nhiệt EP-3', 'Dầu Nhờn & Mỡ Bôi Trơn', 'Xô', 18, 'Chai', 1680000.00, 'INACTIVE', 'Xô 18kg');

-- Seed Customer Update Requests
INSERT INTO `customer_update_requests` (`request_id`, `customer_id`, `customer_name`, `sales_id`, `sales_name`, `old_data`, `new_data`, `reason`, `status`, `created_at`, `resolved_at`, `approver_name`, `reject_reason`) VALUES
('REQ-DEMO-001', 'CUST-001', 'Đại lý Tạp Hóa Minh Phát', 'USR-002', 'Nguyễn Văn A', '{"contactName":"Anh Minh","phone":"0912345601","customerType":"VIP","address":"128 Nguyễn Trãi, Q.1, TP.HCM"}', '{"contactName":"Anh Minh (Chủ mới)","phone":"0988776655","customerType":"VIP","address":"128 Nguyễn Trãi, P.Bến Thành, Q.1, TP.HCM"}', 'Khách đổi số điện thoại liên hệ chính và cập nhật người đứng tên cửa hàng.', 'PENDING', NOW(), NULL, NULL, NULL),
('REQ-DEMO-002', 'CUST-002', 'Siêu Thị Mini VinaMart', 'USR-002', 'Nguyễn Văn A', '{"contactName":"Chị Lan","phone":"0912345602","customerType":"NORMAL","address":"45 Lê Lợi, Bến Nghé, Q.1, TP.HCM"}', '{"contactName":"Chị Lan Quản Lý","phone":"0912345602","customerType":"VIP","address":"45 Lê Lợi, Bến Nghé, Q.1, TP.HCM"}', 'Đề xuất nâng hạng lên VIP do doanh số tháng này vượt 50 triệu.', 'APPROVED', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 'Quản Lý Nguyễn', NULL);

-- Seed Settings
INSERT INTO `settings` (`setting_key`, `setting_value`, `description`) VALUES
('GPS_INTERVAL', '5', 'Chu kỳ ghi GPS (phút): 1, 5, 10, 15'),
('CUSTOMER_RADIUS', '200', 'Bán kính cho phép check-in khách hàng (mét)'),
('MOVING_SPEED_THRESHOLD', '1.2', 'Ngưỡng tốc độ xác định di chuyển (m/s)'),
('STATIONARY_DISTANCE_THRESHOLD', '30', 'Ngưỡng khoảng cách tối đa coi là đứng yên (mét)'),
('STATIONARY_TIME', '15', 'Thời gian đứng yên tối thiểu để cảnh báo (phút)'),
('GPS_ACCURACY_LIMIT', '80', 'Giới hạn độ sai số GPS chấp nhận được (mét)'),
('CARE_CYCLE_VIP', '3', 'Chu kỳ chăm sóc Khách lớn/VIP (ngày)'),
('CARE_CYCLE_NORMAL', '7', 'Chu kỳ chăm sóc Khách thường (ngày)'),
('CARE_CYCLE_SMALL', '14', 'Chu kỳ chăm sóc Khách nhỏ (ngày)'),
('OVERDUE_WARNING_DAYS', '1', 'Số ngày cảnh báo sắp đến hạn (ngày)');

SET FOREIGN_KEY_CHECKS = 1;
