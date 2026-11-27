<?php
/**
 * CỔNG TIẾP NHẬN GPS CHẠY NGẦM TRACCAR CLIENT (ANDROID & iOS) - SALERKINGPETRO
 * Tương thích đồng thời:
 *   1. Chuẩn JSON lồng mới của Traccar Client v8/v9+ ({ device_id, location: { coords: {...}, is_moving, timestamp } })
 *   2. Chuẩn mảng batch locations khi thiết bị có sóng 4G trở lại ({ device_id, locations: [...] })
 *   3. Chuẩn OsmAnd GET/POST truyền thống (?id=...&lat=...&lon=...&speed=...&accuracy=...&timestamp=...)
 *
 * Bảo mật & Quyền riêng tư:
 *   - Bắt buộc khớp Mã định danh có chữ ký HMAC 6 ký tự (VD: USR-002-XXXXXX).
 *   - CHỈ lưu tọa độ khi nhân viên đang mở ca làm việc hợp lệ trong ngày (status = 'WORKING').
 *   - Ngoài ca làm việc (chưa Bắt đầu ca hoặc đã Kết thúc ca), trả HTTP 200 OK để app xóa hàng đợi mà KHÔNG lưu vị trí cá nhân.
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit;
}

function traccarCalcDistMeters($lat1, $lon1, $lat2, $lon2)
{
    $R = 6371000;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) * sin($dLat / 2) +
         cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
         sin($dLon / 2) * sin($dLon / 2);
    return (int)round($R * 2 * atan2(sqrt($a), sqrt(1 - $a)));
}

function traccarParseTimestamp($rawTs)
{
    $now = time();
    if ($rawTs === null || $rawTs === '') {
        return date('Y-m-d H:i:s', $now);
    }
    if (is_numeric($rawTs)) {
        $num = (float)$rawTs;
        // Nếu là milliseconds (13 chữ số)
        if ($num > 9999999999) {
            $num = $num / 1000;
        }
        $ts = (int)round($num);
    } else {
        $ts = strtotime((string)$rawTs);
    }
    if ($ts === false || $ts < ($now - 7 * 86400) || $ts > ($now + 600)) {
        $ts = $now;
    }
    return date('Y-m-d H:i:s', $ts);
}

$rawInput = file_get_contents('php://input');
$jsonBody = !empty($rawInput) ? json_decode($rawInput, true) : null;
$reqParams = array_merge($_GET ?? [], $_POST ?? []);

// 1. Trích xuất device_id và danh sách điểm tọa độ từ mọi định dạng Traccar / OsmAnd
$deviceId = '';
$points = [];

if (is_array($jsonBody)) {
    // Trường hợp body là mảng các gói tin
    if (isset($jsonBody[0]) && is_array($jsonBody[0])) {
        foreach ($jsonBody as $pkt) {
            if (empty($deviceId) && !empty($pkt['device_id'])) {
                $deviceId = (string)$pkt['device_id'];
            }
            if (isset($pkt['location']) && is_array($pkt['location'])) {
                $points[] = ['nested' => true, 'data' => $pkt['location']];
            } else {
                $points[] = ['nested' => false, 'data' => $pkt];
            }
        }
    } else {
        $deviceId = (string)($jsonBody['device_id'] ?? ($jsonBody['id'] ?? ($jsonBody['deviceid'] ?? ($reqParams['id'] ?? ($reqParams['device_id'] ?? '')))));
        if (isset($jsonBody['locations']) && is_array($jsonBody['locations'])) {
            foreach ($jsonBody['locations'] as $loc) {
                if (is_array($loc)) {
                    $points[] = ['nested' => isset($loc['coords']), 'data' => $loc];
                }
            }
        } elseif (isset($jsonBody['location']) && is_array($jsonBody['location'])) {
            // Traccar Client v8/v9 có thể gửi location là 1 object hoặc mảng các object
            if (isset($jsonBody['location'][0]) && is_array($jsonBody['location'][0])) {
                foreach ($jsonBody['location'] as $loc) {
                    $points[] = ['nested' => isset($loc['coords']), 'data' => $loc];
                }
            } else {
                $points[] = ['nested' => isset($jsonBody['location']['coords']), 'data' => $jsonBody['location']];
            }
        } else {
            $points[] = ['nested' => isset($jsonBody['coords']), 'data' => $jsonBody];
        }
    }
} else {
    $deviceId = (string)($reqParams['id'] ?? ($reqParams['deviceid'] ?? ($reqParams['device_id'] ?? '')));
    if ($deviceId !== '' || isset($reqParams['lat']) || isset($reqParams['latitude'])) {
        $points[] = ['nested' => false, 'data' => $reqParams];
    }
}

// Nếu mở trực tiếp URL trên trình duyệt không kèm tham số -> Báo trạng thái cổng hoạt động
if ($deviceId === '' && empty($points)) {
    http_response_code(200);
    echo json_encode([
        'ok'      => true,
        'service' => 'KingPetro Background GPS Receiver (Traccar Client Compatible)',
        'status'  => 'READY'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 2. Xác thực chữ ký mã thiết bị (chống người lạ giả mạo mã nhân viên)
$salesId = verifyTraccarDeviceId($deviceId);
if ($salesId === null) {
    http_response_code(403);
    echo json_encode([
        'ok'      => false,
        'error'   => 'INVALID_DEVICE_ID',
        'message' => 'Mã định danh thiết bị (Device Identifier) không hợp lệ! Vui lòng sao chép đúng mã có kèm 6 ký tự bảo mật trong ứng dụng SalerKingpetro.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDbConnection();

    // Kiểm tra nhân sự còn ACTIVE
    $uStmt = $pdo->prepare("SELECT `user_id`, `status` FROM `users` WHERE `user_id` = ? LIMIT 1");
    $uStmt->execute([$salesId]);
    $userRow = $uStmt->fetch();
    if (!$userRow || $userRow['status'] !== 'ACTIVE') {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'USER_INACTIVE'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Tự động đóng ca treo từ ngày cũ trước khi kiểm tra ca hôm nay
    $today = date('Y-m-d');
    $staleStmt = $pdo->prepare("SELECT `session_id`, `date`, `check_in_time` FROM `work_sessions` WHERE `sales_id` = ? AND `status` = 'WORKING' AND `date` < ?");
    $staleStmt->execute([$salesId, $today]);
    foreach ($staleStmt->fetchAll() as $sr) {
        $endDayStr = $sr['date'] . ' 18:00:00';
        $inTs = strtotime($sr['check_in_time']);
        $endTs = strtotime($endDayStr);
        if ($endTs <= $inTs) {
            $endDayStr = date('Y-m-d H:i:s', $inTs + 3600);
        }
        $dur = max(1, (int)round((strtotime($endDayStr) - $inTs) / 60));
        $pdo->prepare("UPDATE `work_sessions` SET `check_out_time` = ?, `work_duration` = ?, `status` = 'COMPLETED' WHERE `session_id` = ?")
            ->execute([$endDayStr, $dur, $sr['session_id']]);
        $pdo->prepare("UPDATE `visits` SET `check_out_time` = ?, `status` = 'COMPLETED', `duration` = GREATEST(1, TIMESTAMPDIFF(MINUTE, `check_in_time`, ?)) WHERE `session_id` = ? AND `status` = 'IN_PROGRESS'")
            ->execute([$endDayStr, $endDayStr, $sr['session_id']]);
    }

    // 3. Kiểm tra nhân viên đang trong ca làm việc hôm nay không (Bảo vệ quyền riêng tư ngoài giờ)
    $sessStmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE `sales_id` = ? AND `status` = 'WORKING' AND `date` = ? ORDER BY `check_in_time` DESC LIMIT 1");
    $sessStmt->execute([$salesId, $today]);
    $activeSession = $sessStmt->fetch();

    if (!$activeSession) {
        http_response_code(200);
        echo json_encode([
            'ok'       => true,
            'recorded' => 0,
            'reason'   => 'NO_ACTIVE_SHIFT'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $sessionId = $activeSession['session_id'];

    // Đọc cấu hình hệ thống
    $settings = [
        'GPS_ACCURACY_LIMIT'            => 80,
        'MOVING_SPEED_THRESHOLD'        => 1.2,
        'STATIONARY_DISTANCE_THRESHOLD' => 30,
        'DWELL_RADIUS'                  => 35,
        'DWELL_THRESHOLD_MINUTES'       => 5
    ];
    try {
        $sStmt = $pdo->query("SELECT `setting_key`, `setting_value` FROM `settings`");
        while ($r = $sStmt->fetch()) {
            if (is_numeric($r['setting_value'])) {
                $settings[$r['setting_key']] = $r['setting_value'] + 0;
            }
        }
    } catch (Exception $e) {}

    $accLimit  = (float)$settings['GPS_ACCURACY_LIMIT'];
    $speedThr  = (float)$settings['MOVING_SPEED_THRESHOLD'];
    $distThr   = (float)$settings['STATIONARY_DISTANCE_THRESHOLD'];
    $dwellRad  = max(25, (int)$settings['DWELL_RADIUS']);
    $dwellMins = max(2, (int)$settings['DWELL_THRESHOLD_MINUTES']);

    // Điểm GPS gần nhất trong ca để khử trùng lặp & tính vận tốc thực
    $lastStmt = $pdo->prepare("SELECT `timestamp`, `latitude`, `longitude`, `activity_status` FROM `gps_logs` WHERE `session_id` = ? ORDER BY `timestamp` DESC, `log_id` DESC LIMIT 1");
    $lastStmt->execute([$sessionId]);
    $prevLog = $lastStmt->fetch();

    $insGps = $pdo->prepare("INSERT INTO `gps_logs` (`gps_log_id`, `session_id`, `sales_id`, `timestamp`, `latitude`, `longitude`, `accuracy`, `speed`, `activity_status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

    $recordedCount = 0;
    $autoCheckinVisitId = null;

    foreach ($points as $ptWrap) {
        $d = $ptWrap['data'];
        $isNested = !empty($ptWrap['nested']);
        $coords = ($isNested && isset($d['coords']) && is_array($d['coords'])) ? $d['coords'] : $d;

        $lat = isset($coords['latitude']) ? (float)$coords['latitude'] : (isset($coords['lat']) ? (float)$coords['lat'] : 0.0);
        $lng = isset($coords['longitude']) ? (float)$coords['longitude'] : (isset($coords['lon']) ? (float)$coords['lon'] : (isset($coords['lng']) ? (float)$coords['lng'] : 0.0));
        if ($lat == 0.0 && $lng == 0.0) {
            continue;
        }
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            continue;
        }

        $acc = isset($coords['accuracy']) ? max(0.0, (float)$coords['accuracy']) : (isset($d['accuracy']) ? max(0.0, (float)$d['accuracy']) : 10.0);
        $rawSpeed = isset($coords['speed']) ? (float)$coords['speed'] : (isset($d['speed']) ? (float)$d['speed'] : 0.0);
        if ($rawSpeed < 0) {
            $rawSpeed = 0.0;
        }
        // Giao thức OsmAnd phẳng truyền speed theo knots (1 knot = 0.514444 m/s), còn JSON coords.speed là m/s
        $speedMs = $isNested ? $rawSpeed : ($rawSpeed * 0.514444);

        $tsStr = traccarParseTimestamp($d['timestamp'] ?? ($coords['timestamp'] ?? null));
        $tsUnix = strtotime($tsStr);

        // Chống ghi trùng nếu trình duyệt vừa bắn điểm cách đây < 35 giây ở cùng vị trí (< 15m)
        if ($prevLog) {
            $dt = abs($tsUnix - strtotime($prevLog['timestamp']));
            $distFromPrev = traccarCalcDistMeters((float)$prevLog['latitude'], (float)$prevLog['longitude'], $lat, $lng);
            if ($dt < 35 && $distFromPrev < 15) {
                continue;
            }
            if ($dt > 0 && $speedMs <= 0.1 && $distFromPrev >= 15) {
                $speedMs = round($distFromPrev / $dt, 2);
            }
        }

        // Phân loại trạng thái di chuyển
        if ($acc > $accLimit) {
            $status = 'LOW_ACCURACY';
        } else {
            $isMovingFlag = $d['is_moving'] ?? ($d['motion'] ?? null);
            if ($speedMs >= $speedThr) {
                $status = 'MOVING';
            } elseif ($isMovingFlag === true || $isMovingFlag === 'true' || $isMovingFlag === 1 || $isMovingFlag === '1') {
                $status = ($speedMs >= $speedThr * 0.5) ? 'MOVING' : 'STATIONARY';
            } elseif ($prevLog) {
                $distPrev = traccarCalcDistMeters((float)$prevLog['latitude'], (float)$prevLog['longitude'], $lat, $lng);
                $dtPrev = max(1, $tsUnix - strtotime($prevLog['timestamp']));
                $status = ($distPrev >= $distThr && ($distPrev / $dtPrev) >= ($speedThr * 0.7)) ? 'MOVING' : 'STATIONARY';
            } else {
                $status = 'STATIONARY';
            }
        }

        $gpsId = 'GPS-TRC-' . time() . '-' . mt_rand(100, 999);
        $insGps->execute([$gpsId, $sessionId, $salesId, $tsStr, $lat, $lng, round($acc, 2), round($speedMs, 2), $status]);
        $recordedCount++;

        // 4. Tự động Check-in ngầm (Background Dwell Time) nếu Sales dừng tại đại lý đủ thời gian khi đang khóa máy
        if ($status === 'STATIONARY' && $autoCheckinVisitId === null) {
            $openVStmt = $pdo->prepare("SELECT `visit_id` FROM `visits` WHERE `sales_id` = ? AND `status` = 'IN_PROGRESS' LIMIT 1");
            $openVStmt->execute([$salesId]);
            if (!$openVStmt->fetch()) {
                $custStmt = $pdo->prepare("SELECT `customer_id`, `latitude`, `longitude` FROM `customers` WHERE `status` = 'ACTIVE' AND (`assigned_sales_id` = ? OR `assigned_sales_id` = 'ALL') AND (`latitude` != 0 OR `longitude` != 0)");
                $custStmt->execute([$salesId]);
                foreach ($custStmt->fetchAll() as $cust) {
                    $distCust = traccarCalcDistMeters($lat, $lng, (float)$cust['latitude'], (float)$cust['longitude']);
                    if ($distCust <= $dwellRad) {
                        // Kiểm tra đã có điểm đứng gần đại lý này từ >= dwellMins phút trước trong cùng ca chưa
                        $dwellCutoff = date('Y-m-d H:i:s', $tsUnix - ($dwellMins * 60));
                        $earStmt = $pdo->prepare("SELECT `timestamp`, `latitude`, `longitude` FROM `gps_logs` WHERE `session_id` = ? AND `timestamp` <= ? AND `activity_status` = 'STATIONARY' ORDER BY `timestamp` DESC LIMIT 5");
                        $earStmt->execute([$sessionId, $dwellCutoff]);
                        $qualifiedArrival = null;
                        foreach ($earStmt->fetchAll() as $oldPt) {
                            if (traccarCalcDistMeters((float)$oldPt['latitude'], (float)$oldPt['longitude'], (float)$cust['latitude'], (float)$cust['longitude']) <= ($dwellRad + 15)) {
                                $qualifiedArrival = $oldPt['timestamp'];
                                break;
                            }
                        }
                        if ($qualifiedArrival !== null) {
                            // Tránh tự động check-in lặp lại nếu vừa mới hoàn tất chăm sóc đại lý này trong vòng 60 phút qua
                            $recentDone = $pdo->prepare("SELECT `visit_id` FROM `visits` WHERE `sales_id` = ? AND `customer_id` = ? AND `check_in_time` >= ? LIMIT 1");
                            $recentDone->execute([$salesId, $cust['customer_id'], date('Y-m-d H:i:s', $tsUnix - 3600)]);
                            if (!$recentDone->fetch()) {
                                $newVid = 'VIS-TRC-' . time() . '-' . mt_rand(100, 999);
                                $pdo->prepare("INSERT INTO `visits` (`visit_id`, `sales_id`, `customer_id`, `session_id`, `check_in_time`, `check_in_lat`, `check_in_lng`, `check_in_accuracy`, `distance_meters`, `is_within_geofence`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'IN_PROGRESS')")
                                    ->execute([$newVid, $salesId, $cust['customer_id'], $sessionId, $qualifiedArrival, $lat, $lng, round($acc, 2), $distCust]);
                                $autoCheckinVisitId = $newVid;
                            }
                        }
                        break;
                    }
                }
            }
        }

        $prevLog = [
            'timestamp'       => $tsStr,
            'latitude'        => $lat,
            'longitude'       => $lng,
            'activity_status' => $status
        ];
    }

    http_response_code(200);
    echo json_encode([
        'ok'                 => true,
        'recorded'           => $recordedCount,
        'sessionId'          => $sessionId,
        'autoCheckinVisitId' => $autoCheckinVisitId
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok'      => false,
        'message' => 'Internal server error'
    ], JSON_UNESCAPED_UNICODE);
}
