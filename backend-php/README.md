# HƯỚNG DẪN TRIỂN KHAI BACKEND PHP + MYSQL TRÊN HOSTING BNIX

Hệ thống cho phép lưu trữ dữ liệu chính trên **MySQL riêng của Hosting** và **tự động đồng bộ sang Google Sheets**.

---

### BƯỚC 1: TẠO DATABASE MYSQL TRÊN DIRECTADMIN (BNIX)
1. Đăng nhập vào trang quản trị **DirectAdmin** của BNIX.
2. Tìm mục **MySQL Management** (Quản lý MySQL) > Chọn **Create New Database** (Tạo Database mới).
3. Điền tên Database, User và Mật khẩu (Ví dụ: `u123_saler`, User: `u123_saler`).
4. Nhấn **Create** và lưu lại thông tin kết nối này.

---

### BƯỚC 2: IMPORT DỮ LIỆU BẢNG (SCHEMA)
1. Trong DirectAdmin, mở công cụ **phpMyAdmin**.
2. Đăng nhập vào database vừa tạo.
3. Chọn thẻ **Import** (Nhập) > Chọn file [schema.sql](file:///e:/SaleKingpetro/SalerKingpetro/backend-php/schema.sql) trong thư mục này.
4. Nhấn **Import** (Thực hiện). Hệ thống sẽ tự động tạo đủ 8 bảng chuẩn hóa với dữ liệu mẫu ban đầu.

---

### BƯỚC 3: CẤU HÌNH THÔNG TIN KẾT NỐI
Mở file [config.php](file:///e:/SaleKingpetro/SalerKingpetro/backend-php/config.php) và điền các thông tin:
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'tên_database_vừa_tạo');
define('DB_USER', 'user_database_vừa_tạo');
define('DB_PASS', 'mật_khẩu_vừa_tạo');

// Dán link Google Apps Script Web App của bạn vào đây để tự động ghi thêm 1 bản sao vào Google Sheets:
define('GOOGLE_APPS_SCRIPT_URL', 'https://script.google.com/macros/s/.../exec');
```

---

### BƯỚC 4: UPLOAD LÊN HOSTING
1. Trong thư mục `public_html` trên Hosting:
   - Tải toàn bộ nội dung trong thư mục `frontend/` lên thư mục gốc `public_html`.
   - Tạo 1 thư mục con tên là `api` hoặc đặt các file trong `backend-php/` vào thư mục `public_html/api/`.
2. Truy cập ứng dụng qua tên miền của bạn (ví dụ: `https://tenmien.com`).
3. Vào phần **Cài đặt** của ứng dụng > Dán đường dẫn API: `https://tenmien.com/api/api.php` là hoàn tất!
