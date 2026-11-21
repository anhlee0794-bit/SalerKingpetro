<?php
/**
 * MODULE ĐỒNG BỘ DỮ LIỆU SANG GOOGLE SHEETS (SYNC SERVICE)
 * Gọi ngầm sang Google Apps Script Web App để ghi thêm 1 bản sao vào Google Sheet
 */

require_once __DIR__ . '/config.php';

function syncToGoogleSheetsAsync($action, $payload = []) {
    if (!defined('SYNC_TO_GOOGLE_SHEETS') || !SYNC_TO_GOOGLE_SHEETS) {
        return;
    }

    $gasUrl = defined('GOOGLE_APPS_SCRIPT_URL') ? GOOGLE_APPS_SCRIPT_URL : '';
    if (empty($gasUrl)) {
        return; // Chưa cấu hình GAS URL thì bỏ qua, dữ liệu vẫn an toàn trong MySQL
    }

    $data = array_merge(['action' => $action], $payload);
    $jsonData = json_encode($data, JSON_UNESCAPED_UNICODE);

    // Gửi request bằng cURL với timeout rất ngắn để không làm chậm trải nghiệm của Sales App
    $ch = curl_init($gasUrl);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "POST");
    curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true); // Google Apps Script thường redirect 302
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: text/plain;charset=utf-8',
        'Content-Length: ' . strlen($jsonData)
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3); // Timeout tối đa 3 giây tránh treo client
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);

    $response = curl_exec($ch);
    $error = curl_error($ch);
    curl_close($ch);

    // Ghi log vào MySQL để theo dõi trạng thái đồng bộ
    try {
        $pdo = getDbConnection();
        $stmt = $pdo->prepare("INSERT INTO `logs` (`level`, `source`, `message`, `payload`) VALUES (?, ?, ?, ?)");
        $statusMsg = $error ? "Lỗi đồng bộ Google Sheets: " . $error : "Đồng bộ thành công sang Google Sheets";
        $stmt->execute([
            $error ? 'WARNING' : 'INFO',
            'SYNC_GAS',
            $statusMsg . " (Action: {$action})",
            $jsonData
        ]);
    } catch (Exception $e) {
        // Bỏ qua lỗi log để tránh gián đoạn
    }
}
