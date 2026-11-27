<?php
/**
 * REST API CONTROLLER - SALERKINGPETRO (PRODUCTION HARDENED V2)
 * Bao gồm:
 * - Khóa JWT 100% endpoint + Chống dò mật khẩu (Rate-Limit) + Bắt đổi mật khẩu mặc định
 * - Lưu khoảng cách đối soát Check-in (distance_meters, is_within_geofence) & Tự đóng ca treo qua đêm
 * - Hỗ trợ Giỏ đơn hàng nhiều mặt hàng (order_items_json, order_total_amount) & Ảnh chụp thực tế tại điểm bán
 * - Cô lập khách hàng theo Sales, Duyệt điểm bán mới (PENDING_APPROVAL), Xóa mềm (DELETED) & Thống kê cá nhân Sales
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/sync.php';

header('Content-Type: application/json; charset=utf-8');
if (function_exists('applySecureCorsHeaders')) {
    applySecureCorsHeaders();
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Lấy dữ liệu gửi lên (Hỗ trợ cả JSON body lẫn Form POST / GET)
$rawInput = file_get_contents('php://input');
$params = [];
if (!empty($rawInput)) {
    $decoded = json_decode($rawInput, true);
    if (is_array($decoded)) {
        $params = $decoded;
    }
}
$params = array_merge($_GET, $_POST, $params);
$action = isset($params['action']) ? trim((string)$params['action']) : '';

$pdo = getDbConnection();

/**
 * Ghi log vận hành & bảo mật vào bảng `logs`
 */
function writeSystemLog(PDO $pdo, $level, $source, $message, $payload = null)
{
    try {
        $payloadStr = is_string($payload) || $payload === null
            ? $payload
            : json_encode($payload, JSON_UNESCAPED_UNICODE);
        $stmt = $pdo->prepare("INSERT INTO `logs` (`timestamp`, `level`, `source`, `message`, `payload`) VALUES (NOW(), ?, ?, ?, ?)");
        $stmt->execute([$level, $source, $message, $payloadStr]);
    } catch (Exception $e) {
        // Không làm gián đoạn luồng chính nếu bảng logs bận
    }
}

/**
 * Chuẩn hóa dữ liệu User trả về cho Frontend
 */
function formatUserPayload(array $user)
{
    return [
        'UserID'    => $user['user_id'],
        'Name'      => $user['name'],
        'Email'     => $user['email'],
        'Role'      => $user['role'],
        'Phone'     => $user['phone'] ?? '',
        'Team'      => $user['team'] ?? '',
        'Status'    => $user['status'] ?? 'ACTIVE',
        'CreatedAt' => $user['created_at'] ?? null,
        'userId'    => $user['user_id'],
        'name'      => $user['name'],
        'email'     => $user['email'],
        'role'      => $user['role'],
        'phone'     => $user['phone'] ?? '',
        'team'      => $user['team'] ?? '',
        'status'    => $user['status'] ?? 'ACTIVE'
    ];
}

/**
 * Chuẩn hóa dữ liệu Ca làm việc (Work Session)
 */
function formatSessionPayload(array $s)
{
    return [
        'SessionID'         => $s['session_id'],
        'SalesID'           => $s['sales_id'],
        'Date'              => $s['date'],
        'CheckInTime'       => $s['check_in_time'],
        'CheckInLatitude'   => isset($s['check_in_lat']) && $s['check_in_lat'] !== null ? (float)$s['check_in_lat'] : 0.0,
        'CheckInLongitude'  => isset($s['check_in_lng']) && $s['check_in_lng'] !== null ? (float)$s['check_in_lng'] : 0.0,
        'CheckInAccuracy'   => isset($s['check_in_accuracy']) && $s['check_in_accuracy'] !== null ? (float)$s['check_in_accuracy'] : 0.0,
        'CheckOutTime'      => $s['check_out_time'] ?? null,
        'CheckOutLatitude'  => isset($s['check_out_lat']) && $s['check_out_lat'] !== null ? (float)$s['check_out_lat'] : null,
        'CheckOutLongitude' => isset($s['check_out_lng']) && $s['check_out_lng'] !== null ? (float)$s['check_out_lng'] : null,
        'WorkDuration'      => (int)($s['work_duration'] ?? 0),
        'Status'            => $s['status'] ?? 'WORKING',
        'sessionId'         => $s['session_id'],
        'salesId'           => $s['sales_id'],
        'date'              => $s['date'],
        'checkInTime'       => $s['check_in_time'],
        'checkInLat'        => isset($s['check_in_lat']) && $s['check_in_lat'] !== null ? (float)$s['check_in_lat'] : 0.0,
        'checkInLng'        => isset($s['check_in_lng']) && $s['check_in_lng'] !== null ? (float)$s['check_in_lng'] : 0.0,
        'checkOutTime'      => $s['check_out_time'] ?? null,
        'workDuration'      => (int)($s['work_duration'] ?? 0),
        'status'            => $s['status'] ?? 'WORKING'
    ];
}

/**
 * Chuẩn hóa dữ liệu Lượt ghé thăm / Chăm sóc (Visit) bao gồm đối soát khoảng cách, ảnh & giỏ đơn hàng
 */
function formatVisitPayload(array $v)
{
    $salesName = $v['sales_name'] ?? $v['sales_id'];
    $custName  = $v['customer_name'] ?? '';
    $distMeters = array_key_exists('distance_meters', $v) && $v['distance_meters'] !== null ? (int)$v['distance_meters'] : null;
    $withinGeo  = array_key_exists('is_within_geofence', $v) && $v['is_within_geofence'] !== null ? (int)$v['is_within_geofence'] : null;
    $orderItems = [];
    if (!empty($v['order_items_json'])) {
        $decodedItems = json_decode($v['order_items_json'], true);
        if (is_array($decodedItems)) {
            $orderItems = $decodedItems;
        }
    }
    $orderTotal = isset($v['order_total_amount']) ? (float)$v['order_total_amount'] : 0.0;
    $photoUrl   = $v['photo_url'] ?? '';

    return [
        'VisitID'            => $v['visit_id'],
        'SalesID'            => $v['sales_id'],
        'SalesName'          => $salesName,
        'CustomerID'         => $v['customer_id'],
        'CustomerName'       => $custName,
        'SessionID'          => $v['session_id'],
        'CheckInTime'        => $v['check_in_time'],
        'CheckInLatitude'    => isset($v['check_in_lat']) && $v['check_in_lat'] !== null ? (float)$v['check_in_lat'] : 0.0,
        'CheckInLongitude'   => isset($v['check_in_lng']) && $v['check_in_lng'] !== null ? (float)$v['check_in_lng'] : 0.0,
        'CheckInAccuracy'    => isset($v['check_in_accuracy']) && $v['check_in_accuracy'] !== null ? (float)$v['check_in_accuracy'] : 0.0,
        'DistanceToCustomer' => $distMeters,
        'IsWithinGeofence'   => $withinGeo,
        'PhotoUrl'           => $photoUrl,
        'OrderItems'         => $orderItems,
        'OrderTotalAmount'   => $orderTotal,
        'CheckOutTime'       => $v['check_out_time'] ?? null,
        'Duration'           => (int)($v['duration'] ?? 0),
        'Result'             => $v['result'] ?? '',
        'Note'               => $v['note'] ?? '',
        'Status'             => $v['status'] ?? 'COMPLETED',
        'SelectedProduct'    => $v['selected_product'] ?? '',
        'DistributedQty'     => (int)($v['distributed_qty'] ?? 0),
        'DistributedUnit'    => !empty($v['distributed_unit']) ? $v['distributed_unit'] : 'Thùng',
        'InventoryQty'       => (int)($v['inventory_qty'] ?? 0),
        'InventoryUnit'      => !empty($v['inventory_unit']) ? $v['inventory_unit'] : 'Thùng',
        'ReorderDemand'      => $v['reorder_demand'] ?? '',
        'ReorderUnit'        => !empty($v['reorder_unit']) ? $v['reorder_unit'] : 'Thùng',
        'RecordedDebt'       => (float)($v['recorded_debt'] ?? 0),
        'DebtLimit'          => (float)($v['debt_limit'] ?? 0),
        'PaymentStatus'      => $v['payment_status'] ?? '',
        'NewOrderQty'        => (int)($v['new_order_qty'] ?? 0),
        'NewOrderUnit'       => !empty($v['new_order_unit']) ? $v['new_order_unit'] : 'Thùng',
        'ExpectedNextOrder'  => $v['expected_next_order'] ?? '',
        'ConsumptionRate'    => $v['consumption_rate'] ?? '',
        'DiscussionDetails'  => $v['discussion_details'] ?? '',
        'CustomerIssues'     => $v['customer_issues'] ?? '',
        'NextCareNeeds'      => $v['next_care_needs'] ?? '',
        'visitId'            => $v['visit_id'],
        'salesId'            => $v['sales_id'],
        'salesName'          => $salesName,
        'customerId'         => $v['customer_id'],
        'customerName'       => $custName,
        'sessionId'          => $v['session_id'],
        'checkInTime'        => $v['check_in_time'],
        'checkOutTime'       => $v['check_out_time'] ?? null,
        'duration'           => (int)($v['duration'] ?? 0),
        'result'             => $v['result'] ?? '',
        'note'               => $v['note'] ?? '',
        'status'             => $v['status'] ?? 'COMPLETED',
        'distanceMeters'     => $distMeters,
        'isWithinGeofence'   => $withinGeo,
        'photoUrl'           => $photoUrl,
        'orderItems'         => $orderItems,
        'orderTotalAmount'   => $orderTotal
    ];
}

function formatGpsLogPayload(array $g)
{
    return [
        'GPSLogID'       => $g['gps_log_id'] ?: ('GPS-' . $g['log_id']),
        'SessionID'      => $g['session_id'],
        'SalesID'        => $g['sales_id'],
        'Timestamp'      => $g['timestamp'],
        'Latitude'       => (float)$g['latitude'],
        'Longitude'      => (float)$g['longitude'],
        'Accuracy'       => (float)($g['accuracy'] ?? 0),
        'Speed'          => (float)($g['speed'] ?? 0),
        'ActivityStatus' => $g['activity_status'] ?: 'STATIONARY'
    ];
}

function requireAuth(PDO $pdo, array $params, array $allowedRoles = ['ADMIN', 'MANAGER', 'SALES'])
{
    $token = trim((string)($params['authToken'] ?? ($params['token'] ?? '')));
    if (empty($token) && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        if (preg_match('/Bearer\s+(\S+)/i', $_SERVER['HTTP_AUTHORIZATION'], $m)) {
            $token = $m[1];
        }
    }

    if (empty($token)) {
        echo json_encode([
            'success'      => false,
            'tokenExpired' => true,
            'message'      => 'Yêu cầu xác thực: Vui lòng đăng nhập để tiếp tục phiên làm việc!'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $payload = verifyAuthToken($token);
    if (!$payload) {
        echo json_encode([
            'success'      => false,
            'tokenExpired' => true,
            'message'      => 'Phiên đăng nhập 3 ngày đã hết hạn hoặc đã thay đổi khóa bảo mật. Vui lòng đăng nhập lại!'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $pdo->prepare("SELECT * FROM `users` WHERE `user_id` = ? AND `status` = 'ACTIVE' LIMIT 1");
    $stmt->execute([$payload['sub']]);
    $caller = $stmt->fetch();
    if (!$caller) {
        echo json_encode([
            'success'      => false,
            'tokenExpired' => true,
            'message'      => 'Tài khoản của bạn không tồn tại hoặc đã bị ngừng kích hoạt.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!in_array($caller['role'], $allowedRoles, true)) {
        echo json_encode([
            'success' => false,
            'message' => 'Từ chối truy cập: Tài khoản ' . $caller['role'] . ' không có quyền thực hiện thao tác này!'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    return $caller;
}

function resolveTargetSalesId(array $caller, $requestedSalesId = '')
{
    $req = trim((string)$requestedSalesId);
    if ($caller['role'] === 'SALES') {
        return $caller['user_id'];
    }
    return $req !== '' ? $req : $caller['user_id'];
}

function resolveActionTimestamp(array $params, $key = 'clientTimestamp')
{
    if (!empty($params[$key])) {
        $ts = strtotime((string)$params[$key]);
        $now = time();
        if ($ts !== false && $ts >= ($now - 7 * 86400) && $ts <= ($now + 300)) {
            return date('Y-m-d H:i:s', $ts);
        }
    }
    return date('Y-m-d H:i:s');
}

function calcDistanceMeters($lat1, $lon1, $lat2, $lon2)
{
    $R = 6371000;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) * sin($dLat / 2) +
         cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
         sin($dLon / 2) * sin($dLon / 2);
    return (int)round($R * 2 * atan2(sqrt($a), sqrt(1 - $a)));
}

function computeCustomerGeofence(PDO $pdo, $customerId, $salesLat, $salesLng, $radiusMeters = 200)
{
    if (empty($customerId) || ((float)$salesLat == 0.0 && (float)$salesLng == 0.0)) {
        return ['distance' => null, 'within' => null, 'customerName' => ''];
    }
    $stmt = $pdo->prepare("SELECT `customer_name`, `latitude`, `longitude` FROM `customers` WHERE `customer_id` = ? LIMIT 1");
    $stmt->execute([$customerId]);
    $row = $stmt->fetch();
    if (!$row) {
        return ['distance' => null, 'within' => null, 'customerName' => $customerId];
    }
    $cLat = (float)$row['latitude'];
    $cLng = (float)$row['longitude'];
    if ($cLat == 0.0 && $cLng == 0.0) {
        return ['distance' => null, 'within' => null, 'customerName' => $row['customer_name']];
    }
    $dist = calcDistanceMeters((float)$salesLat, (float)$salesLng, $cLat, $cLng);
    $within = ($dist <= max(20, (int)$radiusMeters)) ? 1 : 0;
    return [
        'distance'     => $dist,
        'within'       => $within,
        'customerName' => $row['customer_name']
    ];
}

function saveVisitPhotoToDisk($visitId, $photoData)
{
    $raw = trim((string)$photoData);
    if (empty($raw)) {
        return null;
    }
    if (strpos($raw, 'data:image/') !== 0) {
        return strlen($raw) <= 500 ? $raw : null;
    }

    if (!preg_match('/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i', $raw, $matches)) {
        return null;
    }
    $ext = strtolower($matches[1]) === 'jpeg' ? 'jpg' : strtolower($matches[1]);
    $binary = base64_decode($matches[2], true);
    if ($binary === false || strlen($binary) > 2 * 1024 * 1024) {
        return null;
    }

    $uploadRoot = __DIR__ . '/uploads';
    $visitDir = $uploadRoot . '/visits';
    if (!is_dir($visitDir)) {
        @mkdir($visitDir, 0755, true);
    }
    $htFile = $uploadRoot . '/.htaccess';
    if (!file_exists($htFile)) {
        $htRules = "Options -Indexes\n<FilesMatch \"\\.(php|php5|php7|phtml|pl|py|cgi|sh)$\">\n    <IfModule mod_authz_core.c>\n        Require all denied\n    </IfModule>\n    <IfModule !mod_authz_core.c>\n        Order allow,deny\n        Deny from all\n    </IfModule>\n</FilesMatch>\n";
        @file_put_contents($htFile, $htRules);
    }

    $safeVisitId = preg_replace('/[^A-Za-z0-9_-]/', '', (string)$visitId) ?: ('VIS_' . time());
    $fileName = $safeVisitId . '.' . $ext;
    $fullPath = $visitDir . '/' . $fileName;
    if (@file_put_contents($fullPath, $binary) !== false) {
        return 'api/uploads/visits/' . $fileName . '?v=' . time();
    }
    return null;
}

function ensureSchemaUpdates(PDO $pdo)
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    try {
        $colStmt = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'password'");
        if (!$colStmt->fetch()) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `password` VARCHAR(255) DEFAULT NULL COMMENT 'Mật khẩu mã hóa Bcrypt' AFTER `email`");
        }
    } catch (Exception $e) {}

    try {
        $vColsStmt = $pdo->query("SHOW COLUMNS FROM `visits`");
        $existingVCols = [];
        while ($c = $vColsStmt->fetch()) {
            $existingVCols[$c['Field']] = $c['Type'];
        }
        if (isset($existingVCols['reorder_demand']) && stripos((string)$existingVCols['reorder_demand'], 'int') !== false) {
            $pdo->exec("ALTER TABLE `visits` MODIFY COLUMN `reorder_demand` VARCHAR(255) DEFAULT ''");
        }
        if (!isset($existingVCols['distance_meters'])) {
            $pdo->exec("ALTER TABLE `visits` ADD COLUMN `distance_meters` INT DEFAULT NULL COMMENT 'Khoảng cách check-in (mét)'");
        }
        if (!isset($existingVCols['is_within_geofence'])) {
            $pdo->exec("ALTER TABLE `visits` ADD COLUMN `is_within_geofence` TINYINT(1) DEFAULT NULL COMMENT '1: Đúng vị trí, 0: Ngoài bán kính'");
        }
        if (!isset($existingVCols['photo_url'])) {
            $pdo->exec("ALTER TABLE `visits` ADD COLUMN `photo_url` VARCHAR(500) DEFAULT NULL COMMENT 'Ảnh chụp tại điểm bán'");
        }
        if (!isset($existingVCols['order_items_json'])) {
            $pdo->exec("ALTER TABLE `visits` ADD COLUMN `order_items_json` LONGTEXT DEFAULT NULL COMMENT 'Giỏ đơn hàng nhiều mặt hàng'");
        }
        if (!isset($existingVCols['order_total_amount'])) {
            $pdo->exec("ALTER TABLE `visits` ADD COLUMN `order_total_amount` DECIMAL(15, 2) DEFAULT 0.00 COMMENT 'Tổng tiền đơn hàng'");
        }
    } catch (Exception $e) {}
}

function closeStaleWorkSessions(PDO $pdo, $salesId = null)
{
    $today = date('Y-m-d');
    try {
        if (!empty($salesId)) {
            $stmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE `sales_id` = ? AND `status` = 'WORKING' AND `date` < ?");
            $stmt->execute([$salesId, $today]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE `status` = 'WORKING' AND `date` < ?");
            $stmt->execute([$today]);
        }
        $staleRows = $stmt->fetchAll();
        foreach ($staleRows as $sr) {
            $inTs = strtotime($sr['check_in_time']);
            $endDayStr = $sr['date'] . ' 18:00:00';
            $endTs = strtotime($endDayStr);
            if ($inTs !== false && $endTs <= $inTs) {
                $endTs = min(strtotime($sr['date'] . ' 23:59:00'), $inTs + 3600);
                $endDayStr = date('Y-m-d H:i:s', $endTs);
            }
            $dur = ($inTs !== false) ? max(1, (int)round(($endTs - $inTs) / 60)) : 60;
            $pdo->prepare("UPDATE `work_sessions` SET `check_out_time` = ?, `work_duration` = ?, `status` = 'COMPLETED' WHERE `session_id` = ?")
                ->execute([$endDayStr, $dur, $sr['session_id']]);
            $pdo->prepare("UPDATE `visits` SET `check_out_time` = ?, `status` = 'COMPLETED', `duration` = GREATEST(1, TIMESTAMPDIFF(MINUTE, `check_in_time`, ?)) WHERE `session_id` = ? AND `status` = 'IN_PROGRESS'")
                ->execute([$endDayStr, $endDayStr, $sr['session_id']]);
        }
    } catch (Exception $e) {}
}

function loadSettingsMap(PDO $pdo)
{
    $defaults = [
        'GPS_INTERVAL'                  => 5,
        'CUSTOMER_RADIUS'               => 200,
        'MOVING_SPEED_THRESHOLD'        => 1.2,
        'STATIONARY_DISTANCE_THRESHOLD' => 30,
        'STATIONARY_TIME'               => 15,
        'GPS_ACCURACY_LIMIT'            => 80,
        'DWELL_RADIUS'                  => 30,
        'DWELL_THRESHOLD_MINUTES'       => 5,
        'CARE_CYCLE_VIP'                => 3,
        'CARE_CYCLE_NORMAL'             => 7,
        'CARE_CYCLE_SMALL'              => 14,
        'OVERDUE_WARNING_DAYS'          => 1,
        'PROXIMITY_ALERT_RADIUS'        => 100,
        'DAILY_VISIT_TARGET'            => 8,
        'GPS_RETENTION_DAYS'            => defined('GPS_LOG_RETENTION_DAYS') ? GPS_LOG_RETENTION_DAYS : 90
    ];
    try {
        $stmt = $pdo->query("SELECT `setting_key`, `setting_value` FROM `settings`");
        while ($row = $stmt->fetch()) {
            $val = $row['setting_value'];
            $defaults[$row['setting_key']] = is_numeric($val) ? ($val + 0) : $val;
        }
    } catch (Exception $e) {}
    return $defaults;
}

function purgeOldGpsLogs(PDO $pdo, $overrideDays = null)
{
    try {
        if ($overrideDays !== null) {
            $days = max(7, (int)$overrideDays);
        } else {
            $settings = loadSettingsMap($pdo);
            $days = max(7, (int)($settings['GPS_RETENTION_DAYS'] ?? (defined('GPS_LOG_RETENTION_DAYS') ? GPS_LOG_RETENTION_DAYS : 90)));
        }
        $cutoff = date('Y-m-d H:i:s', time() - ($days * 86400));
        $stmt = $pdo->prepare("DELETE FROM `gps_logs` WHERE `timestamp` < ?");
        $stmt->execute([$cutoff]);
        $pdo->prepare("DELETE FROM `logs` WHERE `timestamp` < ?")->execute([$cutoff]);
        return [
            'deletedCount'  => $stmt->rowCount(),
            'retentionDays' => $days,
            'cutoffDate'    => $cutoff
        ];
    } catch (Exception $e) {
        return ['deletedCount' => 0, 'retentionDays' => 90, 'error' => $e->getMessage()];
    }
}

function buildFormattedCustomers(PDO $pdo, $salesId = null, $role = 'MANAGER', $warningDays = 1)
{
    if ($role === 'MANAGER' || $role === 'ADMIN' || empty($salesId)) {
        $stmt = $pdo->query("SELECT * FROM `customers` WHERE `status` != 'DELETED' ORDER BY `customer_name` ASC");
    } else {
        $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE ((`status` = 'ACTIVE' AND (`assigned_sales_id` = ? OR `assigned_sales_id` = 'ALL')) OR (`status` = 'PENDING_APPROVAL' AND `assigned_sales_id` = ?)) ORDER BY `customer_name` ASC");
        $stmt->execute([$salesId, $salesId]);
    }
    $customers = $stmt->fetchAll();

    $nowTs = time();
    $formatted = [];
    foreach ($customers as $c) {
        $careStatus = 'NEVER_VISITED';
        $careLabel  = 'Chưa chăm sóc';
        $badgeColor = '#8b5cf6';
        $daysOverdue = 0;
        $daysRemaining = null;
        $daysSinceLast = 0;

        if (!empty($c['last_care_date'])) {
            $daysSinceLast = max(0, (int)floor(($nowTs - strtotime($c['last_care_date'])) / 86400));
        }
        if (!empty($c['next_care_date'])) {
            $nextTs = strtotime($c['next_care_date']);
            $diffDays = ($nextTs - $nowTs) / 86400;
            if ($diffDays < 0) {
                $careStatus    = 'OVERDUE';
                $daysOverdue   = max(1, (int)ceil(abs($diffDays)));
                $daysRemaining = 0;
                $careLabel     = "Quá hạn {$daysOverdue} ngày";
                $badgeColor    = '#ef4444';
            } elseif ($diffDays <= max(1, (int)$warningDays)) {
                $careStatus    = 'DUE_SOON';
                $daysRemaining = max(0, (int)ceil($diffDays));
                $careLabel     = 'Sắp đến hạn';
                $badgeColor    = '#f59e0b';
            } else {
                $careStatus    = 'ON_TRACK';
                $daysRemaining = (int)ceil($diffDays);
                $careLabel     = 'Đúng chu kỳ';
                $badgeColor    = '#10b981';
            }
        } elseif (!empty($c['last_care_date'])) {
            $careStatus = 'ON_TRACK';
            $careLabel  = 'Đúng chu kỳ';
            $badgeColor = '#10b981';
        }

        $formatted[] = [
            'CustomerID'      => $c['customer_id'],
            'CustomerName'    => $c['customer_name'],
            'ContactName'     => $c['contact_name'] ?? '',
            'Phone'           => $c['phone'] ?? '',
            'Address'         => $c['address'] ?? '',
            'Latitude'        => (float)$c['latitude'],
            'Longitude'       => (float)$c['longitude'],
            'AssignedSalesID' => $c['assigned_sales_id'] ?? '',
            'Status'          => $c['status'] ?? 'ACTIVE',
            'CustomerType'    => $c['customer_type'] ?: 'NORMAL',
            'CareCycleDays'   => (int)($c['care_cycle_days'] ?: 7),
            'LastCareDate'    => $c['last_care_date'],
            'NextCareDate'    => $c['next_care_date'],
            'CurrentDebt'     => (float)($c['current_debt'] ?? 0),
            'CurrentStock'    => (int)($c['current_stock'] ?? 0),
            'StockUnit'       => !empty($c['stock_unit']) ? $c['stock_unit'] : 'Thùng',
            'CareStatus'      => $careStatus,
            'CareStatusLabel' => $careLabel,
            'BadgeColor'      => $badgeColor,
            'DaysOverdue'     => $daysOverdue,
            'DaysRemaining'   => $daysRemaining,
            'DaysSinceLast'   => $daysSinceLast,
            'Note'            => $c['note'] ?? ''
        ];
    }
    return $formatted;
}

try {
    ensureSchemaUpdates($pdo);

    switch ($action) {
        case 'login':
            $email = strtolower(trim((string)($params['email'] ?? '')));
            $password = trim((string)($params['password'] ?? ''));
            $clientIp = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
            $rateKey = $clientIp . '|' . $email;

            if (empty($email) || empty($password)) {
                echo json_encode(['success' => false, 'message' => 'Vui lòng nhập đầy đủ Email và Mật khẩu!'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $failStmt = $pdo->prepare("SELECT COUNT(*) FROM `logs` WHERE `source` = 'AUTH_FAIL' AND `payload` = ? AND `timestamp` >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
            $failStmt->execute([$rateKey]);
            $recentFails = (int)$failStmt->fetchColumn();
            if ($recentFails >= 5) {
                echo json_encode([
                    'success' => false,
                    'message' => 'Tài khoản tạm khóa đăng nhập 10 phút do nhập sai mật khẩu quá 5 lần liên tiếp!'
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            $stmt = $pdo->prepare("SELECT * FROM `users` WHERE LOWER(`email`) = ? AND `status` = 'ACTIVE' LIMIT 1");
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            if ($user) {
                $storedPass = $user['password'] ?? '';
                $isPasswordValid = false;

                if (empty($storedPass)) {
                    if ($password === '123456') {
                        $isPasswordValid = true;
                        $hash = password_hash('123456', PASSWORD_BCRYPT);
                        $pdo->prepare("UPDATE `users` SET `password` = ? WHERE `user_id` = ?")->execute([$hash, $user['user_id']]);
                    }
                } elseif (password_verify($password, $storedPass)) {
                    $isPasswordValid = true;
                } elseif ($storedPass === $password) {
                    $isPasswordValid = true;
                    $hash = password_hash($password, PASSWORD_BCRYPT);
                    $pdo->prepare("UPDATE `users` SET `password` = ? WHERE `user_id` = ?")->execute([$hash, $user['user_id']]);
                }

                if ($isPasswordValid) {
                    $pdo->prepare("DELETE FROM `logs` WHERE `source` = 'AUTH_FAIL' AND `payload` = ?")->execute([$rateKey]);
                    $tokenData = generateAuthToken($user, AUTH_TOKEN_TTL_SECONDS);
                    $isUsingDefaultPass = ($password === '123456');

                    echo json_encode([
                        'success'            => true,
                        'user'               => formatUserPayload($user),
                        'token'              => $tokenData['token'],
                        'expiresAt'          => $tokenData['expiresAt'],
                        'ttlDays'            => 3,
                        'mustChangePassword' => $isUsingDefaultPass
                    ], JSON_UNESCAPED_UNICODE);
                } else {
                    writeSystemLog($pdo, 'WARN', 'AUTH_FAIL', "Sai mật khẩu cho {$email}", $rateKey);
                    $left = max(0, 5 - ($recentFails + 1));
                    $msg = $left > 0
                        ? "Mật khẩu không chính xác (Còn {$left} lần thử trước khi tạm khóa 10 phút)."
                        : "Tài khoản đã bị tạm khóa 10 phút do nhập sai mật khẩu 5 lần!";
                    echo json_encode(['success' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
                }
            } else {
                writeSystemLog($pdo, 'WARN', 'AUTH_FAIL', "Email không tồn tại hoặc bị khóa: {$email}", $rateKey);
                echo json_encode(['success' => false, 'message' => 'Email không tồn tại hoặc đã bị khóa.'], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'verifyToken':
            $token = trim((string)($params['token'] ?? ($params['authToken'] ?? '')));
            if (empty($token) && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
                if (preg_match('/Bearer\s+(\S+)/i', $_SERVER['HTTP_AUTHORIZATION'], $matches)) {
                    $token = $matches[1];
                }
            }

            $payload = verifyAuthToken($token);
            if (!$payload) {
                echo json_encode([
                    'success'      => false,
                    'tokenExpired' => true,
                    'message'      => 'Phiên đăng nhập 3 ngày đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại!'
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            $stmt = $pdo->prepare("SELECT * FROM `users` WHERE `user_id` = ? AND `status` = 'ACTIVE' LIMIT 1");
            $stmt->execute([$payload['sub']]);
            $user = $stmt->fetch();

            if (!$user) {
                echo json_encode([
                    'success'      => false,
                    'tokenExpired' => true,
                    'message'      => 'Tài khoản không tồn tại hoặc đã bị ngừng kích hoạt.'
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            echo json_encode([
                'success'   => true,
                'user'      => formatUserPayload($user),
                'expiresAt' => ((int)$payload['exp']) * 1000
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'changePassword':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $userId = trim((string)($params['userId'] ?? $caller['user_id']));
            if ($caller['role'] !== 'ADMIN' && $userId !== $caller['user_id']) {
                echo json_encode(['success' => false, 'message' => 'Bạn chỉ được phép đổi mật khẩu của chính mình!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $oldPassword = trim((string)($params['oldPassword'] ?? ''));
            $newPassword = trim((string)($params['newPassword'] ?? ''));

            if (empty($userId) || empty($newPassword)) {
                echo json_encode(['success' => false, 'message' => 'Dữ liệu không hợp lệ.'], JSON_UNESCAPED_UNICODE);
                break;
            }
            if (strlen($newPassword) < 6) {
                echo json_encode(['success' => false, 'message' => 'Mật khẩu mới phải có tối thiểu 6 ký tự.'], JSON_UNESCAPED_UNICODE);
                break;
            }
            if ($newPassword === '123456') {
                echo json_encode(['success' => false, 'message' => 'Mật khẩu mới không được đặt trùng mật khẩu mặc định 123456!'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $stmt = $pdo->prepare("SELECT * FROM `users` WHERE `user_id` = ? AND `status` = 'ACTIVE' LIMIT 1");
            $stmt->execute([$userId]);
            $user = $stmt->fetch();
            if (!$user) {
                echo json_encode(['success' => false, 'message' => 'Không tìm thấy thông tin tài khoản.'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $storedPass = $user['password'] ?? '';
            $isOldValid = false;
            if (empty($storedPass)) {
                $isOldValid = ($oldPassword === '123456');
            } elseif (password_verify($oldPassword, $storedPass) || $storedPass === $oldPassword) {
                $isOldValid = true;
            }

            if (!$isOldValid) {
                echo json_encode(['success' => false, 'message' => 'Mật khẩu hiện tại không chính xác.'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $newHash = password_hash($newPassword, PASSWORD_BCRYPT);
            $pdo->prepare("UPDATE `users` SET `password` = ? WHERE `user_id` = ?")->execute([$newHash, $userId]);
            $tokenData = generateAuthToken($caller['user_id'] === $userId ? $user : $caller, AUTH_TOKEN_TTL_SECONDS);
            echo json_encode([
                'success'   => true,
                'message'   => 'Đổi mật khẩu thành công!',
                'token'     => $tokenData['token'],
                'expiresAt' => $tokenData['expiresAt']
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'getUsers':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            $filterRole = $params['filterRole'] ?? null;
            $includeInactive = ($caller['role'] === 'ADMIN') && (!empty($params['includeInactive']) || strtoupper(trim((string)($params['role'] ?? ''))) === 'ADMIN');

            $sql = "SELECT * FROM `users` WHERE 1=1";
            $vals = [];
            if (!$includeInactive) {
                $sql .= " AND `status` = 'ACTIVE'";
            }
            if (!empty($filterRole) && $filterRole !== 'ALL') {
                $sql .= " AND `role` = ?";
                $vals[] = $filterRole;
            }
            $sql .= " ORDER BY FIELD(`role`, 'ADMIN', 'MANAGER', 'SALES'), `created_at` ASC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($vals);
            $rows = $stmt->fetchAll();
            $usersOut = array_map('formatUserPayload', $rows);
            echo json_encode(['success' => true, 'users' => $usersOut], JSON_UNESCAPED_UNICODE);
            break;

        case 'saveUser':
            $caller = requireAuth($pdo, $params, ['ADMIN']);
            $uData = $params['userData'] ?? $params;
            $userId = trim((string)($uData['UserID'] ?? ($uData['userId'] ?? '')));
            $name = trim((string)($uData['Name'] ?? ($uData['name'] ?? '')));
            $email = strtolower(trim((string)($uData['Email'] ?? ($uData['email'] ?? ''))));
            $phone = trim((string)($uData['Phone'] ?? ($uData['phone'] ?? '')));
            $role = strtoupper(trim((string)($uData['Role'] ?? ($uData['role'] ?? 'SALES'))));
            $team = trim((string)($uData['Team'] ?? ($uData['team'] ?? 'North Team')));
            $status = strtoupper(trim((string)($uData['Status'] ?? ($uData['status'] ?? 'ACTIVE'))));
            $rawPassword = trim((string)($uData['Password'] ?? ($uData['password'] ?? '')));

            if (empty($name) || empty($email)) {
                echo json_encode(['success' => false, 'message' => 'Họ tên và Email không được để trống!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            if (!in_array($role, ['ADMIN', 'MANAGER', 'SALES'], true)) {
                $role = 'SALES';
            }
            if (!in_array($status, ['ACTIVE', 'INACTIVE'], true)) {
                $status = 'ACTIVE';
            }

            $existingUser = null;
            if (!empty($userId)) {
                $chkStmt = $pdo->prepare("SELECT * FROM `users` WHERE `user_id` = ? LIMIT 1");
                $chkStmt->execute([$userId]);
                $existingUser = $chkStmt->fetch();
            }

            if ($existingUser) {
                $dupStmt = $pdo->prepare("SELECT `user_id` FROM `users` WHERE LOWER(`email`) = ? AND `user_id` != ? LIMIT 1");
                $dupStmt->execute([$email, $userId]);
                if ($dupStmt->fetch()) {
                    echo json_encode(['success' => false, 'message' => "Email {$email} đã được sử dụng bởi tài khoản khác!"], JSON_UNESCAPED_UNICODE);
                    break;
                }

                if ($existingUser['role'] === 'ADMIN' && ($role !== 'ADMIN' || $status !== 'ACTIVE')) {
                    $adminCnt = (int)$pdo->query("SELECT COUNT(*) FROM `users` WHERE `role` = 'ADMIN' AND `status` = 'ACTIVE'")->fetchColumn();
                    if ($adminCnt <= 1) {
                        echo json_encode(['success' => false, 'message' => 'Không thể hạ quyền hoặc khóa tài khoản ADMIN duy nhất đang hoạt động!'], JSON_UNESCAPED_UNICODE);
                        break;
                    }
                }

                if (!empty($rawPassword)) {
                    if (strlen($rawPassword) < 6) {
                        echo json_encode(['success' => false, 'message' => 'Mật khẩu mới phải có tối thiểu 6 ký tự!'], JSON_UNESCAPED_UNICODE);
                        break;
                    }
                    $passHash = password_hash($rawPassword, PASSWORD_BCRYPT);
                    $upStmt = $pdo->prepare("UPDATE `users` SET `name` = ?, `email` = ?, `password` = ?, `role` = ?, `phone` = ?, `team` = ?, `status` = ? WHERE `user_id` = ?");
                    $upStmt->execute([$name, $email, $passHash, $role, $phone, $team, $status, $userId]);
                } else {
                    $upStmt = $pdo->prepare("UPDATE `users` SET `name` = ?, `email` = ?, `role` = ?, `phone` = ?, `team` = ?, `status` = ? WHERE `user_id` = ?");
                    $upStmt->execute([$name, $email, $role, $phone, $team, $status, $userId]);
                }

                $getUpdated = $pdo->prepare("SELECT * FROM `users` WHERE `user_id` = ?");
                $getUpdated->execute([$userId]);
                echo json_encode([
                    'success' => true,
                    'message' => "Đã cập nhật thông tin nhân sự {$name} thành công!",
                    'user'    => formatUserPayload($getUpdated->fetch())
                ], JSON_UNESCAPED_UNICODE);
            } else {
                $dupStmt = $pdo->prepare("SELECT `user_id` FROM `users` WHERE LOWER(`email`) = ? LIMIT 1");
                $dupStmt->execute([$email]);
                if ($dupStmt->fetch()) {
                    echo json_encode(['success' => false, 'message' => "Email {$email} đã tồn tại trong hệ thống!"], JSON_UNESCAPED_UNICODE);
                    break;
                }

                if (empty($userId)) {
                    $cnt = (int)$pdo->query("SELECT COUNT(*) FROM `users`")->fetchColumn();
                    $userId = 'USR-' . str_pad($cnt + 1, 3, '0', STR_PAD_LEFT);
                    $chkId = $pdo->prepare("SELECT `user_id` FROM `users` WHERE `user_id` = ?");
                    $chkId->execute([$userId]);
                    if ($chkId->fetch()) {
                        $userId = 'USR-' . substr((string)time(), -5);
                    }
                }

                $initPass = !empty($rawPassword) ? $rawPassword : '123456';
                if (strlen($initPass) < 6) {
                    echo json_encode(['success' => false, 'message' => 'Mật khẩu khởi tạo phải có tối thiểu 6 ký tự!'], JSON_UNESCAPED_UNICODE);
                    break;
                }
                $passHash = password_hash($initPass, PASSWORD_BCRYPT);

                $insStmt = $pdo->prepare("INSERT INTO `users` (`user_id`, `name`, `email`, `password`, `role`, `phone`, `team`, `status`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())");
                $insStmt->execute([$userId, $name, $email, $passHash, $role, $phone, $team, $status]);

                $getNew = $pdo->prepare("SELECT * FROM `users` WHERE `user_id` = ?");
                $getNew->execute([$userId]);
                echo json_encode([
                    'success' => true,
                    'message' => "Đã tạo nhân sự {$name} ({$role}) thành công!",
                    'user'    => formatUserPayload($getNew->fetch())
                ], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'resetUserPassword':
            requireAuth($pdo, $params, ['ADMIN']);
            $targetUserId = trim((string)($params['userId'] ?? ''));
            $newPassword = trim((string)($params['newPassword'] ?? ''));
            if (empty($targetUserId) || strlen($newPassword) < 6) {
                echo json_encode(['success' => false, 'message' => 'Mật khẩu mới phải có tối thiểu 6 ký tự!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $chk = $pdo->prepare("SELECT `name` FROM `users` WHERE `user_id` = ? LIMIT 1");
            $chk->execute([$targetUserId]);
            $uRow = $chk->fetch();
            if (!$uRow) {
                echo json_encode(['success' => false, 'message' => 'Không tìm thấy nhân sự!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $hash = password_hash($newPassword, PASSWORD_BCRYPT);
            $pdo->prepare("UPDATE `users` SET `password` = ? WHERE `user_id` = ?")->execute([$hash, $targetUserId]);
            echo json_encode(['success' => true, 'message' => "Đã đặt lại mật khẩu mới cho {$uRow['name']}!"], JSON_UNESCAPED_UNICODE);
            break;

        case 'toggleUserStatus':
            $caller = requireAuth($pdo, $params, ['ADMIN']);
            $targetUserId = trim((string)($params['userId'] ?? ''));
            if ($caller['user_id'] === $targetUserId) {
                echo json_encode(['success' => false, 'message' => 'Bạn không thể tự khóa tài khoản đang đăng nhập của chính mình!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $chk = $pdo->prepare("SELECT * FROM `users` WHERE `user_id` = ? LIMIT 1");
            $chk->execute([$targetUserId]);
            $uRow = $chk->fetch();
            if (!$uRow) {
                echo json_encode(['success' => false, 'message' => 'Không tìm thấy tài khoản!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $newStatus = ($uRow['status'] === 'ACTIVE') ? 'INACTIVE' : 'ACTIVE';
            if ($uRow['role'] === 'ADMIN' && $newStatus === 'INACTIVE') {
                $adminCnt = (int)$pdo->query("SELECT COUNT(*) FROM `users` WHERE `role` = 'ADMIN' AND `status` = 'ACTIVE'")->fetchColumn();
                if ($adminCnt <= 1) {
                    echo json_encode(['success' => false, 'message' => 'Không thể khóa tài khoản ADMIN duy nhất của hệ thống!'], JSON_UNESCAPED_UNICODE);
                    break;
                }
            }
            $pdo->prepare("UPDATE `users` SET `status` = ? WHERE `user_id` = ?")->execute([$newStatus, $targetUserId]);
            echo json_encode([
                'success'   => true,
                'newStatus' => $newStatus,
                'message'   => ($newStatus === 'ACTIVE') ? "Đã mở khóa tài khoản {$uRow['name']}!" : "Đã khóa tài khoản {$uRow['name']}!"
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'deleteUser':
            $caller = requireAuth($pdo, $params, ['ADMIN']);
            $targetUserId = trim((string)($params['userId'] ?? ''));
            if ($caller['user_id'] === $targetUserId) {
                echo json_encode(['success' => false, 'message' => 'Không thể xóa tài khoản ADMIN đang đăng nhập hiện tại!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $chk = $pdo->prepare("SELECT * FROM `users` WHERE `user_id` = ? LIMIT 1");
            $chk->execute([$targetUserId]);
            $uRow = $chk->fetch();
            if (!$uRow) {
                echo json_encode(['success' => false, 'message' => 'Không tìm thấy nhân sự cần xóa!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            if ($uRow['role'] === 'ADMIN') {
                $adminCnt = (int)$pdo->query("SELECT COUNT(*) FROM `users` WHERE `role` = 'ADMIN'")->fetchColumn();
                if ($adminCnt <= 1) {
                    echo json_encode(['success' => false, 'message' => 'Không thể xóa tài khoản ADMIN duy nhất của hệ thống!'], JSON_UNESCAPED_UNICODE);
                    break;
                }
            }
            $pdo->beginTransaction();
            try {
                $pdo->prepare("UPDATE `customers` SET `assigned_sales_id` = '' WHERE `assigned_sales_id` = ?")->execute([$targetUserId]);
                $pdo->prepare("DELETE FROM `users` WHERE `user_id` = ?")->execute([$targetUserId]);
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => "Đã xóa nhân sự {$uRow['name']} và gỡ tuyến liên quan!"], JSON_UNESCAPED_UNICODE);
            } catch (Exception $ex) {
                $pdo->rollBack();
                throw $ex;
            }
            break;

        case 'reassignRoutes':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            $salesId = trim((string)($params['salesId'] ?? ''));
            $customerIds = isset($params['customerIds']) && is_array($params['customerIds']) ? $params['customerIds'] : [];
            if (empty($salesId)) {
                echo json_encode(['success' => false, 'message' => 'Thiếu mã nhân viên Sales!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $pdo->beginTransaction();
            try {
                $pdo->prepare("UPDATE `customers` SET `assigned_sales_id` = '' WHERE `assigned_sales_id` = ?")->execute([$salesId]);
                if (!empty($customerIds)) {
                    $placeholders = implode(',', array_fill(0, count($customerIds), '?'));
                    $vals = array_merge([$salesId], array_values($customerIds));
                    $pdo->prepare("UPDATE `customers` SET `assigned_sales_id` = ? WHERE `customer_id` IN ({$placeholders})")->execute($vals);
                }
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Đã lưu phân bổ tuyến bán hàng vào CSDL thành công!'], JSON_UNESCAPED_UNICODE);
            } catch (Exception $ex) {
                $pdo->rollBack();
                throw $ex;
            }
            break;

        case 'getSettings':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $settings = loadSettingsMap($pdo);
            echo json_encode(['success' => true, 'settings' => $settings], JSON_UNESCAPED_UNICODE);
            break;

        case 'saveSettings':
            requireAuth($pdo, $params, ['ADMIN']);
            $settingsData = isset($params['settings']) && is_array($params['settings']) ? $params['settings'] : [];
            if (empty($settingsData)) {
                echo json_encode(['success' => false, 'message' => 'Không có thông số cài đặt nào để lưu.'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $pdo->beginTransaction();
            try {
                $upStmt = $pdo->prepare("INSERT INTO `settings` (`setting_key`, `setting_value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`)");
                foreach ($settingsData as $k => $v) {
                    $cleanKey = preg_replace('/[^A-Z0-9_]/i', '', (string)$k);
                    if (!empty($cleanKey)) {
                        $upStmt->execute([$cleanKey, (string)$v]);
                    }
                }
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Đã lưu cấu hình thông số hệ thống thành công!'], JSON_UNESCAPED_UNICODE);
            } catch (Exception $ex) {
                $pdo->rollBack();
                throw $ex;
            }
            break;

        case 'cleanupGpsLogs':
            requireAuth($pdo, $params, ['ADMIN']);
            $days = isset($params['retentionDays']) ? (int)$params['retentionDays'] : null;
            $cleanRes = purgeOldGpsLogs($pdo, $days);
            $remaining = (int)$pdo->query("SELECT COUNT(*) FROM `gps_logs`")->fetchColumn();
            echo json_encode([
                'success'       => true,
                'deletedCount'  => $cleanRes['deletedCount'],
                'remainingLogs' => $remaining,
                'retentionDays' => $cleanRes['retentionDays'],
                'message'       => "Đã dọn {$cleanRes['deletedCount']} bản ghi tọa độ thô cũ quá {$cleanRes['retentionDays']} ngày (Còn lại {$remaining} điểm GPS; dữ liệu Chăm sóc khách hàng giữ nguyên 100%)."
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'getActiveSession':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');

            closeStaleWorkSessions($pdo, $salesId);

            $stmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE `sales_id` = ? AND `status` = 'WORKING' AND `date` = ? ORDER BY `check_in_time` DESC LIMIT 1");
            $stmt->execute([$salesId, date('Y-m-d')]);
            $session = $stmt->fetch();

            $activeVisit = null;
            if ($session) {
                $vStmt = $pdo->prepare("SELECT v.*, c.`customer_name` FROM `visits` v LEFT JOIN `customers` c ON v.`customer_id` = c.`customer_id` WHERE v.`sales_id` = ? AND v.`status` = 'IN_PROGRESS' ORDER BY v.`check_in_time` DESC LIMIT 1");
                $vStmt->execute([$salesId]);
                $vRow = $vStmt->fetch();
                if ($vRow) {
                    $activeVisit = formatVisitPayload($vRow);
                }
            }

            echo json_encode([
                'success'     => true,
                'session'     => $session ? formatSessionPayload($session) : null,
                'activeVisit' => $activeVisit
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'startWork':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');
            $lat = (float)($params['lat'] ?? 0);
            $lng = (float)($params['lng'] ?? 0);
            $acc = (float)($params['accuracy'] ?? 0);
            $now = resolveActionTimestamp($params);
            $today = substr($now, 0, 10);

            purgeOldGpsLogs($pdo);
            closeStaleWorkSessions($pdo, $salesId);

            if ($lat == 0.0 && $lng == 0.0 && empty($params['clientTimestamp'])) {
                echo json_encode([
                    'success' => false,
                    'message' => 'Chưa nhận được tín hiệu GPS thực tế! Vui lòng bật Vị trí (Location) trên điện thoại và thử lại.'
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            $checkStmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE `sales_id` = ? AND `status` = 'WORKING' AND `date` = ? ORDER BY `check_in_time` DESC LIMIT 1");
            $checkStmt->execute([$salesId, $today]);
            $existingSess = $checkStmt->fetch();
            if ($existingSess) {
                echo json_encode([
                    'success'     => true,
                    'sessionId'   => $existingSess['session_id'],
                    'SessionID'   => $existingSess['session_id'],
                    'checkInTime' => $existingSess['check_in_time'],
                    'session'     => formatSessionPayload($existingSess),
                    'alreadyOpen' => true
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            $sessionId = 'SES-' . time() . '-' . rand(100, 999);
            $stmt = $pdo->prepare("INSERT INTO `work_sessions` (`session_id`, `sales_id`, `date`, `check_in_time`, `check_in_lat`, `check_in_lng`, `check_in_accuracy`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, 'WORKING')");
            $stmt->execute([$sessionId, $salesId, $today, $now, $lat, $lng, $acc]);

            if ($lat != 0 || $lng != 0) {
                $gpsId = 'GPS-' . time() . '-' . rand(100, 999);
                $gStmt = $pdo->prepare("INSERT INTO `gps_logs` (`gps_log_id`, `session_id`, `sales_id`, `timestamp`, `latitude`, `longitude`, `accuracy`, `speed`, `activity_status`) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'STATIONARY')");
                $gStmt->execute([$gpsId, $sessionId, $salesId, $now, $lat, $lng, $acc]);
            }

            syncToGoogleSheetsAsync('startWork', [
                'salesId'   => $salesId,
                'lat'       => $lat,
                'lng'       => $lng,
                'accuracy'  => $acc,
                'sessionId' => $sessionId
            ]);

            $newSessRow = [
                'session_id'        => $sessionId,
                'sales_id'          => $salesId,
                'date'              => $today,
                'check_in_time'     => $now,
                'check_in_lat'      => $lat,
                'check_in_lng'      => $lng,
                'check_in_accuracy' => $acc,
                'check_out_time'    => null,
                'check_out_lat'     => null,
                'check_out_lng'     => null,
                'work_duration'     => 0,
                'status'            => 'WORKING'
            ];

            echo json_encode([
                'success'     => true,
                'sessionId'   => $sessionId,
                'SessionID'   => $sessionId,
                'checkInTime' => $now,
                'session'     => formatSessionPayload($newSessRow)
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'endWork':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');
            $sessionId = trim((string)($params['sessionId'] ?? ($params['SessionID'] ?? '')));
            $rawLat = $params['lat'] ?? null;
            $rawLng = $params['lng'] ?? null;
            $outLat = ($rawLat !== null && (float)$rawLat != 0.0) ? (float)$rawLat : null;
            $outLng = ($rawLng !== null && (float)$rawLng != 0.0) ? (float)$rawLng : null;
            $now = resolveActionTimestamp($params);

            if (!empty($sessionId)) {
                $getStmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE `session_id` = ? AND `sales_id` = ? LIMIT 1");
                $getStmt->execute([$sessionId, $salesId]);
                $sess = $getStmt->fetch();
            } else {
                $sess = null;
            }
            if (!$sess) {
                $fallbackStmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE `sales_id` = ? AND `status` = 'WORKING' ORDER BY `check_in_time` DESC LIMIT 1");
                $fallbackStmt->execute([$salesId]);
                $sess = $fallbackStmt->fetch();
            }

            if (!$sess) {
                echo json_encode(['success' => true, 'duration' => 0, 'workDuration' => 0, 'message' => 'Ca làm việc đã được đóng trước đó.'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $realSessionId = $sess['session_id'];
            $duration = max(0, (int)round((strtotime($now) - strtotime($sess['check_in_time'])) / 60));

            $stmt = $pdo->prepare("UPDATE `work_sessions` SET `check_out_time` = ?, `check_out_lat` = ?, `check_out_lng` = ?, `work_duration` = ?, `status` = 'COMPLETED' WHERE `session_id` = ?");
            $stmt->execute([$now, $outLat, $outLng, $duration, $realSessionId]);

            $pdo->prepare("UPDATE `visits` SET `check_out_time` = ?, `status` = 'COMPLETED', `duration` = GREATEST(1, TIMESTAMPDIFF(MINUTE, `check_in_time`, ?)) WHERE `session_id` = ? AND `status` = 'IN_PROGRESS'")
                ->execute([$now, $now, $realSessionId]);

            syncToGoogleSheetsAsync('endWork', [
                'sessionId' => $realSessionId,
                'salesId'   => $salesId,
                'lat'       => $outLat,
                'lng'       => $outLng
            ]);

            echo json_encode([
                'success'      => true,
                'duration'     => $duration,
                'workDuration' => $duration
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'recordGps':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');
            $sessionId = trim((string)($params['sessionId'] ?? ($params['SessionID'] ?? '')));
            $lat = (float)($params['lat'] ?? 0);
            $lng = (float)($params['lng'] ?? 0);
            $acc = (float)($params['accuracy'] ?? 0);
            $speed = (float)($params['speed'] ?? 0);
            $status = strtoupper(trim((string)($params['forcedStatus'] ?? 'MOVING'))) ?: 'MOVING';
            $now = resolveActionTimestamp($params);

            if ($lat == 0.0 && $lng == 0.0) {
                echo json_encode(['success' => false, 'message' => 'Bỏ qua tọa độ rỗng.'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $settings = loadSettingsMap($pdo);
            $accLimit = (float)($settings['GPS_ACCURACY_LIMIT'] ?? 80);
            if ($acc > $accLimit || $status === 'UNKNOWN') {
                $status = 'LOW_ACCURACY';
            }

            if (empty($sessionId) || strpos($sessionId, 'SES-OFFLINE-') === 0) {
                $sStmt = $pdo->prepare("SELECT `session_id` FROM `work_sessions` WHERE `sales_id` = ? ORDER BY FIELD(`status`, 'WORKING', 'COMPLETED'), `check_in_time` DESC LIMIT 1");
                $sStmt->execute([$salesId]);
                $sRow = $sStmt->fetch();
                if ($sRow) {
                    $sessionId = $sRow['session_id'];
                }
            }

            $gpsId = 'GPS-' . time() . '-' . rand(100, 999);
            $stmt = $pdo->prepare("INSERT INTO `gps_logs` (`gps_log_id`, `session_id`, `sales_id`, `timestamp`, `latitude`, `longitude`, `accuracy`, `speed`, `activity_status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$gpsId, $sessionId, $salesId, $now, $lat, $lng, $acc, $speed, $status]);

            if (mt_rand(1, 100) === 1) {
                purgeOldGpsLogs($pdo);
            }

            echo json_encode(['success' => true, 'gpsLogId' => $gpsId, 'activityStatus' => $status], JSON_UNESCAPED_UNICODE);
            break;

        case 'getCustomers':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $settings = loadSettingsMap($pdo);
            $warnDays = (int)($settings['OVERDUE_WARNING_DAYS'] ?? 1);

            if ($caller['role'] === 'SALES') {
                $formatted = buildFormattedCustomers($pdo, $caller['user_id'], 'SALES', $warnDays);
            } else {
                $reqRole = strtoupper(trim((string)($params['role'] ?? $caller['role'])));
                $reqSalesId = trim((string)($params['salesId'] ?? ''));
                if ($reqRole === 'SALES' && !empty($reqSalesId)) {
                    $formatted = buildFormattedCustomers($pdo, $reqSalesId, 'SALES', $warnDays);
                } else {
                    $formatted = buildFormattedCustomers($pdo, null, 'MANAGER', $warnDays);
                }
            }

            echo json_encode(['success' => true, 'customers' => $formatted], JSON_UNESCAPED_UNICODE);
            break;

        case 'createCustomer':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $data = $params['data'] ?? $params;
            $cName = trim((string)($data['CustomerName'] ?? ''));
            if (empty($cName)) {
                echo json_encode(['success' => false, 'message' => 'Tên khách hàng / đại lý không được để trống!'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $contact = trim((string)($data['ContactName'] ?? ''));
            $phone = trim((string)($data['Phone'] ?? ''));
            $address = trim((string)($data['Address'] ?? ''));
            $lat = (float)($data['Latitude'] ?? 0);
            $lng = (float)($data['Longitude'] ?? 0);
            $assignedSales = ($caller['role'] === 'SALES')
                ? $caller['user_id']
                : trim((string)($data['AssignedSalesID'] ?? ($params['creatorId'] ?? 'ALL')));
            $cType = strtoupper(trim((string)($data['CustomerType'] ?? 'NORMAL')));
            if (!in_array($cType, ['VIP', 'NORMAL', 'SMALL'], true)) {
                $cType = 'NORMAL';
            }
            $settings = loadSettingsMap($pdo);
            $defaultCycle = ($cType === 'VIP') ? (int)($settings['CARE_CYCLE_VIP'] ?? 3) : (($cType === 'SMALL') ? (int)($settings['CARE_CYCLE_SMALL'] ?? 14) : (int)($settings['CARE_CYCLE_NORMAL'] ?? 7));
            $cycleDays = max(1, (int)($data['CareCycleDays'] ?? $defaultCycle));
            $debt = (float)($data['CurrentDebt'] ?? 0);
            $stock = (int)($data['CurrentStock'] ?? 0);
            $stockUnit = trim((string)($data['StockUnit'] ?? 'Thùng')) ?: 'Thùng';
            $status = ($caller['role'] === 'SALES')
                ? 'PENDING_APPROVAL'
                : (trim((string)($data['Status'] ?? 'ACTIVE')) ?: 'ACTIVE');
            $note = trim((string)($data['Note'] ?? ''));

            $cleanPhone = preg_replace('/\D/', '', $phone);
            if (!empty($cleanPhone)) {
                $allPhStmt = $pdo->query("SELECT `customer_name`, `phone` FROM `customers` WHERE `status` != 'DELETED' AND `phone` IS NOT NULL AND `phone` != ''");
                while ($row = $allPhStmt->fetch()) {
                    if (preg_replace('/\D/', '', $row['phone']) === $cleanPhone) {
                        echo json_encode([
                            'success'     => false,
                            'isDuplicate' => true,
                            'message'     => "Số điện thoại {$phone} đã tồn tại trên khách hàng: {$row['customer_name']}"
                        ], JSON_UNESCAPED_UNICODE);
                        break 2;
                    }
                }
            }

            $proxRadius = (int)($settings['PROXIMITY_ALERT_RADIUS'] ?? 100);
            $nearbyWarning = null;
            if ($lat != 0 && $lng != 0) {
                $minDist = 999999;
                $coordStmt = $pdo->query("SELECT `customer_name`, `latitude`, `longitude` FROM `customers` WHERE `status` != 'DELETED'");
                while ($row = $coordStmt->fetch()) {
                    if ((float)$row['latitude'] != 0 && (float)$row['longitude'] != 0) {
                        $dist = calcDistanceMeters($lat, $lng, (float)$row['latitude'], (float)$row['longitude']);
                        if ($dist <= $proxRadius && $dist < $minDist) {
                            $minDist = $dist;
                            $km = number_format($dist / 1000, 2);
                            $nearbyWarning = "Lưu ý: Điểm bán '{$row['customer_name']}' nằm cách vị trí này {$km} km ({$dist}m).";
                        }
                    }
                }
            }

            $cnt = (int)$pdo->query("SELECT COUNT(*) FROM `customers`")->fetchColumn();
            $custId = 'CUST-' . str_pad($cnt + 1, 3, '0', STR_PAD_LEFT);
            $chkId = $pdo->prepare("SELECT `customer_id` FROM `customers` WHERE `customer_id` = ?");
            $chkId->execute([$custId]);
            if ($chkId->fetch()) {
                $custId = 'CUST-' . substr((string)time(), -5);
            }

            $ins = $pdo->prepare("INSERT INTO `customers` (`customer_id`, `customer_name`, `contact_name`, `phone`, `address`, `latitude`, `longitude`, `assigned_sales_id`, `status`, `note`, `customer_type`, `care_cycle_days`, `current_debt`, `current_stock`, `stock_unit`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
            $ins->execute([$custId, $cName, $contact, $phone, $address, $lat, $lng, $assignedSales, $status, $note, $cType, $cycleDays, $debt, $stock, $stockUnit]);

            $msg = ($status === 'PENDING_APPROVAL')
                ? "Đã thêm điểm mới {$cName} (Đang chờ Quản lý duyệt chính thức; bạn vẫn có thể chăm sóc ngay)!"
                : "Đã thêm khách hàng {$cName} thành công!";

            echo json_encode([
                'success'       => true,
                'customerId'    => $custId,
                'CustomerID'    => $custId,
                'status'        => $status,
                'nearbyWarning' => $nearbyWarning,
                'message'       => $msg
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'updateCustomer':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            $custId = trim((string)($params['customerId'] ?? ''));
            $data = $params['data'] ?? [];
            if (empty($custId)) {
                echo json_encode(['success' => false, 'message' => 'Thiếu mã khách hàng cần cập nhật!'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $chk = $pdo->prepare("SELECT * FROM `customers` WHERE `customer_id` = ? LIMIT 1");
            $chk->execute([$custId]);
            $existing = $chk->fetch();
            if (!$existing) {
                echo json_encode(['success' => false, 'message' => 'Không tìm thấy khách hàng trong CSDL!'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $cName = isset($data['CustomerName']) ? trim((string)$data['CustomerName']) : $existing['customer_name'];
            if (empty($cName)) {
                echo json_encode(['success' => false, 'message' => 'Tên khách hàng không được để trống!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $contact = isset($data['ContactName']) ? trim((string)$data['ContactName']) : $existing['contact_name'];
            $phone = isset($data['Phone']) ? trim((string)$data['Phone']) : $existing['phone'];
            $address = isset($data['Address']) ? trim((string)$data['Address']) : $existing['address'];
            $lat = isset($data['Latitude']) ? (float)$data['Latitude'] : (float)$existing['latitude'];
            $lng = isset($data['Longitude']) ? (float)$data['Longitude'] : (float)$existing['longitude'];
            $assignedSales = isset($data['AssignedSalesID']) ? trim((string)$data['AssignedSalesID']) : $existing['assigned_sales_id'];
            $cType = isset($data['CustomerType']) ? strtoupper(trim((string)$data['CustomerType'])) : $existing['customer_type'];
            if (!in_array($cType, ['VIP', 'NORMAL', 'SMALL'], true)) {
                $cType = 'NORMAL';
            }
            $cycleDays = isset($data['CareCycleDays']) ? max(1, (int)$data['CareCycleDays']) : (int)$existing['care_cycle_days'];
            $debt = isset($data['CurrentDebt']) ? (float)$data['CurrentDebt'] : (float)$existing['current_debt'];
            $stock = isset($data['CurrentStock']) ? (int)$data['CurrentStock'] : (int)$existing['current_stock'];
            $stockUnit = isset($data['StockUnit']) ? trim((string)$data['StockUnit']) : ($existing['stock_unit'] ?: 'Thùng');
            $note = isset($data['Note']) ? trim((string)$data['Note']) : $existing['note'];
            $status = isset($data['Status']) ? trim((string)$data['Status']) : $existing['status'];

            $nextCare = $existing['next_care_date'];
            if (!empty($existing['last_care_date']) && $cycleDays !== (int)$existing['care_cycle_days']) {
                $nextCare = date('Y-m-d H:i:s', strtotime($existing['last_care_date']) + ($cycleDays * 86400));
            }

            $up = $pdo->prepare("UPDATE `customers` SET `customer_name` = ?, `contact_name` = ?, `phone` = ?, `address` = ?, `latitude` = ?, `longitude` = ?, `assigned_sales_id` = ?, `customer_type` = ?, `care_cycle_days` = ?, `next_care_date` = ?, `current_debt` = ?, `current_stock` = ?, `stock_unit` = ?, `note` = ?, `status` = ? WHERE `customer_id` = ?");
            $up->execute([$cName, $contact, $phone, $address, $lat, $lng, $assignedSales, $cType, $cycleDays, $nextCare, $debt, $stock, $stockUnit, $note, $status, $custId]);

            echo json_encode(['success' => true, 'message' => "Đã cập nhật hồ sơ khách hàng {$cName} thành công!"], JSON_UNESCAPED_UNICODE);
            break;

        case 'deleteCustomer':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            $custId = trim((string)($params['customerId'] ?? ''));
            $chk = $pdo->prepare("SELECT `customer_name` FROM `customers` WHERE `customer_id` = ? AND `status` != 'DELETED' LIMIT 1");
            $chk->execute([$custId]);
            $row = $chk->fetch();
            if (!$row) {
                echo json_encode(['success' => false, 'message' => 'Không tìm thấy khách hàng cần xóa!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $pdo->prepare("UPDATE `customers` SET `status` = 'DELETED', `assigned_sales_id` = '' WHERE `customer_id` = ?")->execute([$custId]);
            echo json_encode(['success' => true, 'message' => "Đã chuyển khách hàng {$row['customer_name']} vào lưu trữ xóa mềm (Lịch sử đơn hàng vẫn được bảo toàn)!"], JSON_UNESCAPED_UNICODE);
            break;

        case 'approveCustomer':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            $custId = trim((string)($params['customerId'] ?? ''));
            $approved = !empty($params['approved']);
            if ($approved) {
                $pdo->prepare("UPDATE `customers` SET `status` = 'ACTIVE' WHERE `customer_id` = ?")->execute([$custId]);
                echo json_encode(['success' => true, 'message' => 'Đã duyệt điểm bán hoạt động chính thức!'], JSON_UNESCAPED_UNICODE);
            } else {
                $pdo->prepare("UPDATE `customers` SET `status` = 'DELETED' WHERE `customer_id` = ?")->execute([$custId]);
                echo json_encode(['success' => true, 'message' => 'Đã từ chối điểm bán đề xuất!'], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'getCustomerVisits':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $custId = trim((string)($params['customerId'] ?? ''));
            $stmt = $pdo->prepare("SELECT v.*, u.`name` AS `sales_name`, c.`customer_name` FROM `visits` v LEFT JOIN `users` u ON v.`sales_id` = u.`user_id` LEFT JOIN `customers` c ON v.`customer_id` = c.`customer_id` WHERE v.`customer_id` = ? AND v.`status` != 'CANCELLED' ORDER BY v.`check_in_time` DESC");
            $stmt->execute([$custId]);
            $rows = $stmt->fetchAll();
            $visits = array_map('formatVisitPayload', $rows);
            echo json_encode(['success' => true, 'visits' => $visits], JSON_UNESCAPED_UNICODE);
            break;

        case 'checkinVisit':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');
            $customerId = trim((string)($params['customerId'] ?? ($params['CustomerID'] ?? '')));
            $sessionId = trim((string)($params['sessionId'] ?? ($params['SessionID'] ?? '')));
            $lat = (float)($params['lat'] ?? 0);
            $lng = (float)($params['lng'] ?? 0);
            $acc = (float)($params['accuracy'] ?? 0);
            $now = resolveActionTimestamp($params);
            $checkInTime = !empty($params['arrivedAt']) ? resolveActionTimestamp($params, 'arrivedAt') : $now;
            if (strtotime($checkInTime) > strtotime($now)) {
                $checkInTime = $now;
            }
            $today = substr($now, 0, 10);

            if (empty($customerId)) {
                echo json_encode(['success' => false, 'message' => 'Thiếu mã khách hàng cần Check-in!'], JSON_UNESCAPED_UNICODE);
                break;
            }

            closeStaleWorkSessions($pdo, $salesId);

            if (empty($sessionId) || strpos($sessionId, 'SES-OFFLINE-') === 0 || strpos($sessionId, 'SESS-') === 0) {
                $sStmt = $pdo->prepare("SELECT `session_id` FROM `work_sessions` WHERE `sales_id` = ? AND `status` = 'WORKING' AND `date` = ? ORDER BY `check_in_time` DESC LIMIT 1");
                $sStmt->execute([$salesId, $today]);
                $sRow = $sStmt->fetch();
                if ($sRow) {
                    $sessionId = $sRow['session_id'];
                } else {
                    $sessionId = 'SES-' . time() . '-' . rand(100, 999);
                    $pdo->prepare("INSERT INTO `work_sessions` (`session_id`, `sales_id`, `date`, `check_in_time`, `check_in_lat`, `check_in_lng`, `check_in_accuracy`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, 'WORKING')")
                        ->execute([$sessionId, $salesId, $today, $checkInTime, $lat != 0 ? $lat : null, $lng != 0 ? $lng : null, $acc]);
                }
            }

            $settings = loadSettingsMap($pdo);
            $geoAudit = computeCustomerGeofence($pdo, $customerId, $lat, $lng, (int)($settings['CUSTOMER_RADIUS'] ?? 200));
            $custName = $geoAudit['customerName'] ?: $customerId;

            $existVStmt = $pdo->prepare("SELECT * FROM `visits` WHERE `sales_id` = ? AND `customer_id` = ? AND `status` = 'IN_PROGRESS' ORDER BY `check_in_time` DESC LIMIT 1");
            $existVStmt->execute([$salesId, $customerId]);
            $existV = $existVStmt->fetch();
            if ($existV) {
                if ($existV['distance_meters'] === null && $geoAudit['distance'] !== null) {
                    $pdo->prepare("UPDATE `visits` SET `check_in_lat` = ?, `check_in_lng` = ?, `check_in_accuracy` = ?, `distance_meters` = ?, `is_within_geofence` = ? WHERE `visit_id` = ?")
                        ->execute([$lat, $lng, $acc, $geoAudit['distance'], $geoAudit['within'], $existV['visit_id']]);
                    $existV['check_in_lat'] = $lat;
                    $existV['check_in_lng'] = $lng;
                    $existV['distance_meters'] = $geoAudit['distance'];
                    $existV['is_within_geofence'] = $geoAudit['within'];
                }
                $existV['customer_name'] = $custName;
                echo json_encode([
                    'success'          => true,
                    'visitId'          => $existV['visit_id'],
                    'VisitID'          => $existV['visit_id'],
                    'checkInTime'      => $existV['check_in_time'],
                    'distanceMeters'   => $existV['distance_meters'],
                    'isWithinGeofence' => $existV['is_within_geofence'],
                    'visit'            => formatVisitPayload($existV)
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            $pdo->prepare("UPDATE `visits` SET `status` = 'CANCELLED', `check_out_time` = ? WHERE `sales_id` = ? AND `status` = 'IN_PROGRESS'")
                ->execute([$now, $salesId]);

            $visitId = 'VIS-' . time() . '-' . rand(100, 999);
            $dbLat = ($lat != 0.0 || $lng != 0.0) ? $lat : null;
            $dbLng = ($lat != 0.0 || $lng != 0.0) ? $lng : null;
            $dbAcc = ($lat != 0.0 || $lng != 0.0) ? $acc : null;

            $stmt = $pdo->prepare("INSERT INTO `visits` (`visit_id`, `sales_id`, `customer_id`, `session_id`, `check_in_time`, `check_in_lat`, `check_in_lng`, `check_in_accuracy`, `distance_meters`, `is_within_geofence`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS')");
            $stmt->execute([$visitId, $salesId, $customerId, $sessionId, $checkInTime, $dbLat, $dbLng, $dbAcc, $geoAudit['distance'], $geoAudit['within']]);

            syncToGoogleSheetsAsync('checkinVisit', [
                'visitId'        => $visitId,
                'salesId'        => $salesId,
                'customerId'     => $customerId,
                'sessionId'      => $sessionId,
                'lat'            => $dbLat,
                'lng'            => $dbLng,
                'distanceMeters' => $geoAudit['distance']
            ]);

            $visitObj = formatVisitPayload([
                'visit_id'           => $visitId,
                'sales_id'           => $salesId,
                'customer_id'        => $customerId,
                'customer_name'      => $custName,
                'session_id'         => $sessionId,
                'check_in_time'      => $checkInTime,
                'check_in_lat'       => $dbLat,
                'check_in_lng'       => $dbLng,
                'check_in_accuracy'  => $dbAcc,
                'distance_meters'    => $geoAudit['distance'],
                'is_within_geofence' => $geoAudit['within'],
                'status'             => 'IN_PROGRESS'
            ]);

            echo json_encode([
                'success'          => true,
                'visitId'          => $visitId,
                'VisitID'          => $visitId,
                'checkInTime'      => $checkInTime,
                'distanceMeters'   => $geoAudit['distance'],
                'isWithinGeofence' => $geoAudit['within'],
                'visit'            => $visitObj
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'cancelVisit':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');
            $visitId = trim((string)($params['visitId'] ?? ($params['VisitID'] ?? '')));
            if (!empty($visitId)) {
                $pdo->prepare("UPDATE `visits` SET `status` = 'CANCELLED', `check_out_time` = NOW() WHERE `visit_id` = ? AND `sales_id` = ? AND `status` = 'IN_PROGRESS'")
                    ->execute([$visitId, $salesId]);
            } else {
                $pdo->prepare("UPDATE `visits` SET `status` = 'CANCELLED', `check_out_time` = NOW() WHERE `sales_id` = ? AND `status` = 'IN_PROGRESS'")
                    ->execute([$salesId]);
            }
            echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
            break;

        case 'checkoutVisit':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');
            $visitId = trim((string)($params['visitId'] ?? ($params['VisitID'] ?? '')));
            $result = trim((string)($params['result'] ?? ($params['Result'] ?? 'Hoàn thành')));
            $note = trim((string)($params['note'] ?? ($params['Note'] ?? '')));
            $now = resolveActionTimestamp($params);

            $getStmt = $pdo->prepare("SELECT * FROM `visits` WHERE `visit_id` = ? AND `sales_id` = ? LIMIT 1");
            $getStmt->execute([$visitId, $salesId]);
            $visit = $getStmt->fetch();
            if (!$visit) {
                echo json_encode(['success' => false, 'message' => 'Không tìm thấy lượt gặp khách đang tiến hành.'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $duration = max(1, (int)round((strtotime($now) - strtotime($visit['check_in_time'])) / 60));
            $upStmt = $pdo->prepare("UPDATE `visits` SET `check_out_time` = ?, `duration` = ?, `result` = ?, `note` = ?, `status` = 'COMPLETED' WHERE `visit_id` = ?");
            $upStmt->execute([$now, $duration, $result, $note, $visitId]);

            echo json_encode(['success' => true, 'duration' => $duration], JSON_UNESCAPED_UNICODE);
            break;

        case 'checkoutCareVisit':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');
            $visitId = trim((string)($params['visitId'] ?? ($params['VisitID'] ?? '')));
            $now = resolveActionTimestamp($params);

            $care = (isset($params['careData']) && is_array($params['careData'])) ? $params['careData'] : $params;
            $pick = function ($pascalKey, $camelKey, $default = '') use ($care, $params) {
                if (isset($care[$pascalKey]) && $care[$pascalKey] !== '') {
                    return $care[$pascalKey];
                }
                if (isset($care[$camelKey]) && $care[$camelKey] !== '') {
                    return $care[$camelKey];
                }
                if (isset($params[$pascalKey]) && $params[$pascalKey] !== '') {
                    return $params[$pascalKey];
                }
                if (isset($params[$camelKey]) && $params[$camelKey] !== '') {
                    return $params[$camelKey];
                }
                return $default;
            };

            $rawOrderItems = $care['OrderItems'] ?? ($care['orderItems'] ?? ($params['OrderItems'] ?? ($params['orderItems'] ?? [])));
            if (is_string($rawOrderItems)) {
                $rawOrderItems = json_decode($rawOrderItems, true) ?: [];
            }
            $cleanOrderItems = [];
            $sumOrderQty = 0;
            $sumOrderAmount = 0.0;
            $itemProductNames = [];
            if (is_array($rawOrderItems)) {
                foreach ($rawOrderItems as $it) {
                    $pName = trim((string)($it['productName'] ?? ($it['ProductName'] ?? ($it['name'] ?? ''))));
                    $qty = (int)($it['qty'] ?? ($it['Qty'] ?? 0));
                    if ($pName === '' || $qty <= 0) {
                        continue;
                    }
                    $unit = trim((string)($it['unit'] ?? ($it['Unit'] ?? 'Thùng'))) ?: 'Thùng';
                    $unitPrice = (float)($it['unitPrice'] ?? ($it['UnitPrice'] ?? ($it['price'] ?? 0)));
                    $subtotal = isset($it['subtotal']) ? (float)$it['subtotal'] : ($qty * $unitPrice);
                    $cleanOrderItems[] = [
                        'productName' => $pName,
                        'qty'         => $qty,
                        'unit'        => $unit,
                        'unitPrice'   => $unitPrice,
                        'subtotal'    => $subtotal
                    ];
                    $sumOrderQty += $qty;
                    $sumOrderAmount += $subtotal;
                    $itemProductNames[] = "{$pName} ({$qty} {$unit})";
                }
            }

            $selectedProduct   = trim((string)$pick('SelectedProduct', 'selectedProduct', ''));
            if (empty($selectedProduct) && !empty($itemProductNames)) {
                $selectedProduct = implode(', ', $itemProductNames);
            }
            $distributedQty    = (int)$pick('DistributedQty', 'distributedQty', 0);
            $distributedUnit   = trim((string)$pick('DistributedUnit', 'distributedUnit', 'Thùng')) ?: 'Thùng';
            $rawInventoryQty   = $pick('InventoryQty', 'inventoryQty', '');
            $inventoryQty      = ($rawInventoryQty !== '') ? (int)$rawInventoryQty : 0;
            $inventoryUnit     = trim((string)$pick('InventoryUnit', 'inventoryUnit', 'Thùng')) ?: 'Thùng';
            $reorderDemand     = trim((string)$pick('ReorderDemand', 'reorderDemand', ''));
            $reorderUnit       = trim((string)$pick('ReorderUnit', 'reorderUnit', 'Thùng')) ?: 'Thùng';
            $rawRecordedDebt   = $pick('RecordedDebt', 'recordedDebt', '');
            $recordedDebt      = ($rawRecordedDebt !== '') ? (float)$rawRecordedDebt : 0.0;
            $debtLimit         = (float)$pick('DebtLimit', 'debtLimit', 0);
            $paymentStatus     = trim((string)$pick('PaymentStatus', 'paymentStatus', ''));
            $newOrderQty       = $sumOrderQty > 0 ? $sumOrderQty : (int)$pick('NewOrderQty', 'newOrderQty', 0);
            $newOrderUnit      = !empty($cleanOrderItems) && count($cleanOrderItems) === 1
                ? $cleanOrderItems[0]['unit']
                : (trim((string)$pick('NewOrderUnit', 'newOrderUnit', 'Thùng')) ?: 'Thùng');
            $orderTotalAmount  = $sumOrderAmount > 0 ? $sumOrderAmount : (float)$pick('OrderTotalAmount', 'orderTotalAmount', 0);
            $orderItemsJson    = !empty($cleanOrderItems) ? json_encode($cleanOrderItems, JSON_UNESCAPED_UNICODE) : null;
            $expectedNextOrder = trim((string)$pick('ExpectedNextOrder', 'expectedNextOrder', ''));
            $consumptionRate   = trim((string)$pick('ConsumptionRate', 'consumptionRate', ''));
            $discussionDetails = trim((string)$pick('DiscussionDetails', 'discussionDetails', ''));
            $customerIssues    = trim((string)$pick('CustomerIssues', 'customerIssues', ''));
            $nextCareNeeds     = trim((string)$pick('NextCareNeeds', 'nextCareNeeds', ''));
            $result            = trim((string)$pick('Result', 'result', 'Đã chăm sóc tốt'));
            $note              = trim((string)$pick('Note', 'note', $discussionDetails));
            $fallbackCustId    = trim((string)$pick('CustomerID', 'customerId', ''));
            $careLat           = (float)$pick('Latitude', 'lat', 0);
            $careLng           = (float)$pick('Longitude', 'lng', 0);
            $careAcc           = (float)$pick('Accuracy', 'accuracy', 0);
            $rawPhotoData      = $pick('PhotoBase64', 'photoBase64', $pick('PhotoUrl', 'photoUrl', ''));

            $visit = null;
            if (!empty($visitId) && strpos($visitId, 'VIS-OFFLINE-') !== 0) {
                $getStmt = $pdo->prepare("SELECT * FROM `visits` WHERE `visit_id` = ? LIMIT 1");
                $getStmt->execute([$visitId]);
                $visit = $getStmt->fetch();
            }
            if (!$visit && !empty($fallbackCustId)) {
                $openVStmt = $pdo->prepare("SELECT * FROM `visits` WHERE `sales_id` = ? AND `customer_id` = ? AND `status` = 'IN_PROGRESS' ORDER BY `check_in_time` DESC LIMIT 1");
                $openVStmt->execute([$salesId, $fallbackCustId]);
                $visit = $openVStmt->fetch();
            }

            $settings = loadSettingsMap($pdo);
            $radiusMeters = (int)($settings['CUSTOMER_RADIUS'] ?? 200);

            if ($visit) {
                $visitId = $visit['visit_id'];
                $duration = max(1, (int)round((strtotime($now) - strtotime($visit['check_in_time'])) / 60));
                $customerId = $visit['customer_id'] ?: $fallbackCustId;
                $distMeters = $visit['distance_meters'];
                $withinGeo  = $visit['is_within_geofence'];
                if ($distMeters === null && ($careLat != 0.0 || $careLng != 0.0)) {
                    $geoAudit = computeCustomerGeofence($pdo, $customerId, $careLat, $careLng, $radiusMeters);
                    $distMeters = $geoAudit['distance'];
                    $withinGeo  = $geoAudit['within'];
                }
            } else {
                $customerId = $fallbackCustId;
                $arrivedStr = !empty($care['ArrivedAt']) ? resolveActionTimestamp($care, 'ArrivedAt') : $now;
                if (strtotime($arrivedStr) > strtotime($now)) {
                    $arrivedStr = $now;
                }
                $duration = max(1, (int)round((strtotime($now) - strtotime($arrivedStr)) / 60));
                if (empty($visitId) || strpos($visitId, 'VIS-OFFLINE-') === 0) {
                    $visitId = 'VIS-' . time() . '-' . rand(100, 999);
                }
                $sStmt = $pdo->prepare("SELECT `session_id` FROM `work_sessions` WHERE `sales_id` = ? ORDER BY FIELD(`status`, 'WORKING', 'COMPLETED'), `check_in_time` DESC LIMIT 1");
                $sStmt->execute([$salesId]);
                $sRow = $sStmt->fetch();
                $sessId = $sRow ? $sRow['session_id'] : null;

                $geoAudit = computeCustomerGeofence($pdo, $customerId, $careLat, $careLng, $radiusMeters);
                $distMeters = $geoAudit['distance'];
                $withinGeo  = $geoAudit['within'];
                $dbLat = ($careLat != 0.0 || $careLng != 0.0) ? $careLat : null;
                $dbLng = ($careLat != 0.0 || $careLng != 0.0) ? $careLng : null;
                $dbAcc = ($careLat != 0.0 || $careLng != 0.0) ? $careAcc : null;

                $pdo->prepare("INSERT INTO `visits` (`visit_id`, `sales_id`, `customer_id`, `session_id`, `check_in_time`, `check_in_lat`, `check_in_lng`, `check_in_accuracy`, `distance_meters`, `is_within_geofence`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS')")
                    ->execute([$visitId, $salesId, $customerId, $sessId, $arrivedStr, $dbLat, $dbLng, $dbAcc, $distMeters, $withinGeo]);
            }

            $savedPhotoUrl = saveVisitPhotoToDisk($visitId, $rawPhotoData);
            if ($savedPhotoUrl === null && $visit && !empty($visit['photo_url'])) {
                $savedPhotoUrl = $visit['photo_url'];
            }

            $stmt = $pdo->prepare("UPDATE `visits` SET
                `check_out_time` = ?, `duration` = ?, `result` = ?, `note` = ?, `status` = 'COMPLETED',
                `distributed_qty` = ?, `inventory_qty` = ?, `reorder_demand` = ?,
                `recorded_debt` = ?, `debt_limit` = ?, `payment_status` = ?,
                `new_order_qty` = ?, `expected_next_order` = ?, `consumption_rate` = ?,
                `discussion_details` = ?, `customer_issues` = ?, `next_care_needs` = ?,
                `selected_product` = ?, `distributed_unit` = ?, `inventory_unit` = ?, `reorder_unit` = ?, `new_order_unit` = ?,
                `distance_meters` = ?, `is_within_geofence` = ?, `photo_url` = ?, `order_items_json` = ?, `order_total_amount` = ?
                WHERE `visit_id` = ?");

            $stmt->execute([
                $now,
                $duration,
                $result,
                $note,
                $distributedQty,
                $inventoryQty,
                $reorderDemand,
                $recordedDebt,
                $debtLimit,
                $paymentStatus,
                $newOrderQty,
                $expectedNextOrder,
                $consumptionRate,
                $discussionDetails,
                $customerIssues,
                $nextCareNeeds,
                $selectedProduct,
                $distributedUnit,
                $inventoryUnit,
                $reorderUnit,
                $newOrderUnit,
                $distMeters,
                $withinGeo,
                $savedPhotoUrl,
                $orderItemsJson,
                $orderTotalAmount,
                $visitId
            ]);

            $nextCare = null;
            if (!empty($customerId)) {
                $cStmt = $pdo->prepare("SELECT `care_cycle_days`, `current_stock`, `stock_unit`, `current_debt` FROM `customers` WHERE `customer_id` = ? LIMIT 1");
                $cStmt->execute([$customerId]);
                $cRow = $cStmt->fetch();
                if ($cRow) {
                    $cycleDays = max(1, (int)($cRow['care_cycle_days'] ?: 7));
                    $nextCare = date('Y-m-d H:i:s', strtotime($now) + ($cycleDays * 86400));
                    $finalStock = ($rawInventoryQty !== '') ? $inventoryQty : (int)$cRow['current_stock'];
                    $finalUnit  = ($rawInventoryQty !== '') ? $inventoryUnit : ($cRow['stock_unit'] ?: 'Thùng');
                    $finalDebt  = ($rawRecordedDebt !== '') ? $recordedDebt : (float)$cRow['current_debt'];

                    $upCust = $pdo->prepare("UPDATE `customers` SET `last_care_date` = ?, `next_care_date` = ?, `current_stock` = ?, `stock_unit` = ?, `current_debt` = ? WHERE `customer_id` = ?");
                    $upCust->execute([$now, $nextCare, $finalStock, $finalUnit, $finalDebt, $customerId]);
                }
            }

            echo json_encode([
                'success'          => true,
                'visitId'          => $visitId,
                'VisitID'          => $visitId,
                'duration'         => $duration,
                'distanceMeters'   => $distMeters,
                'isWithinGeofence' => $withinGeo,
                'photoUrl'         => $savedPhotoUrl,
                'orderTotalAmount' => $orderTotalAmount,
                'nextCareDate'     => $nextCare
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'getSalesMySummary':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');
            closeStaleWorkSessions($pdo, $salesId);

            $today = date('Y-m-d');
            $thisMonth = date('Y-m');
            $settings = loadSettingsMap($pdo);
            $dailyTarget = max(1, (int)($settings['DAILY_VISIT_TARGET'] ?? 8));

            $todayStmt = $pdo->prepare("SELECT COUNT(*) AS `visits_cnt`, COALESCE(SUM(`new_order_qty`), 0) AS `order_qty`, COALESCE(SUM(`order_total_amount`), 0) AS `order_rev`, COALESCE(SUM(`distributed_qty`), 0) AS `dist_qty` FROM `visits` WHERE `sales_id` = ? AND DATE(`check_in_time`) = ? AND `status` = 'COMPLETED'");
            $todayStmt->execute([$salesId, $today]);
            $todayStats = $todayStmt->fetch();

            $monthStmt = $pdo->prepare("SELECT COUNT(*) AS `visits_cnt`, COALESCE(SUM(`new_order_qty`), 0) AS `order_qty`, COALESCE(SUM(`order_total_amount`), 0) AS `order_rev`, COALESCE(SUM(`distributed_qty`), 0) AS `dist_qty` FROM `visits` WHERE `sales_id` = ? AND DATE_FORMAT(`check_in_time`, '%Y-%m') = ? AND `status` = 'COMPLETED'");
            $monthStmt->execute([$salesId, $thisMonth]);
            $monthStats = $monthStmt->fetch();

            $recentStmt = $pdo->prepare("SELECT v.*, c.`customer_name` FROM `visits` v LEFT JOIN `customers` c ON v.`customer_id` = c.`customer_id` WHERE v.`sales_id` = ? AND v.`status` = 'COMPLETED' ORDER BY v.`check_in_time` DESC LIMIT 15");
            $recentStmt->execute([$salesId]);
            $recentVisits = array_map('formatVisitPayload', $recentStmt->fetchAll());

            echo json_encode([
                'success'     => true,
                'dailyTarget' => $dailyTarget,
                'today'       => [
                    'visits'       => (int)($todayStats['visits_cnt'] ?? 0),
                    'orderQty'     => (int)($todayStats['order_qty'] ?? 0),
                    'orderRevenue' => (float)($todayStats['order_rev'] ?? 0),
                    'distributed'  => (int)($todayStats['dist_qty'] ?? 0)
                ],
                'month'       => [
                    'visits'       => (int)($monthStats['visits_cnt'] ?? 0),
                    'orderQty'     => (int)($monthStats['order_qty'] ?? 0),
                    'orderRevenue' => (float)($monthStats['order_rev'] ?? 0),
                    'distributed'  => (int)($monthStats['dist_qty'] ?? 0)
                ],
                'recentVisits' => $recentVisits
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'getManagerDashboard':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            closeStaleWorkSessions($pdo);

            $targetDate = !empty($params['date']) ? substr(trim((string)$params['date']), 0, 10) : date('Y-m-d');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $targetDate)) {
                $targetDate = date('Y-m-d');
            }

            $settings = loadSettingsMap($pdo);
            $warnDays = (int)($settings['OVERDUE_WARNING_DAYS'] ?? 1);
            $customers = buildFormattedCustomers($pdo, null, 'MANAGER', $warnDays);

            $salesStmt = $pdo->query("SELECT * FROM `users` WHERE `role` = 'SALES' AND `status` = 'ACTIVE' ORDER BY `created_at` ASC");
            $salesUsers = $salesStmt->fetchAll();

            $sessStmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE `date` = ? ORDER BY FIELD(`status`, 'WORKING', 'COMPLETED'), `check_in_time` DESC");
            $sessStmt->execute([$targetDate]);
            $allSessions = $sessStmt->fetchAll();
            $sessionsBySales = [];
            foreach ($allSessions as $s) {
                if (!isset($sessionsBySales[$s['sales_id']])) {
                    $sessionsBySales[$s['sales_id']] = $s;
                }
            }

            $visStmt = $pdo->prepare("SELECT v.*, c.`customer_name` FROM `visits` v LEFT JOIN `customers` c ON v.`customer_id` = c.`customer_id` WHERE DATE(v.`check_in_time`) = ? AND v.`status` != 'CANCELLED'");
            $visStmt->execute([$targetDate]);
            $visitsBySales = [];
            while ($v = $visStmt->fetch()) {
                $visitsBySales[$v['sales_id']][] = $v;
            }

            $workingCount = 0;
            $completedCount = 0;
            $notStartedCount = 0;
            $totalVisitsToday = 0;
            $inProgressVisitsToday = 0;

            $lastGpsStmt = $pdo->prepare("SELECT * FROM `gps_logs` WHERE `session_id` = ? AND `activity_status` != 'LOW_ACCURACY' ORDER BY `timestamp` DESC, `log_id` DESC LIMIT 1");

            $salesList = [];
            foreach ($salesUsers as $u) {
                $uid = $u['user_id'];
                $session = $sessionsBySales[$uid] ?? null;
                $userVisits = $visitsBySales[$uid] ?? [];

                $statusLabel = 'CHƯA BẮT ĐẦU';
                $checkInTime = '--';
                $checkOutTime = '--';
                $visitCount = count($userVisits);
                $totalVisitsToday += $visitCount;
                $currentActivity = 'OFFLINE';
                $lastGps = null;

                $assignedCusts = array_values(array_filter($customers, fn($c) => $c['AssignedSalesID'] === $uid));
                $overdueCusts = array_filter($assignedCusts, fn($c) => $c['CareStatus'] === 'OVERDUE');
                $dueSoonCusts = array_filter($assignedCusts, fn($c) => $c['CareStatus'] === 'DUE_SOON');

                if ($session) {
                    if ($session['status'] === 'WORKING') {
                        $statusLabel = 'ĐANG LÀM';
                        $workingCount++;
                    } else {
                        $statusLabel = 'ĐÃ KẾT THÚC';
                        $completedCount++;
                    }
                    $checkInTime = !empty($session['check_in_time']) ? substr($session['check_in_time'], 11, 5) : '--';
                    $checkOutTime = !empty($session['check_out_time']) ? substr($session['check_out_time'], 11, 5) : '--';

                    $lastGpsStmt->execute([$session['session_id']]);
                    $gpsRow = $lastGpsStmt->fetch();
                    if ($gpsRow) {
                        $lastGps = formatGpsLogPayload($gpsRow);
                        $currentActivity = ($session['status'] === 'WORKING') ? $lastGps['ActivityStatus'] : 'COMPLETED';
                    } elseif ((float)$session['check_in_lat'] != 0 || (float)$session['check_in_lng'] != 0) {
                        $lastGps = [
                            'GPSLogID'       => 'INIT-' . $session['session_id'],
                            'SessionID'      => $session['session_id'],
                            'SalesID'        => $uid,
                            'Timestamp'      => $session['check_in_time'],
                            'Latitude'       => (float)$session['check_in_lat'],
                            'Longitude'      => (float)$session['check_in_lng'],
                            'Accuracy'       => (float)($session['check_in_accuracy'] ?? 15),
                            'Speed'          => 0.0,
                            'ActivityStatus' => 'STATIONARY'
                        ];
                        $currentActivity = ($session['status'] === 'WORKING') ? 'STATIONARY' : 'COMPLETED';
                    } else {
                        $currentActivity = ($session['status'] === 'WORKING') ? 'WORKING' : 'COMPLETED';
                    }

                    foreach ($userVisits as $uv) {
                        if ($uv['status'] === 'IN_PROGRESS') {
                            $inProgressVisitsToday++;
                            $cName = !empty($uv['customer_name']) ? $uv['customer_name'] : 'Khách hàng';
                            $currentActivity = "GẶP KHÁCH ({$cName})";
                            break;
                        }
                    }
                } else {
                    $notStartedCount++;
                }

                $salesList[] = [
                    'salesId'                => $uid,
                    'name'                   => $u['name'],
                    'phone'                  => $u['phone'] ?? '',
                    'team'                   => $u['team'] ?? '',
                    'status'                 => $statusLabel,
                    'checkInTime'            => $checkInTime,
                    'checkOutTime'           => $checkOutTime,
                    'visitCount'             => $visitCount,
                    'currentActivity'        => $currentActivity,
                    'lastGps'                => $lastGps,
                    'sessionId'              => $session ? $session['session_id'] : null,
                    'totalAssignedCustomers' => count($assignedCusts),
                    'overdueCount'           => count($overdueCusts),
                    'dueSoonCount'           => count($dueSoonCusts)
                ];
            }

            $overdueCustomers = array_values(array_filter($customers, fn($c) => $c['CareStatus'] === 'OVERDUE'));
            $dueSoonCustomers = array_values(array_filter($customers, fn($c) => $c['CareStatus'] === 'DUE_SOON'));
            $onTrackCustomers = array_values(array_filter($customers, fn($c) => $c['CareStatus'] === 'ON_TRACK'));
            $neverVisitedCustomers = array_values(array_filter($customers, fn($c) => $c['CareStatus'] === 'NEVER_VISITED'));

            $totalDebt = 0.0;
            $totalStock = 0;
            $highDebtCustomers = [];
            $lowStockCustomers = [];

            foreach ($customers as $c) {
                $debt = (float)$c['CurrentDebt'];
                $stock = (int)$c['CurrentStock'];
                $totalDebt += $debt;
                $totalStock += $stock;
                if ($debt >= 20000000) {
                    $highDebtCustomers[] = $c;
                }
                if ($stock > 0 && $stock <= 50) {
                    $lowStockCustomers[] = $c;
                }
            }

            $stats = [
                'totalSales'        => count($salesUsers),
                'workingCount'      => $workingCount,
                'notStartedCount'   => $notStartedCount,
                'completedCount'    => $completedCount,
                'totalVisits'       => $totalVisitsToday,
                'inProgressVisits'  => $inProgressVisitsToday,
                'totalCustomers'    => count($customers),
                'overdueCount'      => count($overdueCustomers),
                'dueSoonCount'      => count($dueSoonCustomers),
                'onTrackCount'      => count($onTrackCustomers),
                'neverVisitedCount' => count($neverVisitedCustomers),
                'totalDebt'         => $totalDebt,
                'totalStock'        => $totalStock
            ];

            echo json_encode([
                'success'    => true,
                'date'       => $targetDate,
                'stats'      => $stats,
                'sales'      => $salesList,
                'careAlerts' => [
                    'overdue'      => $overdueCustomers,
                    'dueSoon'      => $dueSoonCustomers,
                    'onTrack'      => $onTrackCustomers,
                    'neverVisited' => $neverVisitedCustomers,
                    'highDebt'     => $highDebtCustomers,
                    'lowStock'     => $lowStockCustomers
                ],
                'data'       => [
                    'activeSessions'  => $workingCount,
                    'completedVisits' => $totalVisitsToday,
                    'totalSales'      => count($salesUsers)
                ]
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'getSalesTimeline':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');
            closeStaleWorkSessions($pdo, $salesId);

            $targetDate = !empty($params['date']) ? substr(trim((string)$params['date']), 0, 10) : date('Y-m-d');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $targetDate)) {
                $targetDate = date('Y-m-d');
            }

            $uStmt = $pdo->prepare("SELECT * FROM `users` WHERE `user_id` = ? LIMIT 1");
            $uStmt->execute([$salesId]);
            $uRow = $uStmt->fetch();
            if (!$uRow) {
                echo json_encode(['success' => false, 'message' => 'Không tìm thấy thông tin Sales!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $userPayload = formatUserPayload($uRow);

            $sStmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE `sales_id` = ? AND `date` = ? ORDER BY FIELD(`status`, 'WORKING', 'COMPLETED'), `check_in_time` DESC");
            $sStmt->execute([$salesId, $targetDate]);
            $sessions = $sStmt->fetchAll();

            if (empty($sessions)) {
                echo json_encode([
                    'success' => true,
                    'user'    => $userPayload,
                    'hasData' => false,
                    'message' => "Không có dữ liệu làm việc trong ngày {$targetDate}"
                ], JSON_UNESCAPED_UNICODE);
                break;
            }

            $primarySession = $sessions[0];
            $sessionIds = array_column($sessions, 'session_id');
            $placeholders = implode(',', array_fill(0, count($sessionIds), '?'));

            $settings = loadSettingsMap($pdo);
            $accLimit = (float)($settings['GPS_ACCURACY_LIMIT'] ?? 80);

            $gStmt = $pdo->prepare("SELECT * FROM `gps_logs` WHERE `session_id` IN ({$placeholders}) ORDER BY `timestamp` ASC, `log_id` ASC");
            $gStmt->execute($sessionIds);
            $allGpsLogs = array_map('formatGpsLogPayload', $gStmt->fetchAll());
            $gpsLogs = array_values(array_filter($allGpsLogs, function ($g) use ($accLimit) {
                return $g['ActivityStatus'] !== 'LOW_ACCURACY' && $g['ActivityStatus'] !== 'UNKNOWN' && ($g['Accuracy'] <= 0 || $g['Accuracy'] <= $accLimit);
            }));

            $vStmt = $pdo->prepare("SELECT v.*, c.`customer_name`, u.`name` AS `sales_name` FROM `visits` v LEFT JOIN `customers` c ON v.`customer_id` = c.`customer_id` LEFT JOIN `users` u ON v.`sales_id` = u.`user_id` WHERE (v.`session_id` IN ({$placeholders}) OR (v.`sales_id` = ? AND DATE(v.`check_in_time`) = ?)) AND v.`status` != 'CANCELLED' ORDER BY v.`check_in_time` ASC");
            $vStmt->execute(array_merge($sessionIds, [$salesId, $targetDate]));
            $visits = array_map('formatVisitPayload', $vStmt->fetchAll());

            $interval = max(1, (int)($settings['GPS_INTERVAL'] ?? 5));
            $movingTime = 0;
            $stationaryTime = 0;

            foreach ($gpsLogs as $g) {
                if ($g['ActivityStatus'] === 'MOVING') {
                    $movingTime += $interval;
                } elseif ($g['ActivityStatus'] === 'STATIONARY') {
                    $stationaryTime += $interval;
                }
            }

            $timeline = [];
            $anomalies = [];

            foreach ($sessions as $sess) {
                if (!empty($sess['check_in_time'])) {
                    $timeline[] = [
                        'time'        => $sess['check_in_time'],
                        'displayTime' => substr($sess['check_in_time'], 11, 5),
                        'type'        => 'START_WORK',
                        'title'       => 'Bắt đầu làm việc',
                        'description' => 'Tọa độ khởi đầu: ' . (float)$sess['check_in_lat'] . ', ' . (float)$sess['check_in_lng'],
                        'lat'         => (float)$sess['check_in_lat'],
                        'lng'         => (float)$sess['check_in_lng']
                    ];
                }
                if (!empty($sess['check_out_time'])) {
                    $timeline[] = [
                        'time'        => $sess['check_out_time'],
                        'displayTime' => substr($sess['check_out_time'], 11, 5),
                        'type'        => 'END_WORK',
                        'title'       => 'Kết thúc làm việc',
                        'description' => 'Tổng thời gian ca: ' . (int)$sess['work_duration'] . ' phút',
                        'lat'         => (float)$sess['check_out_lat'],
                        'lng'         => (float)$sess['check_out_lng']
                    ];
                }
            }

            foreach ($visits as $v) {
                $custName = !empty($v['CustomerName']) ? $v['CustomerName'] : ('Khách hàng ' . $v['CustomerID']);
                $durLabel = ($v['Status'] === 'IN_PROGRESS' || empty($v['Duration'])) ? 'Đang gặp' : ($v['Duration'] . ' phút');
                $extraSummary = [];
                if ($v['DistanceToCustomer'] !== null) {
                    $distLabel = $v['DistanceToCustomer'] >= 1000
                        ? (number_format($v['DistanceToCustomer'] / 1000, 2) . ' km')
                        : ($v['DistanceToCustomer'] . 'm');
                    $geoTag = ($v['IsWithinGeofence'] === 1) ? "Đúng vị trí ({$distLabel})" : "Cách điểm bán {$distLabel}";
                    $extraSummary[] = $geoTag;
                    if ($v['IsWithinGeofence'] === 0) {
                        $anomalies[] = [
                            'type'    => 'OUT_OF_GEOFENCE',
                            'message' => "Lượt chăm sóc '{$custName}' lúc " . substr($v['CheckInTime'], 11, 5) . " được ghi nhận cách vị trí cửa hàng {$distLabel}."
                        ];
                    }
                } else {
                    $extraSummary[] = 'Không có GPS lúc mở phiếu';
                }
                if ($v['NewOrderQty'] > 0) {
                    $revPart = $v['OrderTotalAmount'] > 0 ? (' - ' . number_format($v['OrderTotalAmount'], 0, ',', '.') . 'đ') : '';
                    $extraSummary[] = "Đơn mới: +{$v['NewOrderQty']} {$v['NewOrderUnit']}{$revPart}";
                }
                if ($v['DistributedQty'] > 0) {
                    $extraSummary[] = "Giao: {$v['DistributedQty']} {$v['DistributedUnit']}";
                }
                $extraStr = !empty($extraSummary) ? (' | ' . implode(' | ', $extraSummary)) : '';
                $timeline[] = [
                    'time'         => $v['CheckInTime'],
                    'displayTime'  => substr($v['CheckInTime'], 11, 5),
                    'type'         => 'VISIT_CHECKIN',
                    'title'        => "Gặp khách: {$custName}",
                    'description'  => "Thời lượng: {$durLabel} | Kết quả: " . ($v['Result'] ?: '--') . $extraStr . " | Ghi chú: " . ($v['Note'] ?: '--'),
                    'duration'     => $v['Duration'],
                    'result'       => $v['Result'],
                    'note'         => $v['Note'],
                    'photoUrl'     => $v['PhotoUrl'],
                    'lat'          => $v['CheckInLatitude'],
                    'lng'          => $v['CheckInLongitude'],
                    'customerName' => $custName
                ];
            }

            $lastStatus = null;
            foreach ($gpsLogs as $g) {
                if ($g['ActivityStatus'] !== $lastStatus) {
                    $timeline[] = [
                        'time'        => $g['Timestamp'],
                        'displayTime' => substr($g['Timestamp'], 11, 5),
                        'type'        => ($g['ActivityStatus'] === 'MOVING') ? 'MOVING' : 'STATIONARY',
                        'title'       => ($g['ActivityStatus'] === 'MOVING') ? 'Đang di chuyển' : 'Đứng yên',
                        'description' => 'Tốc độ: ' . number_format((float)$g['Speed'], 1) . ' m/s | Sai số: ' . round((float)$g['Accuracy']) . 'm',
                        'lat'         => $g['Latitude'],
                        'lng'         => $g['Longitude']
                    ];
                    $lastStatus = $g['ActivityStatus'];
                }
            }

            usort($timeline, fn($a, $b) => strtotime($a['time']) <=> strtotime($b['time']));

            $totalWorkDuration = 0;
            foreach ($sessions as $sess) {
                if ($sess['status'] === 'WORKING') {
                    $totalWorkDuration += max(0, (int)round((time() - strtotime($sess['check_in_time'])) / 60));
                } else {
                    $totalWorkDuration += (int)$sess['work_duration'];
                }
            }

            if (empty($gpsLogs) && $primarySession['status'] === 'WORKING') {
                $anomalies[] = ['type' => 'NO_GPS', 'message' => 'Chưa ghi nhận điểm GPS đạt chuẩn nào trong ca làm'];
            }
            $statWarnMins = max(30, (int)($settings['STATIONARY_TIME'] ?? 15) * 4);
            if ($stationaryTime >= max(120, $statWarnMins)) {
                $anomalies[] = ['type' => 'LONG_STATIONARY', 'message' => 'Thời gian đứng yên tích lũy trong ca: ' . round($stationaryTime / 60, 1) . ' giờ'];
            }

            $earliestSession = $sessions[count($sessions) - 1];
            echo json_encode([
                'success'   => true,
                'user'      => $userPayload,
                'hasData'   => true,
                'session'   => formatSessionPayload($primarySession),
                'summary'   => [
                    'checkIn'        => !empty($earliestSession['check_in_time']) ? substr($earliestSession['check_in_time'], 11, 5) : '--',
                    'checkOut'       => !empty($primarySession['check_out_time']) ? substr($primarySession['check_out_time'], 11, 5) : '--',
                    'workDuration'   => $totalWorkDuration,
                    'visitCount'     => count($visits),
                    'movingTime'     => $movingTime,
                    'stationaryTime' => $stationaryTime,
                    'gpsRecordCount' => count($gpsLogs)
                ],
                'gpsRoute'  => $gpsLogs,
                'visits'    => $visits,
                'timeline'  => $timeline,
                'anomalies' => $anomalies
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'getPerformanceReports':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            closeStaleWorkSessions($pdo);

            $period = strtolower(trim((string)($params['period'] ?? 'today')));
            $targetSalesId = trim((string)($params['salesId'] ?? 'ALL')) ?: 'ALL';
            $targetDate = !empty($params['date']) ? substr(trim((string)$params['date']), 0, 10) : date('Y-m-d');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $targetDate)) {
                $targetDate = date('Y-m-d');
            }

            $settings = loadSettingsMap($pdo);
            $warnDays = (int)($settings['OVERDUE_WARNING_DAYS'] ?? 1);
            $dailyTarget = max(1, (int)($settings['DAILY_VISIT_TARGET'] ?? 8));
            $allCusts = buildFormattedCustomers($pdo, null, 'MANAGER', $warnDays);

            if ($targetSalesId !== 'ALL') {
                $uStmt = $pdo->prepare("SELECT * FROM `users` WHERE `role` = 'SALES' AND `user_id` = ? ORDER BY `created_at` ASC");
                $uStmt->execute([$targetSalesId]);
            } else {
                $uStmt = $pdo->query("SELECT * FROM `users` WHERE `role` = 'SALES' AND `status` = 'ACTIVE' ORDER BY `created_at` ASC");
            }
            $salesUsers = $uStmt->fetchAll();

            $visitDateSql = "";
            $sessDateSql = "";
            $dateParams = [];
            if ($period === 'today') {
                $visitDateSql = " AND DATE(`check_in_time`) = ?";
                $sessDateSql  = " AND `date` = ?";
                $dateParams   = [$targetDate];
            } elseif ($period === 'week') {
                $startWeek = date('Y-m-d', strtotime($targetDate . ' -6 days'));
                $visitDateSql = " AND DATE(`check_in_time`) BETWEEN ? AND ?";
                $sessDateSql  = " AND `date` BETWEEN ? AND ?";
                $dateParams   = [$startWeek, $targetDate];
            } elseif ($period === 'month') {
                $monthPrefix = substr($targetDate, 0, 7);
                $visitDateSql = " AND DATE_FORMAT(`check_in_time`, '%Y-%m') = ?";
                $sessDateSql  = " AND DATE_FORMAT(`date`, '%Y-%m') = ?";
                $dateParams   = [$monthPrefix];
            }

            $vStmt = $pdo->prepare("SELECT * FROM `visits` WHERE `status` != 'CANCELLED'{$visitDateSql}");
            $vStmt->execute($dateParams);
            $visitsBySales = [];
            while ($v = $vStmt->fetch()) {
                $visitsBySales[$v['sales_id']][] = $v;
            }

            $sStmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE 1=1{$sessDateSql}");
            $sStmt->execute($dateParams);
            $sessionsBySales = [];
            while ($s = $sStmt->fetch()) {
                $sessionsBySales[$s['sales_id']][] = $s;
            }

            $repReports = [];
            foreach ($salesUsers as $u) {
                $uid = $u['user_id'];
                $assignedCusts = array_values(array_filter($allCusts, fn($c) => $c['AssignedSalesID'] === $uid || $c['AssignedSalesID'] === 'ALL'));
                $overdueCusts = array_filter($assignedCusts, fn($c) => $c['CareStatus'] === 'OVERDUE');
                $dueSoonCusts = array_filter($assignedCusts, fn($c) => $c['CareStatus'] === 'DUE_SOON');
                $onTrackCusts = array_filter($assignedCusts, fn($c) => $c['CareStatus'] === 'ON_TRACK' || $c['CareStatus'] === 'DUE_SOON');

                $uVisits = $visitsBySales[$uid] ?? [];
                $uSessions = $sessionsBySales[$uid] ?? [];

                $totalDistributed = 0;
                $totalNewOrders = 0;
                $totalOrderRevenue = 0.0;
                $totalVisitDuration = 0;
                $completedVisitsCount = 0;
                $verifiedGpsVisitsCount = 0;

                foreach ($uVisits as $v) {
                    $totalDistributed += (int)($v['distributed_qty'] ?? 0);
                    $totalNewOrders += (int)($v['new_order_qty'] ?? 0);
                    $totalOrderRevenue += (float)($v['order_total_amount'] ?? 0);
                    $totalVisitDuration += (int)($v['duration'] ?? 0);
                    if ($v['status'] === 'COMPLETED' || (int)($v['duration'] ?? 0) > 0) {
                        $completedVisitsCount++;
                        if (isset($v['is_within_geofence']) && (int)$v['is_within_geofence'] === 1) {
                            $verifiedGpsVisitsCount++;
                        }
                    }
                }

                $totalWorkMinutes = 0;
                foreach ($uSessions as $s) {
                    if ($s['status'] === 'WORKING') {
                        $totalWorkMinutes += max(0, (int)round((time() - strtotime($s['check_in_time'])) / 60));
                    } else {
                        $totalWorkMinutes += (int)($s['work_duration'] ?? 0);
                    }
                }

                $assignedCount = count($assignedCusts);
                if ($period === 'today') {
                    $targetVisits = $assignedCount > 0 ? min($assignedCount, $dailyTarget) : $dailyTarget;
                } elseif ($period === 'week') {
                    $targetVisits = max(1, $dailyTarget * 6);
                } elseif ($period === 'month') {
                    $targetVisits = max(1, $dailyTarget * 26);
                } else {
                    $targetVisits = max(1, $assignedCount > 0 ? $assignedCount : $dailyTarget);
                }

                $routeCompletionRate = min(100, (int)round(($completedVisitsCount / max(1, $targetVisits)) * 100));
                $careComplianceRate = $assignedCount > 0 ? (int)round((count($onTrackCusts) / $assignedCount) * 100) : 100;
                $avgTimePerVisit = $completedVisitsCount > 0 ? (int)round($totalVisitDuration / $completedVisitsCount) : 0;
                $totalFieldHours = number_format($totalWorkMinutes / 60, 1, '.', '');

                $performanceRating = 'ĐẠT';
                $ratingBadge = 'badge-working';
                if ($routeCompletionRate >= 80 && count($overdueCusts) === 0) {
                    $performanceRating = 'XUẤT SẮC';
                    $ratingBadge = 'badge-completed';
                } elseif (count($overdueCusts) > 2 || $routeCompletionRate < 50) {
                    $performanceRating = 'CẦN CẢI THIỆN';
                    $ratingBadge = 'badge-notstarted';
                }

                $repReports[] = [
                    'salesId'                => $uid,
                    'name'                   => $u['name'],
                    'team'                   => $u['team'] ?? '',
                    'phone'                  => $u['phone'] ?? '',
                    'totalAssignedCustomers' => $assignedCount,
                    'completedVisits'        => $completedVisitsCount,
                    'verifiedGpsVisits'      => $verifiedGpsVisitsCount,
                    'targetVisits'           => $targetVisits,
                    'routeCompletionRate'    => $routeCompletionRate,
                    'careComplianceRate'     => $careComplianceRate,
                    'overdueCount'           => count($overdueCusts),
                    'dueSoonCount'           => count($dueSoonCusts),
                    'totalDistributed'       => $totalDistributed,
                    'totalNewOrders'         => $totalNewOrders,
                    'totalOrderRevenue'      => $totalOrderRevenue,
                    'totalFieldHours'        => $totalFieldHours,
                    'totalWorkMinutes'       => $totalWorkMinutes,
                    'avgTimePerVisit'        => $avgTimePerVisit,
                    'performanceRating'      => $performanceRating,
                    'ratingBadge'            => $ratingBadge
                ];
            }

            $sumVisits  = array_sum(array_column($repReports, 'completedVisits'));
            $sumOrders  = array_sum(array_column($repReports, 'totalNewOrders'));
            $sumRevenue = array_sum(array_column($repReports, 'totalOrderRevenue'));
            $sumDist    = array_sum(array_column($repReports, 'totalDistributed'));
            $sumMins    = array_sum(array_column($repReports, 'totalWorkMinutes'));
            $sumHours   = number_format($sumMins / 60, 1, '.', '');
            $avgRoute   = count($repReports) > 0 ? (int)round(array_sum(array_column($repReports, 'routeCompletionRate')) / count($repReports)) : 0;
            $sumOverdue = array_sum(array_column($repReports, 'overdueCount'));

            echo json_encode([
                'success' => true,
                'period'  => $period,
                'salesId' => $targetSalesId,
                'date'    => $targetDate,
                'summary' => [
                    'totalSalesCount'        => count($repReports),
                    'totalVisits'            => $sumVisits,
                    'totalOrders'            => $sumOrders,
                    'totalOrderRevenue'      => $sumRevenue,
                    'totalDistributed'       => $sumDist,
                    'totalFieldHours'        => $sumHours,
                    'avgRouteCompletionRate' => $avgRoute,
                    'totalOverdueCount'      => $sumOverdue
                ],
                'reports' => $repReports
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'requestCustomerUpdate':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $salesId = resolveTargetSalesId($caller, $params['salesId'] ?? '');
            $reqId = 'REQ-' . time() . '-' . rand(100, 999);
            $customerId = trim((string)($params['customerId'] ?? ''));
            $customerName = trim((string)($params['customerName'] ?? ''));
            $salesName = trim((string)($params['salesName'] ?? ''));
            if (empty($salesName)) {
                if ($salesId === $caller['user_id']) {
                    $salesName = $caller['name'];
                } else {
                    $snStmt = $pdo->prepare("SELECT `name` FROM `users` WHERE `user_id` = ? LIMIT 1");
                    $snStmt->execute([$salesId]);
                    $snRow = $snStmt->fetch();
                    $salesName = $snRow ? $snRow['name'] : $salesId;
                }
            }
            $oldData = is_string($params['oldData'] ?? null) ? $params['oldData'] : json_encode($params['oldData'] ?? [], JSON_UNESCAPED_UNICODE);
            $newData = is_string($params['newData'] ?? null) ? $params['newData'] : json_encode($params['newData'] ?? [], JSON_UNESCAPED_UNICODE);
            $reason = trim((string)($params['reason'] ?? ''));

            $stmt = $pdo->prepare("INSERT INTO `customer_update_requests` (`request_id`, `customer_id`, `customer_name`, `sales_id`, `sales_name`, `old_data`, `new_data`, `reason`, `status`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())");
            $stmt->execute([$reqId, $customerId, $customerName, $salesId, $salesName, $oldData, $newData, $reason]);

            echo json_encode(['success' => true, 'requestId' => $reqId], JSON_UNESCAPED_UNICODE);
            break;

        case 'getCustomerUpdateRequests':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $status = $params['status'] ?? null;
            if ($caller['role'] === 'SALES') {
                if ($status && $status !== 'ALL') {
                    $stmt = $pdo->prepare("SELECT * FROM `customer_update_requests` WHERE `sales_id` = ? AND `status` = ? ORDER BY `created_at` DESC");
                    $stmt->execute([$caller['user_id'], $status]);
                } else {
                    $stmt = $pdo->prepare("SELECT * FROM `customer_update_requests` WHERE `sales_id` = ? ORDER BY `created_at` DESC");
                    $stmt->execute([$caller['user_id']]);
                }
            } else {
                if ($status && $status !== 'ALL') {
                    $stmt = $pdo->prepare("SELECT * FROM `customer_update_requests` WHERE `status` = ? ORDER BY `created_at` DESC");
                    $stmt->execute([$status]);
                } else {
                    $stmt = $pdo->query("SELECT * FROM `customer_update_requests` ORDER BY `created_at` DESC");
                }
            }
            $rows = $stmt->fetchAll();
            $result = [];
            foreach ($rows as $r) {
                $result[] = [
                    'RequestID'      => $r['request_id'],
                    'CustomerID'     => $r['customer_id'],
                    'CustomerName'   => $r['customer_name'],
                    'SalesID'        => $r['sales_id'],
                    'SalesName'      => $r['sales_name'],
                    'OldData'        => json_decode($r['old_data'], true) ?: $r['old_data'],
                    'NewData'        => json_decode($r['new_data'], true) ?: $r['new_data'],
                    'Reason'         => $r['reason'],
                    'Status'         => $r['status'],
                    'CreatedAt'      => $r['created_at'],
                    'ResolvedAt'     => $r['resolved_at'],
                    'ApprovedAt'     => $r['resolved_at'],
                    'ApproverName'   => $r['approver_name'],
                    'ApprovedByName' => $r['approver_name'],
                    'RejectReason'   => $r['reject_reason']
                ];
            }
            echo json_encode(['success' => true, 'requests' => $result], JSON_UNESCAPED_UNICODE);
            break;

        case 'resolveCustomerUpdateRequest':
            $caller = requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            $reqId = trim((string)($params['requestId'] ?? ''));
            $isApproved = !empty($params['isApproved']);
            $rejectReason = $params['rejectReason'] ?? null;
            $approverName = trim((string)($params['approverName'] ?? $caller['name'])) ?: $caller['name'];
            $now = date('Y-m-d H:i:s');
            $newStatus = $isApproved ? 'APPROVED' : 'REJECTED';

            $getReq = $pdo->prepare("SELECT * FROM `customer_update_requests` WHERE `request_id` = ?");
            $getReq->execute([$reqId]);
            $req = $getReq->fetch();
            if (!$req) {
                echo json_encode(['success' => false, 'message' => 'Yêu cầu không tồn tại.'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $stmt = $pdo->prepare("UPDATE `customer_update_requests` SET `status` = ?, `resolved_at` = ?, `approver_name` = ?, `reject_reason` = ? WHERE `request_id` = ?");
            $stmt->execute([$newStatus, $now, $approverName, $rejectReason, $reqId]);

            if ($isApproved) {
                $newData = json_decode($req['new_data'], true) ?: [];
                $fields = [];
                $values = [];

                $newContact = $newData['ContactName'] ?? ($newData['contactName'] ?? null);
                if ($newContact !== null) {
                    $fields[] = "`contact_name` = ?";
                    $values[] = trim((string)$newContact);
                }
                $newPhone = $newData['Phone'] ?? ($newData['phone'] ?? null);
                if ($newPhone !== null) {
                    $fields[] = "`phone` = ?";
                    $values[] = trim((string)$newPhone);
                }
                $newAddr = $newData['Address'] ?? ($newData['address'] ?? null);
                if ($newAddr !== null) {
                    $fields[] = "`address` = ?";
                    $values[] = trim((string)$newAddr);
                }
                $newType = $newData['CustomerType'] ?? ($newData['customerType'] ?? null);
                if ($newType !== null) {
                    $cleanType = strtoupper(trim((string)$newType));
                    if (in_array($cleanType, ['VIP', 'NORMAL', 'SMALL'], true)) {
                        $settings = loadSettingsMap($pdo);
                        $cycleMap = [
                            'VIP'    => (int)($settings['CARE_CYCLE_VIP'] ?? 3),
                            'NORMAL' => (int)($settings['CARE_CYCLE_NORMAL'] ?? 7),
                            'SMALL'  => (int)($settings['CARE_CYCLE_SMALL'] ?? 14)
                        ];
                        $fields[] = "`customer_type` = ?";
                        $values[] = $cleanType;
                        $fields[] = "`care_cycle_days` = ?";
                        $values[] = $cycleMap[$cleanType];
                    }
                }
                $newNote = $newData['Note'] ?? ($newData['note'] ?? null);
                if ($newNote !== null) {
                    $fields[] = "`note` = ?";
                    $values[] = trim((string)$newNote);
                }

                if (!empty($fields)) {
                    $values[] = $req['customer_id'];
                    $sql = "UPDATE `customers` SET " . implode(', ', $fields) . " WHERE `customer_id` = ?";
                    $pdo->prepare($sql)->execute($values);
                }
            }

            echo json_encode(['success' => true, 'message' => $isApproved ? 'Đã phê duyệt và cập nhật thông tin đại lý!' : 'Đã từ chối đề xuất thay đổi.'], JSON_UNESCAPED_UNICODE);
            break;

        case 'getProducts':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER', 'SALES']);
            $category = $params['category'] ?? null;
            $status = $params['status'] ?? null;
            $sql = "SELECT * FROM `products` WHERE 1=1";
            $values = [];
            if ($category && $category !== 'ALL') {
                $sql .= " AND `category` = ?";
                $values[] = $category;
            }
            if ($status && $status !== 'ALL') {
                $sql .= " AND `status` = ?";
                $values[] = $status;
            }
            $sql .= " ORDER BY `created_at` DESC";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($values);
            $products = [];
            while ($p = $stmt->fetch()) {
                $products[] = [
                    'ProductID'    => $p['id'],
                    'ProductName'  => $p['name'],
                    'CategoryID'   => $p['category'],
                    'CategoryName' => $p['category'],
                    'Unit'         => $p['default_unit'],
                    'Packaging'    => $p['spec'] ?? '',
                    'BasePrice'    => (float)$p['price'],
                    'Status'       => $p['status'],
                    'id'           => $p['id'],
                    'name'         => $p['name'],
                    'category'     => $p['category'],
                    'defaultUnit'  => $p['default_unit'],
                    'ratio'        => (int)$p['ratio'],
                    'baseUnit'     => $p['base_unit'],
                    'price'        => (float)$p['price'],
                    'status'       => $p['status'],
                    'spec'         => $p['spec'] ?? ''
                ];
            }
            echo json_encode(['success' => true, 'products' => $products, 'data' => $products], JSON_UNESCAPED_UNICODE);
            break;

        case 'saveProduct':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            $pData = $params['productData'] ?? $params;
            $pId = trim((string)($pData['ProductID'] ?? ($pData['id'] ?? '')));
            if (empty($pId)) {
                $pId = 'PRD-' . str_pad(rand(10, 999), 3, '0', STR_PAD_LEFT);
            }
            $name = trim((string)($pData['ProductName'] ?? ($pData['name'] ?? '')));
            if (empty($name)) {
                echo json_encode(['success' => false, 'message' => 'Tên sản phẩm không được để trống!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $category = trim((string)($pData['CategoryName'] ?? ($pData['CategoryID'] ?? ($pData['category'] ?? 'Dầu Nhờn & Mỡ Bôi Trơn'))));
            $defaultUnit = trim((string)($pData['Unit'] ?? ($pData['defaultUnit'] ?? 'Thùng'))) ?: 'Thùng';
            $unitRatioMap = ['Thùng' => 24, 'Xô' => 18, 'Bình' => 4, 'Phuy' => 200, 'Chai' => 1, 'Lon' => 1, 'Can' => 4];
            $ratio = isset($pData['ratio']) ? (int)$pData['ratio'] : ($unitRatioMap[$defaultUnit] ?? 1);
            $baseUnit = trim((string)($pData['baseUnit'] ?? 'Chai')) ?: 'Chai';
            $price = (float)($pData['BasePrice'] ?? ($pData['price'] ?? 0));
            $status = strtoupper(trim((string)($pData['Status'] ?? ($pData['status'] ?? 'ACTIVE'))));
            if (!in_array($status, ['ACTIVE', 'INACTIVE'], true)) {
                $status = 'ACTIVE';
            }
            $spec = trim((string)($pData['Packaging'] ?? ($pData['spec'] ?? '')));

            $chk = $pdo->prepare("SELECT `id` FROM `products` WHERE `id` = ?");
            $chk->execute([$pId]);
            if ($chk->fetch()) {
                $stmt = $pdo->prepare("UPDATE `products` SET `name` = ?, `category` = ?, `default_unit` = ?, `ratio` = ?, `base_unit` = ?, `price` = ?, `status` = ?, `spec` = ? WHERE `id` = ?");
                $stmt->execute([$name, $category, $defaultUnit, $ratio, $baseUnit, $price, $status, $spec, $pId]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO `products` (`id`, `name`, `category`, `default_unit`, `ratio`, `base_unit`, `price`, `status`, `spec`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$pId, $name, $category, $defaultUnit, $ratio, $baseUnit, $price, $status, $spec]);
            }

            echo json_encode(['success' => true, 'productId' => $pId, 'message' => "Đã lưu sản phẩm {$name} thành công!"], JSON_UNESCAPED_UNICODE);
            break;

        case 'toggleProductStatus':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            $pId = trim((string)($params['productId'] ?? ''));
            $chk = $pdo->prepare("SELECT `status`, `name` FROM `products` WHERE `id` = ?");
            $chk->execute([$pId]);
            $curr = $chk->fetch();
            if ($curr) {
                $newSt = ($curr['status'] === 'ACTIVE') ? 'INACTIVE' : 'ACTIVE';
                $up = $pdo->prepare("UPDATE `products` SET `status` = ? WHERE `id` = ?");
                $up->execute([$newSt, $pId]);
                echo json_encode(['success' => true, 'newStatus' => $newSt, 'message' => "Đã đổi trạng thái sản phẩm {$curr['name']} sang {$newSt}!"], JSON_UNESCAPED_UNICODE);
            } else {
                echo json_encode(['success' => false, 'message' => 'Sản phẩm không tồn tại.'], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'deleteProduct':
            requireAuth($pdo, $params, ['ADMIN', 'MANAGER']);
            $pId = trim((string)($params['productId'] ?? ''));
            $chk = $pdo->prepare("SELECT `name` FROM `products` WHERE `id` = ? LIMIT 1");
            $chk->execute([$pId]);
            $row = $chk->fetch();
            if (!$row) {
                echo json_encode(['success' => false, 'message' => 'Không tìm thấy sản phẩm cần xóa!'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $pdo->prepare("DELETE FROM `products` WHERE `id` = ?")->execute([$pId]);
            echo json_encode(['success' => true, 'message' => "Đã xóa mặt hàng {$row['name']} khỏi danh mục!"], JSON_UNESCAPED_UNICODE);
            break;

        default:
            echo json_encode(['success' => false, 'message' => 'Action không hợp lệ: ' . $action], JSON_UNESCAPED_UNICODE);
            break;
    }
} catch (Exception $e) {
    writeSystemLog($pdo, 'ERROR', 'API_EXCEPTION', $e->getMessage(), ['action' => $action]);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Lỗi xử lý API: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
