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
define('SYNC_TO_GOOGLE_SHEETS', false);

// Số ngày lưu giữ tọa độ GPS thô trong bảng gps_logs (Lịch sử chăm sóc bảng visits giữ vĩnh viễn)
define('GPS_LOG_RETENTION_DAYS', 90);

// Thiết lập múi giờ Việt Nam
date_default_timezone_set('Asia/Ho_Chi_Minh');

// Cấu hình Auth Token (JWT HS256) - Lưu phiên đăng nhập 3 ngày (259,200 giây)
define('AUTH_TOKEN_TTL_SECONDS', 3 * 86400);
define('AUTH_TOKEN_SECRET', 'KingPetro_Saler_JWT_Secret_2026_' . hash('sha256', DB_NAME . '|' . DB_PASS));

/**
 * Mã hóa Base64 chuẩn URL-safe (dùng cho JWT)
 */
function base64UrlEncode($data)
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/**
 * Giải mã Base64 chuẩn URL-safe
 */
function base64UrlDecode($data)
{
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

/**
 * Sinh Auth Token chuẩn JWT (HMAC-SHA256) có thời hạn 3 ngày
 */
function generateAuthToken(array $user, $ttlSeconds = AUTH_TOKEN_TTL_SECONDS)
{
    $now = time();
    $exp = $now + (int)$ttlSeconds;

    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $payload = [
        'sub'   => $user['user_id'],
        'email' => $user['email'],
        'role'  => $user['role'],
        'iat'   => $now,
        'exp'   => $exp
    ];

    $headerEncoded  = base64UrlEncode(json_encode($header));
    $payloadEncoded = base64UrlEncode(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $signature      = hash_hmac('sha256', $headerEncoded . '.' . $payloadEncoded, AUTH_TOKEN_SECRET, true);
    $jwt            = $headerEncoded . '.' . $payloadEncoded . '.' . base64UrlEncode($signature);

    return [
        'token'      => $jwt,
        'expiresAt'  => $exp * 1000, // Milliseconds cho JavaScript Date.now()
        'ttlSeconds' => (int)$ttlSeconds
    ];
}

/**
 * Xác thực chữ ký và hạn sử dụng của Auth Token (JWT HS256)
 * Trả về mảng payload nếu hợp lệ & còn hạn, ngược lại trả về null
 */
function verifyAuthToken($token)
{
    if (empty($token) || !is_string($token)) {
        return null;
    }

    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    list($headerEncoded, $payloadEncoded, $signatureEncoded) = $parts;
    $expectedSig = base64UrlEncode(hash_hmac('sha256', $headerEncoded . '.' . $payloadEncoded, AUTH_TOKEN_SECRET, true));

    if (!hash_equals($expectedSig, $signatureEncoded)) {
        return null;
    }

    $payloadJson = base64UrlDecode($payloadEncoded);
    $payload = json_decode($payloadJson, true);
    if (!is_array($payload) || empty($payload['sub']) || empty($payload['exp'])) {
        return null;
    }

    // Kiểm tra thời hạn 3 ngày
    if ((int)$payload['exp'] <= time()) {
        return null;
    }

    return $payload;
}

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
