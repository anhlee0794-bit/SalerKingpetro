# AI CONTEXT - SALES FIELD MANAGEMENT

## 1. Tổng quan Kiến trúc
Hệ thống gồm 2 thành phần chính:
1. **Backend (Google Apps Script - GAS)**:
   - Cơ sở dữ liệu: Google Sheets (8 sheets: `USERS`, `CUSTOMERS`, `WORK_SESSIONS`, `GPS_LOGS`, `VISITS`, `SCHEDULES`, `SETTINGS`, `LOGS`).
   - Web API / `doGet`, `doPost` / RPC `google.script.run`.
   - Security & Session validator, LockService, CacheService.
   - Module tính toán khoảng cách (Haversine Formula), thuật toán phân loại `MOVING` / `STATIONARY` / `UNKNOWN`.

2. **Frontend (SPA Web App)**:
   - **Sales Mobile UI**: Mobile-first, giao diện trực quan, 3 nút hành động chính (Bắt đầu làm, Gặp khách, Kết thúc làm), định kỳ lấy GPS theo interval (1/5/10/15 phút), kiểm tra bán kính check-in (mặc định 200m).
   - **Manager Desktop UI**: Dashboard Pastel/Clean, KPI thẻ thống kê, Live Sales Monitor, Bản đồ tương tác Leaflet / OpenStreetMap (Lộ trình di chuyển, vị trí hiện tại, điểm ghé thăm), Timeline chi tiết phiên làm việc, Báo cáo & Cảnh báo bất thường.

## 2. Cấu trúc Database (Google Sheets)
- **USERS**: `UserID`, `Name`, `Email`, `Role` (ADMIN/MANAGER/SALES), `Phone`, `Team`, `Status`, `CreatedAt`
- **CUSTOMERS**: `CustomerID`, `CustomerName`, `ContactName`, `Phone`, `Address`, `Latitude`, `Longitude`, `AssignedSalesID`, `Status`, `Note`, `CreatedAt`, `CustomerType` (VIP/NORMAL/SMALL), `CareCycleDays`, `LastCareDate`, `NextCareDate`, `CurrentDebt`, `CurrentStock`
- **WORK_SESSIONS**: `SessionID`, `SalesID`, `Date`, `CheckInTime`, `CheckInLatitude`, `CheckInLongitude`, `CheckInAccuracy`, `CheckOutTime`, `CheckOutLatitude`, `CheckOutLongitude`, `WorkDuration`, `Status` (WORKING/COMPLETED)
- **GPS_LOGS**: `GPSLogID`, `SessionID`, `SalesID`, `Timestamp`, `Latitude`, `Longitude`, `Accuracy`, `Speed`, `ActivityStatus` (MOVING/STATIONARY/UNKNOWN)
- **VISITS**: `VisitID`, `SalesID`, `CustomerID`, `SessionID`, `CheckInTime`, `CheckInLatitude`, `CheckInLongitude`, `CheckInAccuracy`, `CheckOutTime`, `Duration`, `Result`, `Note`, `Status` (IN_PROGRESS/COMPLETED), `DistributedQty`, `InventoryQty`, `ReorderDemand`, `RecordedDebt`, `DebtLimit`, `PaymentStatus`, `NewOrderQty`, `ExpectedNextOrder`, `ConsumptionRate`, `DiscussionDetails`, `CustomerIssues`, `NextCareNeeds`
- **SCHEDULES**: `ScheduleID`, `SalesID`, `CustomerID`, `Date`, `StartTime`, `EndTime`, `Note`, `Status`
- **SETTINGS**: Key-Value (`GPS_INTERVAL=5`, `CUSTOMER_RADIUS=200`, `CARE_CYCLE_VIP=3`, `CARE_CYCLE_NORMAL=7`, `CARE_CYCLE_SMALL=14`, `OVERDUE_WARNING_DAYS=1`, `PROXIMITY_ALERT_RADIUS=100`)
- **LOGS**: `LogID`, `Timestamp`, `Level`, `Source`, `Message`, `Payload`

## 3. Trạng thái hiện tại
- Đã nâng cấp toàn diện Hệ thống Quản Lý Chăm Sóc Khách Hàng (Customer Care & Retention Engine).
- Tự động tính toán chu kỳ chăm sóc, phát hiện cảnh báo quá hạn đỏ/cam/xanh, thu thập 4 khối dữ liệu khi ghé thăm và quản lý tồn kho/công nợ.
- Đã hoàn thiện Hệ thống Phân Quyền Theo Vai Trò (RBAC): Ma trận quyền hạn độc lập (`frontend/js/permissions.js`), quản lý phiên Auth bền vững qua `localStorage`, phân quyền tab và nút bấm (UI Guard), chặn thao tác nhạy cảm (Action Guard) và thêm Tab Quản lý nhân sự & Phân bổ tuyến cho ADMIN.

