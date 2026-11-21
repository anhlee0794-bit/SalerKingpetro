<?php
/**
 * REST API CONTROLLER - SALERKINGPETRO
 * Xử lý dữ liệu MySQL nội bộ + Kích hoạt đồng bộ sang Google Sheets
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/sync.php';

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
$action = isset($params['action']) ? $params['action'] : '';

$pdo = getDbConnection();

try {
    switch ($action) {
        case 'login':
            $email = trim($params['email'] ?? '');
            $stmt = $pdo->prepare("SELECT * FROM `users` WHERE `email` = ? AND `status` = 'ACTIVE' LIMIT 1");
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            if ($user) {
                echo json_encode([
                    'success' => true,
                    'user' => [
                        'userId' => $user['user_id'],
                        'name' => $user['name'],
                        'email' => $user['email'],
                        'role' => $user['role'],
                        'phone' => $user['phone'],
                        'team' => $user['team']
                    ]
                ], JSON_UNESCAPED_UNICODE);
            } else {
                echo json_encode(['success' => false, 'message' => 'Email không tồn tại hoặc đã bị khóa.'], JSON_UNESCAPED_UNICODE);
            }
            break;

        case 'getUsers':
            $role = $params['role'] ?? null;
            if ($role) {
                $stmt = $pdo->prepare("SELECT `user_id` as userId, `name`, `email`, `role`, `phone`, `team` FROM `users` WHERE `role` = ? AND `status` = 'ACTIVE'");
                $stmt->execute([$role]);
            } else {
                $stmt = $pdo->query("SELECT `user_id` as userId, `name`, `email`, `role`, `phone`, `team` FROM `users` WHERE `status` = 'ACTIVE'");
            }
            echo json_encode(['success' => true, 'users' => $stmt->fetchAll()], JSON_UNESCAPED_UNICODE);
            break;

        case 'getSettings':
            $stmt = $pdo->query("SELECT `setting_key`, `setting_value` FROM `settings`");
            $settings = [];
            while ($row = $stmt->fetch()) {
                $settings[$row['setting_key']] = $row['setting_value'];
            }
            echo json_encode(['success' => true, 'settings' => $settings], JSON_UNESCAPED_UNICODE);
            break;

        case 'getActiveSession':
            $salesId = $params['salesId'] ?? '';
            $stmt = $pdo->prepare("SELECT * FROM `work_sessions` WHERE `sales_id` = ? AND `status` = 'WORKING' ORDER BY `check_in_time` DESC LIMIT 1");
            $stmt->execute([$salesId]);
            $session = $stmt->fetch();
            echo json_encode([
                'success' => true,
                'session' => $session ? [
                    'sessionId' => $session['session_id'],
                    'salesId' => $session['sales_id'],
                    'date' => $session['date'],
                    'checkInTime' => $session['check_in_time'],
                    'checkInLat' => (float)$session['check_in_lat'],
                    'checkInLng' => (float)$session['check_in_lng'],
                    'status' => $session['status']
                ] : null
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'startWork':
            $salesId = $params['salesId'] ?? '';
            $lat = (float)($params['lat'] ?? 0);
            $lng = (float)($params['lng'] ?? 0);
            $acc = (float)($params['accuracy'] ?? 0);
            $today = date('Y-m-d');
            $now = date('Y-m-d H:i:s');
            $sessionId = 'SES-' . time() . '-' . rand(100, 999);

            // Kiểm tra xem đã có phiên đang mở chưa
            $checkStmt = $pdo->prepare("SELECT `session_id` FROM `work_sessions` WHERE `sales_id` = ? AND `status` = 'WORKING'");
            $checkStmt->execute([$salesId]);
            if ($checkStmt->fetch()) {
                echo json_encode(['success' => false, 'message' => 'Bạn đang có một ca làm việc đang mở. Vui lòng kết thúc ca trước.'], JSON_UNESCAPED_UNICODE);
                break;
            }

            $stmt = $pdo->prepare("INSERT INTO `work_sessions` (`session_id`, `sales_id`, `date`, `check_in_time`, `check_in_lat`, `check_in_lng`, `check_in_accuracy`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, 'WORKING')");
            $stmt->execute([$sessionId, $salesId, $today, $now, $lat, $lng, $acc]);

            // Đồng bộ sang Google Sheets ngầm
            syncToGoogleSheetsAsync('startWork', [
                'salesId' => $salesId,
                'lat' => $lat,
                'lng' => $lng,
                'accuracy' => $acc,
                'sessionId' => $sessionId
            ]);

            echo json_encode(['success' => true, 'sessionId' => $sessionId, 'checkInTime' => $now], JSON_UNESCAPED_UNICODE);
            break;

        case 'endWork':
            $sessionId = $params['sessionId'] ?? '';
            $salesId = $params['salesId'] ?? '';
            $lat = (float)($params['lat'] ?? 0);
            $lng = (float)($params['lng'] ?? 0);
            $now = date('Y-m-d H:i:s');

            $getStmt = $pdo->prepare("SELECT `check_in_time` FROM `work_sessions` WHERE `session_id` = ?");
            $getStmt->execute([$sessionId]);
            $sess = $getStmt->fetch();
            $duration = 0;
            if ($sess) {
                $duration = max(0, round((strtotime($now) - strtotime($sess['check_in_time'])) / 60));
            }

            $stmt = $pdo->prepare("UPDATE `work_sessions` SET `check_out_time` = ?, `check_out_lat` = ?, `check_out_lng` = ?, `work_duration` = ?, `status` = 'COMPLETED' WHERE `session_id` = ?");
            $stmt->execute([$now, $lat, $lng, $duration, $sessionId]);

            // Đồng bộ sang Google Sheets
            syncToGoogleSheetsAsync('endWork', [
                'sessionId' => $sessionId,
                'salesId' => $salesId,
                'lat' => $lat,
                'lng' => $lng
            ]);

            echo json_encode(['success' => true, 'workDuration' => $duration], JSON_UNESCAPED_UNICODE);
            break;

        case 'recordGps':
            $sessionId = $params['sessionId'] ?? '';
            $salesId = $params['salesId'] ?? '';
            $lat = (float)($params['lat'] ?? 0);
            $lng = (float)($params['lng'] ?? 0);
            $acc = (float)($params['accuracy'] ?? 0);
            $speed = (float)($params['speed'] ?? 0);
            $status = $params['forcedStatus'] ?? 'MOVING';
            $now = date('Y-m-d H:i:s');

            $stmt = $pdo->prepare("INSERT INTO `gps_logs` (`session_id`, `sales_id`, `timestamp`, `latitude`, `longitude`, `accuracy`, `speed`, `activity_status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$sessionId, $salesId, $now, $lat, $lng, $acc, $speed, $status]);

            echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
            break;

        case 'getCustomers':
            $salesId = $params['salesId'] ?? null;
            $role = $params['role'] ?? 'SALES';

            if ($role === 'MANAGER' || $role === 'ADMIN' || empty($salesId)) {
                $stmt = $pdo->query("SELECT * FROM `customers` WHERE `status` = 'ACTIVE' ORDER BY `customer_name` ASC");
            } else {
                $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `status` = 'ACTIVE' AND (`assigned_sales_id` = ? OR `assigned_sales_id` = 'ALL') ORDER BY `customer_name` ASC");
                $stmt->execute([$salesId]);
            }
            $customers = $stmt->fetchAll();

            $nowTs = time();
            $formatted = [];
            foreach ($customers as $c) {
                // Tính toán trạng thái chu kỳ chăm sóc
                $careStatus = 'ON_TRACK';
                if (!empty($c['next_care_date'])) {
                    $nextTs = strtotime($c['next_care_date']);
                    $diffDays = ($nextTs - $nowTs) / 86400;
                    if ($diffDays < 0) {
                        $careStatus = 'OVERDUE';
                    } elseif ($diffDays <= 1) {
                        $careStatus = 'DUE_SOON';
                    }
                }

                $formatted[] = [
                    'CustomerID' => $c['customer_id'],
                    'CustomerName' => $c['customer_name'],
                    'ContactName' => $c['contact_name'],
                    'Phone' => $c['phone'],
                    'Address' => $c['address'],
                    'Latitude' => (float)$c['latitude'],
                    'Longitude' => (float)$c['longitude'],
                    'AssignedSalesID' => $c['assigned_sales_id'],
                    'CustomerType' => $c['customer_type'],
                    'CareCycleDays' => (int)$c['care_cycle_days'],
                    'LastCareDate' => $c['last_care_date'],
                    'NextCareDate' => $c['next_care_date'],
                    'CurrentDebt' => (float)$c['current_debt'],
                    'CurrentStock' => (int)$c['current_stock'],
                    'StockUnit' => $c['stock_unit'],
                    'CareStatus' => $careStatus,
                    'Note' => $c['note']
                ];
            }
            echo json_encode(['success' => true, 'customers' => $formatted], JSON_UNESCAPED_UNICODE);
            break;

        case 'checkinVisit':
            $salesId = $params['salesId'] ?? '';
            $customerId = $params['customerId'] ?? '';
            $sessionId = $params['sessionId'] ?? '';
            $lat = (float)($params['lat'] ?? 0);
            $lng = (float)($params['lng'] ?? 0);
            $acc = (float)($params['accuracy'] ?? 0);
            $visitId = 'VIS-' . time() . '-' . rand(100, 999);
            $now = date('Y-m-d H:i:s');

            $stmt = $pdo->prepare("INSERT INTO `visits` (`visit_id`, `sales_id`, `customer_id`, `session_id`, `check_in_time`, `check_in_lat`, `check_in_lng`, `check_in_accuracy`, `status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS')");
            $stmt->execute([$visitId, $salesId, $customerId, $sessionId, $now, $lat, $lng, $acc]);

            // Đồng bộ sang Google Sheets
            syncToGoogleSheetsAsync('checkinVisit', [
                'visitId' => $visitId,
                'salesId' => $salesId,
                'customerId' => $customerId,
                'sessionId' => $sessionId,
                'lat' => $lat,
                'lng' => $lng,
                'accuracy' => $acc
            ]);

            echo json_encode(['success' => true, 'visitId' => $visitId, 'checkInTime' => $now], JSON_UNESCAPED_UNICODE);
            break;

        case 'checkoutCareVisit':
            $visitId = $params['visitId'] ?? '';
            $salesId = $params['salesId'] ?? '';
            $now = date('Y-m-d H:i:s');

            $getStmt = $pdo->prepare("SELECT `check_in_time`, `customer_id` FROM `visits` WHERE `visit_id` = ?");
            $getStmt->execute([$visitId]);
            $visit = $getStmt->fetch();
            $duration = 0;
            $customerId = '';
            if ($visit) {
                $duration = max(1, round((strtotime($now) - strtotime($visit['check_in_time'])) / 60));
                $customerId = $visit['customer_id'];
            }

            $stmt = $pdo->prepare("UPDATE `visits` SET 
                `check_out_time` = ?, `duration` = ?, `status` = 'COMPLETED',
                `distributed_qty` = ?, `inventory_qty` = ?, `reorder_demand` = ?,
                `recorded_debt` = ?, `debt_limit` = ?, `payment_status` = ?,
                `new_order_qty` = ?, `expected_next_order` = ?, `consumption_rate` = ?,
                `discussion_details` = ?, `customer_issues` = ?, `next_care_needs` = ?,
                `selected_product` = ?, `distributed_unit` = ?, `inventory_unit` = ?, `reorder_unit` = ?, `new_order_unit` = ?
                WHERE `visit_id` = ?");

            $stmt->execute([
                $now, $duration,
                (int)($params['distributedQty'] ?? 0),
                (int)($params['inventoryQty'] ?? 0),
                (int)($params['reorderDemand'] ?? 0),
                (float)($params['recordedDebt'] ?? 0),
                (float)($params['debtLimit'] ?? 0),
                $params['paymentStatus'] ?? '',
                (int)($params['newOrderQty'] ?? 0),
                $params['expectedNextOrder'] ?? '',
                $params['consumptionRate'] ?? '',
                $params['discussionDetails'] ?? '',
                $params['customerIssues'] ?? '',
                $params['nextCareNeeds'] ?? '',
                $params['selectedProduct'] ?? '',
                $params['distributedUnit'] ?? 'Thùng',
                $params['inventoryUnit'] ?? 'Thùng',
                $params['reorderUnit'] ?? 'Thùng',
                $params['newOrderUnit'] ?? 'Thùng',
                $visitId
            ]);

            // Cập nhật lại ngày chăm sóc tiếp theo cho khách hàng trong bảng customers
            if ($customerId) {
                $cStmt = $pdo->prepare("SELECT `care_cycle_days` FROM `customers` WHERE `customer_id` = ?");
                $cStmt->execute([$customerId]);
                $cRow = $cStmt->fetch();
                $cycleDays = $cRow ? (int)$cRow['care_cycle_days'] : 7;
                $nextCare = date('Y-m-d H:i:s', strtotime("+{$cycleDays} days"));

                $upCust = $pdo->prepare("UPDATE `customers` SET `last_care_date` = ?, `next_care_date` = ?, `current_stock` = ?, `current_debt` = ? WHERE `customer_id` = ?");
                $upCust->execute([
                    $now, $nextCare,
                    (int)($params['inventoryQty'] ?? 0),
                    (float)($params['recordedDebt'] ?? 0),
                    $customerId
                ]);
            }

            // Đồng bộ sang Google Sheets
            syncToGoogleSheetsAsync('checkoutCareVisit', array_merge($params, [
                'visitId' => $visitId,
                'duration' => $duration
            ]));

            echo json_encode(['success' => true, 'duration' => $duration], JSON_UNESCAPED_UNICODE);
            break;

        case 'getManagerDashboard':
            $today = date('Y-m-d');
            $activeSess = $pdo->query("SELECT COUNT(*) FROM `work_sessions` WHERE `date` = '{$today}' AND `status` = 'WORKING'")->fetchColumn();
            $completedVisits = $pdo->query("SELECT COUNT(*) FROM `visits` WHERE DATE(`check_in_time`) = '{$today}' AND `status` = 'COMPLETED'")->fetchColumn();
            $totalSales = $pdo->query("SELECT COUNT(*) FROM `users` WHERE `role` = 'SALES' AND `status` = 'ACTIVE'")->fetchColumn();

            echo json_encode([
                'success' => true,
                'data' => [
                    'activeSessions' => (int)$activeSess,
                    'completedVisits' => (int)$completedVisits,
                    'totalSales' => (int)$totalSales
                ]
            ], JSON_UNESCAPED_UNICODE);
            break;

        // --- CÁC ENDPOINT MỚI TỪ BẢN CẬP NHẬT (APPROVAL FLOW & SẢN PHẨM) ---
        case 'requestCustomerUpdate':
            $reqId = 'REQ-' . time() . '-' . rand(100, 999);
            $customerId = $params['customerId'] ?? '';
            $customerName = $params['customerName'] ?? '';
            $salesId = $params['salesId'] ?? '';
            $salesName = $params['salesName'] ?? '';
            $oldData = is_string($params['oldData']) ? $params['oldData'] : json_encode($params['oldData'] ?? [], JSON_UNESCAPED_UNICODE);
            $newData = is_string($params['newData']) ? $params['newData'] : json_encode($params['newData'] ?? [], JSON_UNESCAPED_UNICODE);
            $reason = $params['reason'] ?? '';

            $stmt = $pdo->prepare("INSERT INTO `customer_update_requests` (`request_id`, `customer_id`, `customer_name`, `sales_id`, `sales_name`, `old_data`, `new_data`, `reason`, `status`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())");
            $stmt->execute([$reqId, $customerId, $customerName, $salesId, $salesName, $oldData, $newData, $reason]);

            echo json_encode(['success' => true, 'requestId' => $reqId], JSON_UNESCAPED_UNICODE);
            break;

        case 'getCustomerUpdateRequests':
            $status = $params['status'] ?? null;
            if ($status && $status !== 'ALL') {
                $stmt = $pdo->prepare("SELECT * FROM `customer_update_requests` WHERE `status` = ? ORDER BY `created_at` DESC");
                $stmt->execute([$status]);
            } else {
                $stmt = $pdo->query("SELECT * FROM `customer_update_requests` ORDER BY `created_at` DESC");
            }
            $rows = $stmt->fetchAll();
            $result = [];
            foreach ($rows as $r) {
                $result[] = [
                    'RequestID' => $r['request_id'],
                    'CustomerID' => $r['customer_id'],
                    'CustomerName' => $r['customer_name'],
                    'SalesID' => $r['sales_id'],
                    'SalesName' => $r['sales_name'],
                    'OldData' => json_decode($r['old_data'], true) ?: $r['old_data'],
                    'NewData' => json_decode($r['new_data'], true) ?: $r['new_data'],
                    'Reason' => $r['reason'],
                    'Status' => $r['status'],
                    'CreatedAt' => $r['created_at'],
                    'ResolvedAt' => $r['resolved_at'],
                    'ApproverName' => $r['approver_name'],
                    'RejectReason' => $r['reject_reason']
                ];
            }
            echo json_encode(['success' => true, 'requests' => $result], JSON_UNESCAPED_UNICODE);
            break;

        case 'resolveCustomerUpdateRequest':
            $reqId = $params['requestId'] ?? '';
            $isApproved = !empty($params['isApproved']);
            $rejectReason = $params['rejectReason'] ?? null;
            $approverName = $params['approverName'] ?? 'Quản lý';
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

            // Nếu được duyệt, cập nhật vào bảng customers
            if ($isApproved) {
                $newData = json_decode($req['new_data'], true) ?: [];
                $fields = [];
                $values = [];
                if (isset($newData['contactName'])) { $fields[] = "`contact_name` = ?"; $values[] = $newData['contactName']; }
                if (isset($newData['phone'])) { $fields[] = "`phone` = ?"; $values[] = $newData['phone']; }
                if (isset($newData['address'])) { $fields[] = "`address` = ?"; $values[] = $newData['address']; }
                if (isset($newData['customerType'])) { $fields[] = "`customer_type` = ?"; $values[] = $newData['customerType']; }

                if (!empty($fields)) {
                    $values[] = $req['customer_id'];
                    $sql = "UPDATE `customers` SET " . implode(', ', $fields) . " WHERE `customer_id` = ?";
                    $upStmt = $pdo->prepare($sql);
                    $upStmt->execute($values);
                }
            }

            echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
            break;

        case 'getProducts':
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
                    'id' => $p['id'],
                    'name' => $p['name'],
                    'category' => $p['category'],
                    'defaultUnit' => $p['default_unit'],
                    'ratio' => (int)$p['ratio'],
                    'baseUnit' => $p['base_unit'],
                    'price' => (float)$p['price'],
                    'status' => $p['status'],
                    'spec' => $p['spec']
                ];
            }
            echo json_encode(['success' => true, 'products' => $products], JSON_UNESCAPED_UNICODE);
            break;

        case 'saveProduct':
            $pData = $params['productData'] ?? $params;
            $pId = !empty($pData['id']) ? $pData['id'] : ('PRD-' . str_pad(rand(10, 999), 3, '0', STR_PAD_LEFT));
            $name = $pData['name'] ?? '';
            $category = $pData['category'] ?? 'Khác';
            $defaultUnit = $pData['defaultUnit'] ?? 'Thùng';
            $ratio = (int)($pData['ratio'] ?? 1);
            $baseUnit = $pData['baseUnit'] ?? 'Chai';
            $price = (float)($pData['price'] ?? 0);
            $status = $pData['status'] ?? 'ACTIVE';
            $spec = $pData['spec'] ?? '';

            $chk = $pdo->prepare("SELECT `id` FROM `products` WHERE `id` = ?");
            $chk->execute([$pId]);
            if ($chk->fetch()) {
                $stmt = $pdo->prepare("UPDATE `products` SET `name` = ?, `category` = ?, `default_unit` = ?, `ratio` = ?, `base_unit` = ?, `price` = ?, `status` = ?, `spec` = ? WHERE `id` = ?");
                $stmt->execute([$name, $category, $defaultUnit, $ratio, $baseUnit, $price, $status, $spec, $pId]);
            } else {
                $stmt = $pdo->prepare("INSERT INTO `products` (`id`, `name`, `category`, `default_unit`, `ratio`, `base_unit`, `price`, `status`, `spec`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$pId, $name, $category, $defaultUnit, $ratio, $baseUnit, $price, $status, $spec]);
            }

            echo json_encode(['success' => true, 'productId' => $pId], JSON_UNESCAPED_UNICODE);
            break;

        case 'toggleProductStatus':
            $pId = $params['productId'] ?? '';
            $chk = $pdo->prepare("SELECT `status` FROM `products` WHERE `id` = ?");
            $chk->execute([$pId]);
            $curr = $chk->fetch();
            if ($curr) {
                $newSt = ($curr['status'] === 'ACTIVE') ? 'INACTIVE' : 'ACTIVE';
                $up = $pdo->prepare("UPDATE `products` SET `status` = ? WHERE `id` = ?");
                $up->execute([$newSt, $pId]);
                echo json_encode(['success' => true, 'newStatus' => $newSt], JSON_UNESCAPED_UNICODE);
            } else {
                echo json_encode(['success' => false, 'message' => 'Sản phẩm không tồn tại.'], JSON_UNESCAPED_UNICODE);
            }
            break;

        default:
            echo json_encode(['success' => false, 'message' => 'Action không hợp lệ: ' . $action], JSON_UNESCAPED_UNICODE);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Lỗi xử lý API: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
