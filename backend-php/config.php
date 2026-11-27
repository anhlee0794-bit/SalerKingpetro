<?php
/**
 * CẤU HÌNH KẾT NỐI HỆ THỐNG SALERKINGPETRO (PHP + MYSQL)
 * Thông tin nhạy cảm (DB_PASS, AUTH_TOKEN_SECRET) được tách riêng sang file `config.local.php` (nằm trong .gitignore).
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);

// Nạp cấu hình bí mật riêng của máy chủ (không lưu trên Git)
if (file_exists(__DIR__ . '/config.local.php')) {
    require_once __DIR__ . '/config.local.php';
}

if (!defined('DB_HOST')) {
    define('DB_HOST', getenv('SALER_DB_HOST') ?: 'localhost');
}
if (!defined('DB_NAME')) {
    define('DB_NAME', getenv('SALER_DB_NAME') ?: 'saler_kingpetro');
}
if (!defined('DB_USER')) {
    define('DB_USER', getenv('SALER_DB_USER') ?: 'root');
}
if (!defined('DB_PASS')) {
    define('DB_PASS', getenv('SALER_DB_PASS') ?: '');
}
if (!defined('DB_CHARSET')) {
    define('DB_CHARSET', 'utf8mb4');
}

// Cấu hình URL Web App của Google Apps Script để tự động đồng bộ (nếu dùng)
if (!defined('GOOGLE_APPS_SCRIPT_URL')) {
    define('GOOGLE_APPS_SCRIPT_URL', '');
}

// Cho phép đồng bộ sang Google Sheets ngầm (true: Bật đồng bộ, false: Chỉ lưu MySQL)
if (!defined('SYNC_TO_GOOGLE_SHEETS')) {
    define('SYNC_TO_GOOGLE_SHEETS', false);
}

// Số ngày lưu giữ tọa độ GPS thô trong bảng gps_logs (Lịch sử chăm sóc bảng visits giữ vĩnh viễn)
if (!defined('GPS_LOG_RETENTION_DAYS')) {
    define('GPS_LOG_RETENTION_DAYS', 90);
}

// Thiết lập múi giờ Việt Nam
date_default_timezone_set('Asia/Ho_Chi_Minh');

// Cấu hình Auth Token (JWT HS256) - Lưu phiên đăng nhập 3 ngày (259,200 giây)
if (!defined('AUTH_TOKEN_TTL_SECONDS')) {
    define('AUTH_TOKEN_TTL_SECONDS', 3 * 86400);
}
if (!defined('AUTH_TOKEN_SECRET')) {
    $envSecret = getenv('SALER_JWT_SECRET');
    define('AUTH_TOKEN_SECRET', $envSecret ?: 'CHANGE_ME_IN_CONFIG_LOCAL_PHP');
}

/**
 * Thiết lập CORS an toàn theo danh sách tên miền cho phép
 */
function applySecureCorsHeaders()
{
    $allowed = defined('ALLOWED_CORS_ORIGINS') && is_array(ALLOWED_CORS_ORIGINS)
        ? ALLOWED_CORS_ORIGINS
        : ['https://hiepphucduc.vn', 'https://www.hiepphucduc.vn', 'http://localhost:3000', 'http://127.0.0.1:3000'];

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (!empty($origin) && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    } elseif (empty($origin)) {
        header('Access-Control-Allow-Origin: https://hiepphucduc.vn');
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
}

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
        'expiresAt'  => $exp * 1000,
        'ttlSeconds' => (int)$ttlSeconds
    ];
}

/**
 * Xác thực chữ ký và hạn sử dụng của Auth Token (JWT HS256)
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

    if ((int)$payload['exp'] <= time()) {
        return null;
    }

    return $payload;
}

/**
 * Sinh Mã Định Danh Thiết Bị (Device Identifier) kèm PIN HMAC 6 ký tự chống giả mạo cho ứng dụng Traccar Client (iOS / Android)
 * Ví dụ: USR-002-8F3A1C
 */
function generateTraccarDeviceId($userId)
{
    $cleanId = strtoupper(trim((string)$userId));
    if ($cleanId === '') {
        return '';
    }
    $pin = strtoupper(substr(hash_hmac('sha256', 'KP_TRACCAR_V1:' . $cleanId, AUTH_TOKEN_SECRET), 0, 6));
    return $cleanId . '-' . $pin;
}

/**
 * Xác thực Mã Định Danh Thiết Bị từ Traccar Client gửi lên và trả về user_id gốc nếu hợp lệ
 */
function verifyTraccarDeviceId($rawDeviceId)
{
    $clean = strtoupper(trim((string)$rawDeviceId));
    $lastDash = strrpos($clean, '-');
    if ($lastDash === false || $lastDash < 1) {
        return null;
    }
    $userId = substr($clean, 0, $lastDash);
    $pin = substr($clean, $lastDash + 1);
    if (strlen($pin) !== 6) {
        return null;
    }
    $expectedFull = generateTraccarDeviceId($userId);
    if (!hash_equals($expectedFull, $clean)) {
        return null;
    }
    return $userId;
}

/**
 * Trả về URL đầy đủ của cổng nhận GPS ngầm Traccar Client
 */
function getTraccarServerUrl()
{
    if (!empty($_SERVER['HTTP_HOST'])) {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'https';
        $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/saler/api/api.php')), '/');
        return $scheme . '://' . $_SERVER['HTTP_HOST'] . $scriptDir . '/traccar.php';
    }
    return 'https://hiepphucduc.vn/saler/api/traccar.php';
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
                'message' => 'Lỗi kết nối cơ sở dữ liệu MySQL.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    return $pdo;
}
