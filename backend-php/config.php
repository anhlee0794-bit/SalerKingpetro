<?php
/**
 * CẤU HÌNH KẾT NỐI HỆ THỐNG SALERKINGPETRO (PHP + MYSQL)
 * Hosting BNIX / DirectAdmin
 */

// Bật thông báo lỗi trong giai đoạn phát triển (tắt khi lên production nếu muốn)
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Cấu hình Database MySQL trên Hosting của bạn (139.99.50.190)
define('DB_HOST', 'localhost');
define('DB_NAME', 'luatdoan_kingpetrosaler');
define('DB_USER', 'luatdoan_kingpetrosaler');
define('DB_PASS', 'kingpetrosaler283147Aa@');
define('DB_CHARSET', 'utf8mb4');

// Cấu hình URL Web App của Google Apps Script để tự động đồng bộ (Sync)
// Nhập đường link Google Apps Script Web App của bạn vào đây (dạng https://script.google.com/macros/s/.../exec)
define('GOOGLE_APPS_SCRIPT_URL', '');

// Cho phép đồng bộ sang Google Sheets ngầm (true: Bật đồng bộ, false: Chỉ lưu MySQL)
define('SYNC_TO_GOOGLE_SHEETS', true);

// Thiết lập múi giờ Việt Nam
date_default_timezone_set('Asia/Ho_Chi_Minh');

/**
 * Khởi tạo kết nối PDO MySQL
 */
function getDbConnection()
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Lỗi kết nối cơ sở dữ liệu MySQL: ' . $e->getMessage()
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    return $pdo;
}
