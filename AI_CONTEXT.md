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
- **CUSTOMER_UPDATE_REQUESTS**: `RequestID`, `CustomerID`, `CustomerName`, `SalesID`, `SalesName`, `OldData` (JSON), `NewData` (JSON), `Reason`, `Status` (PENDING/APPROVED/REJECTED), `RejectReason`, `ApprovedBy`, `ApprovedByName`, `ApprovedAt`, `CreatedAt`
- **PRODUCTS**: `ProductID`, `ProductName`, `CategoryID`, `CategoryName`, `Unit`, `Packaging`, `BasePrice`, `Status` (ACTIVE/INACTIVE), `UpdatedAt`
- **PRODUCT_CATEGORIES**: `CategoryID`, `CategoryName`, `Description`, `SortOrder`
- **SETTINGS**: Key-Value (`GPS_INTERVAL=5`, `CUSTOMER_RADIUS=200`, `CARE_CYCLE_VIP=3`, `CARE_CYCLE_NORMAL=7`, `CARE_CYCLE_SMALL=14`, `OVERDUE_WARNING_DAYS=1`, `PROXIMITY_ALERT_RADIUS=100`)
- **LOGS**: `LogID`, `Timestamp`, `Level`, `Source`, `Message`, `Payload`

## 3. Trạng thái hiện tại
- Đã nâng cấp toàn diện Hệ thống Quản Lý Chăm Sóc Khách Hàng (Customer Care & Retention Engine).
- Tự động tính toán chu kỳ chăm sóc, phát hiện cảnh báo quá hạn đỏ/cam/xanh, thu thập 4 khối dữ liệu khi ghé thăm và quản lý tồn kho/công nợ.
- Đã hoàn thiện Hệ thống Phân Quyền Theo Vai Trò (RBAC): Ma trận quyền hạn độc lập (`frontend/js/permissions.js`), quản lý phiên Auth bền vững qua `localStorage`, phân quyền tab và nút bấm (UI Guard), chặn thao tác nhạy cảm (Action Guard) và Tab Quản lý nhân sự & Phân bổ tuyến cho ADMIN.
- **Tính năng mới nhất (Đợt cập nhật 2026-10-11)**:
  1. **Authentication Wall**: Chặn toàn bộ truy cập trái phép nếu chưa đăng nhập. Hiển thị Login Screen với email/password và 3 nhóm nút đăng nhập nhanh Demo theo vai trò (ADMIN, MANAGER, SALES). Hỗ trợ nút Đăng xuất (Logout) quay về Login Screen.
  2. **Approval Flow (Phê duyệt thay đổi khách hàng)**: Sales chỉ được "Yêu cầu cập nhật thông tin" (SĐT, người liên hệ, địa chỉ, loại khách) vào hàng chờ `CUSTOMER_UPDATE_REQUESTS` (`PENDING`). Manager và Admin có tab "Phê Duyệt Thay Đổi", xem diff Cũ vs Mới trước khi quyết định [Chấp Thuận] (ghi đè vào `CUSTOMERS`) hoặc [Từ Chối] (kèm lý do).
  3. **Product Management (Quản lý danh mục hàng hóa)**: Quản lý toàn bộ danh mục dầu nhờn Kingpetro qua tab "Quản Lý Hàng Hóa". Chỉ Manager/Admin có quyền thêm, sửa giá niêm yết, quy cách đóng gói và bật/tắt kinh doanh (`ACTIVE`/`INACTIVE`). Sales chỉ có quyền xem catalog đang mở bán.

