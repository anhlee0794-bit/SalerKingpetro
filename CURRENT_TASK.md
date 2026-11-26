# CURRENT TASK - SALES FIELD & CUSTOMER CARE MANAGEMENT

## Gia Cố Ổn Định Production Toàn Diện: Đồng Bộ API MySQL, Hàng Đợi Offline 4G, PWA & Bảo Mật Máy Chủ (Hoàn Thành 2026-11-26)
- [x] **🔴 Ưu tiên 1 — Khớp 100% API Giao diện & MySQL (`backend-php/api.php`)**:
  - [x] Hoàn thiện `getManagerDashboard` trả đầy đủ `stats`, danh sách vị trí `sales` (`lastGps`) và `careAlerts` (Quá hạn, Sắp hạn, Công nợ cao, Tồn kho thấp).
  - [x] Bổ sung `getSalesTimeline` (Tab 3) và `getPerformanceReports` (Tab 7 hỗ trợ lọc Hôm nay / Tuần / Tháng / Toàn bộ).
  - [x] Sửa `checkoutCareVisit` đọc gói `careData` 4 khối (Hàng hóa, Tồn kho + Đơn vị tồn, Công nợ, Đơn hàng mới, Kết quả & Ghi chú), bổ sung `checkoutVisit` & `cancelVisit`, sửa `requestCustomerUpdate` & `resolveCustomerUpdateRequest`.
  - [x] Đồng nhất chữ Hoa/Thường `SessionID`/`VisitID` và khôi phục cả `activeVisit` đang gặp khách từ MySQL khi F5 tải lại trang.
- [x] **🟠 Ưu tiên 2 — Ổn định hiện trường sóng yếu & Tối ưu di động (`api.js`, `sales_app.js`, PWA)**:
  - [x] Tắt hoàn toàn cơ chế nhảy về dữ liệu mẫu giả (`MockDatabase`) khi chạy thật; tích hợp Hàng đợi Ngoại tuyến (`Offline Queue`) tự lưu vào máy khi mất sóng 4G và tự đồng bộ FIFO khi có mạng lại.
  - [x] Tích hợp PWA (`manifest.json`, `icon.svg`, `sw.js`, meta mobile) hỗ trợ cài đặt ra màn hình chính điện thoại (`Add to Home Screen`) như ứng dụng độc lập.
- [x] **🟡 Ưu tiên 3 — Bảo mật máy chủ & Vận hành dài hạn (`api.php`, `config.php`, `.htaccess`)**:
  - [x] Bắt buộc xác thực chữ ký JWT Token (`requireAuth`) và cô lập dữ liệu theo vai trò trên 100% API đọc/ghi.
  - [x] Tắt `SYNC_TO_GOOGLE_SHEETS = false` mặc định và thêm `.htaccess` chặn `403 Forbidden` truy cập trực tiếp `config.php`, `sync.php`, `schema.sql` và liệt kê thư mục `/api/`.
  - [x] Tích hợp cơ chế tự động dọn rác bảng `gps_logs` cũ quá 90 ngày (giữ nguyên vĩnh viễn lịch sử chăm sóc/đơn hàng trong `visits`), kèm nút dọn thủ công trong Tab Cài Đặt của Admin.
- [x] **Kiểm thử & Triển khai**: Pass **29/29** unit tests (`tests/test_logic.py`), kiểm tra cú pháp JS và đồng bộ nguyên tử FTP + kiểm thử E2E trực tiếp trên `https://hiepphucduc.vn/saler/`.


## Tích Hợp Free Geocoding & Mini-Map Picker Kéo Thả Ghim (Hoàn Thành 2026-11-26)
- [x] **1. Free Geocoding & Reverse Geocoding (`geo.js`)**: Tích hợp kép OpenStreetMap Nominatim + dự phòng Photon (0đ, không cần API Key) tìm tọa độ từ địa chỉ và lấy tên đường ngược từ vị trí ghim.
- [x] **2. Mini-Map Picker Tương Tác (`manager_app.js` & `sales_app.js`)**: Gắn bản đồ nhỏ kéo thả ghim (hỗ trợ cả lớp Đường phố & Ảnh vệ tinh) vào tất cả các form Thêm mới / Chỉnh sửa đại lý của Quản lý và Sales.
- [x] **3. Kiểm thử & Triển khai**: Pass 26/26 unit tests và đồng bộ nguyên tử FTP lên `hiepphucduc.vn`.


## Sửa Lỗi Bản Đồ Đòi API Key Trên Domain Thực Tế (Hoàn Thành 2026-11-26)
- [x] Thay thế tile layer CartoDB (bị dính watermark thương mại `API KEY REQUIRED` trên `hiepphucduc.vn`) bằng bộ 4 lớp bản đồ miễn phí 100% (Đường phố Việt Nam OSM, Giao diện Sáng HOT, Esri Street và Ảnh Vệ Tinh Esri Satellite) kèm nút chuyển lớp góc phải bản đồ.


## Hoàn Thiện Full CRUD Nhân Sự, Khách Hàng, Hàng Hóa & Cài Đặt Hệ Thống Trên MySQL (Hoàn Thành 2026-11-26)
- [x] **1. Quản trị Nhân sự toàn diện (`ADMIN`)**: Thêm mới, Sửa hồ sơ (Quản lý/Sales/Admin), Đặt lại mật khẩu Bcrypt, Khóa/Mở khóa, Xóa tài khoản và Phân tuyến khách hàng lưu thẳng xuống MySQL.
- [x] **2. Quản lý Khách hàng & Lịch sử (`ADMIN` / `MANAGER`)**: Hoàn thiện REST API PHP Thêm/Sửa/Xóa/Duyệt đại lý và xem lịch sử ghé thăm từ MySQL.
- [x] **3. Quản lý Danh mục Hàng hóa (`ADMIN` / `MANAGER`)**: Đồng bộ song ngữ dữ liệu sản phẩm MySQL, hỗ trợ tự gõ phân loại mới và xóa sản phẩm nhập nhầm.
- [x] **4. Trang Cài đặt Thông số Hệ thống (`ADMIN`)**: Giao diện chỉnh sửa trực tiếp 13 tham số GPS, Dwell Time và Chu kỳ chăm sóc khách hàng lưu vào bảng `settings`.
- [x] **5. Kiểm thử & Triển khai**: Pass 25/25 unit tests và đồng bộ trực tiếp lên hosting `hiepphucduc.vn`.


## Khóa Chặt Công Cụ Test & Chuyển Góc Nhìn Độc Quyền Cho ADMIN (Hoàn Thành 2026-11-26)
- [x] **1. Màn hình Login chuẩn Production**: Xóa cụm nút chọn nhanh Demo và gợi ý mật khẩu điền sẵn, bắt buộc đăng nhập bằng Email + Mật khẩu.
- [x] **2. Cô lập quyền Công cụ Test cho ADMIN (`isAdminSession`)**: Ẩn hoàn toàn thanh Dev Toolbar, nút Đổi vai trò và khóa cứng Mock GPS đối với `SALES` và `MANAGER`; giữ nguyên công cụ xem thử góc nhìn cho phiên gốc `ADMIN`.
- [x] **3. Kiểm thử & Triển khai**: Pass 24/24 unit tests và đồng bộ trực tiếp lên hosting `hiepphucduc.vn`.


## Bổ Sung JWT Auth Token Lưu Phiên Đăng Nhập 3 Ngày (Hoàn Thành 2026-11-26)
- [x] **1. Backend JWT Engine (`backend-php/config.php` & `api.php`)**: Sinh và xác thực JWT Token (HMAC-SHA256) thời hạn 3 ngày (`259,200s`), hỗ trợ endpoint `verifyToken` và làm mới Token khi `changePassword`.
- [x] **2. Frontend Session & Expiry Manager (`frontend/js/api.js` & `app.js`)**: Lưu trữ Token 3 ngày khi đăng nhập bằng mật khẩu, tự động kiểm tra hạn khi mở app / mở khóa màn hình (`visibilitychange`), hiển thị thời hạn còn lại trên Header.
- [x] **3. Kiểm thử & Triển khai**: Bổ sung unit test JWT 3 ngày (`24/24 PASS`) và đồng bộ trực tiếp lên server `hiepphucduc.vn`.


## Nâng Cấp Hệ Thống Xác Thực Mật Khẩu & Đổi Mật Khẩu (Hoàn Thành 2026-11-23)
- [x] **1. CSDL MySQL**: Thêm cột `password` mã hóa Bcrypt vào bảng `users`.
- [x] **2. Backend API**: Xử lý `login` kiểm tra mật khẩu bằng `password_verify()` và tự động hash nâng cấp tài khoản cũ; bổ sung endpoint `changePassword`.
- [x] **3. Frontend UI**: Cập nhật form đăng nhập gửi mật khẩu thực tế, thêm modal đổi mật khẩu và nút **🔑 Đổi mật khẩu** trên Header.
- [x] **4. Kiểm thử**: Chạy 23/23 tests PASS trong `tests/test_logic.py`.


## Triển Khai Thực Tế Lên Hosting cPanel & Tên Miền hiepphucduc.vn (Hoàn Thành 2026-11-21)
- [x] **1. Cấu hình DNS & Hosting**: Trỏ bản ghi A về IP `139.99.50.190`, thêm tên miền `hiepphucduc.vn` vào cPanel.
- [x] **2. Cài đặt SSL Bảo Mật**: Kích hoạt chứng chỉ AutoSSL xanh cho `hiepphucduc.vn` để hỗ trợ GPS di động.
- [x] **3. Cài đặt Web Chính WordPress**: Triển khai website giới thiệu công ty nhớt qua WP Toolkit tại `https://hiepphucduc.vn`.
- [x] **4. Khởi tạo Cơ Sở Dữ Liệu MySQL**: Tạo database `luatdoan_kingpetrosaler` và import thành công 11 bảng chuẩn hóa qua phpMyAdmin.
- [x] **5. Triển khai Ứng dụng Sales Field**: Đưa phân hệ `saler` lên `https://hiepphucduc.vn/saler/` và kết nối API `https://hiepphucduc.vn/saler/api/api.php` hoạt động 100%.

## Kế Hoạch Kiểm Thử Toàn Diện Hệ Thống Thực Tế
- [ ] **Kịch bản 1: Kiểm thử Tài khoản Sales (Tác nghiệp ca & GPS)**
- [ ] **Kịch bản 2: Kiểm thử Chăm sóc Khách hàng 4 khối & Đơn vị tính (Quy đổi Thùng/Xô/Chai/Phuy)**
- [ ] **Kịch bản 3: Kiểm thử Đề xuất sửa đổi thông tin khách hàng (Approval Flow)**
- [ ] **Kịch bản 4: Kiểm thử Quản lý & Giám sát (Dashboard, Bản đồ lộ trình OSRM, Timeline)**
- [ ] **Kịch bản 5: Kiểm thử Phê duyệt đề xuất & Quản lý danh mục hàng hóa (Manager)**
- [ ] **Kịch bản 6: Kiểm thử Phân tuyến & Nhân sự (Admin)**


## Nâng Cấp Authentication Wall, Approval Flow & Product Management (2026-10-11)
- [x] **1. Bắt Buộc Đăng Nhập Khi Truy Cập (Authentication Wall)**:
  - [x] Chặn toàn bộ xem Dashboard/dữ liệu nếu chưa đăng nhập; hiển thị Login Screen (`#auth-wall-container`) che phủ hoàn toàn.
  - [x] Cung cấp Form đăng nhập bằng Email/Password tiêu chuẩn.
  - [x] Cung cấp 3 cụm nút chọn nhanh tài khoản Demo theo vai trò (ADMIN, MANAGER, SALES).
  - [x] Lưu trạng thái phiên vào `localStorage`, hiển thị đúng tên & vai trò ở Header và điều hướng về workspace tương ứng.
  - [x] Bổ sung nút Đăng Xuất (Logout) ở Header để xóa session và quay về Login Screen ngay lập tức.
- [x] **2. Quy Trình Cập Nhật Thông Tin Khách Hàng (Approval Flow cho Sales)**:
  - [x] Thêm nút "Đề xuất sửa" trên thẻ khách hàng của Sales (`frontend/js/sales_app.js`).
  - [x] Sales gửi yêu cầu (SĐT, Người liên hệ, Địa chỉ, Loại khách hàng, Lý do) vào hàng chờ `CUSTOMER_UPDATE_REQUESTS` với trạng thái `PENDING` (không ghi đè trực tiếp DB).
  - [x] Bổ sung Tab "Phê Duyệt Thay Đổi" (`approvals`) cho MANAGER và ADMIN (`frontend/js/manager_app.js`).
  - [x] Hiển thị bộ lọc trạng thái (Tất cả, Chờ duyệt, Đã duyệt, Đã từ chối).
  - [x] Trực quan hóa so sánh Cũ vs Mới (Diff Viewer với cột đỏ nhạt / xanh nhạt) làm nổi bật các trường có thay đổi.
  - [x] Manager có 2 lựa chọn: [Chấp Thuận] (ghi đè chính thức vào hồ sơ khách hàng `CUSTOMERS`) hoặc [Từ Chối] (yêu cầu nhập lý do từ chối).
- [x] **3. Quản Lý Danh Mục Hàng Hóa Dành Cho Manager (Product Management)**:
  - [x] Bổ sung Tab "Quản Lý Hàng Hóa" (`products`) trong Manager Desktop Workspace (`frontend/js/manager_app.js`).
  - [x] Chỉ tài khoản MANAGER và ADMIN mới có quyền truy cập, thêm mới, sửa đơn giá/quy cách/phân loại hoặc toggle Bật/Tắt kinh doanh (`ACTIVE`/`INACTIVE`).
  - [x] Tài khoản SALES chỉ có quyền xem danh mục sản phẩm đang mở bán (`ACTIVE`) để lên đơn hoặc báo cáo tồn kho (`frontend/js/products.js`), hoàn toàn bị chặn sửa đổi.
  - [x] Hiển thị các thẻ KPI thống kê tổng hàng hóa, hàng đang bán, tạm ngừng, và bộ lọc phân loại/tìm kiếm.
- [x] **4. Cập Nhật State/Database & Kiểm Thử Logic**:
  - [x] Bổ sung các bảng dữ liệu `CUSTOMER_UPDATE_REQUESTS`, `PRODUCTS`, `PRODUCT_CATEGORIES` trong `MockDatabase` và migration tự động.
  - [x] Mở rộng ma trận phân quyền `frontend/js/permissions.js` với các hành động `REQUEST_CUSTOMER_UPDATE`, `APPROVE_CUSTOMER_UPDATE`, `MANAGE_PRODUCTS`, `VIEW_PRODUCTS`.
  - [x] Viết thêm 4 test cases cho Approval Flow và Product Management trong `tests/test_logic.py` (Pass 22/22 unit tests).
- [x] **5. Tuân Thủ AGENTS Directive & Skill Workflow-Logger**:
  - [x] Cập nhật tài liệu kiến trúc `AI_CONTEXT.md`, tiến độ `CURRENT_TASK.md` và nhật ký chi tiết `CHANGELOG_AI.md`.

## Phân Quyền Tài Khoản Theo Vai Trò (RBAC) & Quản Lý Phiên Đăng Nhập
- [x] Tạo module cấu hình phân quyền riêng biệt: `frontend/js/permissions.js` với ma trận vai trò (ADMIN, MANAGER, SALES).
- [x] Quản lý phiên đăng nhập bền vững (Auth State qua `localStorage`) và xây dựng Modal Đăng Nhập (Login Modal) + Modal Chuyển Vai Trò (Role Switcher Modal).
- [x] UI Permission Guard: Ẩn/Hiện các nút nhạy cảm (Cấu hình GAS, Reset Data) chỉ dành riêng cho ADMIN; bảo vệ tab và nút chức năng.
- [x] Thêm Tab "Quản Lý Nhân Sự & Tuyến Bán" riêng cho ADMIN trong Manager Workspace (thêm nhân sự, gán tuyến cho Sales).
- [x] Route/Action Guard: Chặn các thao tác gọi hàm ngoài thẩm quyền (`openSettingsDialog`, `resetMockData`, `approveCustomer`).
- [x] Bổ sung 4 unit tests kiểm thử logic RBAC trong `tests/test_logic.py` (Pass 18/18).

## Thiết Lập Skill & Quy Trình Lưu Vết Hoạt Động Cho Nhóm (Workflow Logger)
- [x] Tạo Skill chuẩn Workspace Customization: `.agents/skills/workflow-logger/SKILL.md`.
- [x] Tạo Template ghi nhận chi tiết: `.agents/skills/workflow-logger/references/changelog-template.md`.
- [x] Thiết lập Rule bắt buộc cho mọi AI agent trong repo: `AGENTS.md`.
- [x] Cập nhật lịch sử thay đổi `CHANGELOG_AI.md` và kiểm tra toàn bộ liên kết.

## Sửa Lỗi Icon Dấu Hỏi Chấm (`?`) Trên Các Nút Bấm Thao Tác Sales
- [x] **Xác định nguyên nhân gốc rễ**: `Icons.render` trong `frontend/js/icons.js` mặc định fallback về `help-circle` (`?`) khi tên icon không có trong bảng định nghĩa `Icons.definitions`. Các icon `edit-3`, `edit`, `x-circle`, `plus-circle`, `boxes`, `info` bị thiếu khai báo.
- [x] **Bổ sung đầy đủ định nghĩa Lucide Icons chuẩn**:
  - `file-edit`, `edit`, `edit-2`, `edit-3`, `pen`: Icon cây bút/tờ giấy chỉnh sửa tiêu chuẩn.
  - `x-circle`, `log-out`: Icon đóng/rời điểm bán rõ ràng.
  - `plus-circle`: Icon thêm mới tròn.
  - `boxes`: Icon khối kiện hàng cho tồn kho.
  - `info`: Icon thông tin chỉ dẫn.
- [x] **Cập nhật mã nguồn giao diện Sales (`frontend/js/sales_app.js`)**:
  - Nút **"CẬP NHẬT NỘI DUNG"**: Render chuẩn icon `file-edit` (hình tờ giấy và cây bút chỉnh sửa trực quan).
  - Nút **"Bỏ qua / Rời điểm này"**: Render chuẩn icon `x-circle` (vòng tròn đóng/hủy).
  - Nút **"Ghi nhận / Cập nhật"** & **"Ghi nhận"**: Render chuẩn icon `edit` (cây bút chỉnh sửa).
  - Tiêu đề modal chăm sóc: Render chuẩn icon `file-edit`.
- [x] Quét toàn bộ mã nguồn: Đảm bảo 100% icon (47/47 icon được gọi) đều có định nghĩa hợp lệ, triệt tiêu hoàn toàn lỗi fallback dấu hỏi chấm.

## Đa Dạng Hóa Đơn Vị Tính Sản Phẩm & Form Ghi Nhận / Cập Nhật Sales
- [x] **Cấu trúc Dữ liệu & Danh mục Sản phẩm (`frontend/js/products.js`)**:
  - Bổ sung danh mục đơn vị tính linh hoạt: **Thùng, Xô, Chai, Bình, Phuy**.
  - Định nghĩa tỷ lệ quy đổi chuẩn hóa (Base: `Chai` = 1, `Bình` = 4 Chai, `Xô` = 18 Chai, `Thùng` = 24 Chai, `Phuy` = 200 Chai).
  - Tích hợp hàm `ProductService.calculateConversion(qty, fromUnit)` tính lượng Chai cơ sở và số Thùng tương đương.
- [x] **Giao diện Form Cập Nhật / Đặt Hàng (Modal) của Sales (`frontend/js/sales_app.js`)**:
  - Thêm bộ chọn sản phẩm danh mục ("Sản phẩm ghi nhận") tự động gợi ý đơn vị tính mặc định.
  - Tích hợp trường chọn **Đơn vị tính** (Dropdown: Thùng, Xô, Chai, Bình, Phuy) đi kèm với ô nhập số lượng cho từng khối: Hàng phân phối thêm, Tồn kho thực tế kiểm đếm, Đặt hàng mới.
  - Hiển thị nhãn quy đổi trực quan theo thời gian thực bên dưới ô nhập số lượng (VD: `≈ 48 Chai (Base) | 2 Thùng`).
  - Thiết kế co giãn linh hoạt (responsive) tối ưu trên cả desktop lẫn thiết bị di động mà không vỡ dòng.
- [x] **Đồng Bộ Hóa & Hiển Thị Manager (`frontend/js/manager_app.js` & `frontend/js/api.js` & `backend/Code.js`)**:
  - Lưu trữ chi tiết đơn vị tính (`DistributedUnit`, `InventoryUnit`, `ReorderUnit`, `NewOrderUnit`) và sản phẩm (`SelectedProduct`) vào lịch sử chăm sóc (`VISITS`).
  - Cập nhật tồn kho khách hàng đi kèm đơn vị tính (`CurrentStock` + `StockUnit`) trong danh sách khách hàng, modal chi tiết và form thêm/sửa khách hàng.
  - Bổ sung 6 tests chuyển đổi đơn vị và kiểm thử đạt 100% (14/14 tests PASS).

## Loại Bỏ Ràng Buộc Khoảng Cách Cho Sales & Tối Ưu Tác Nghiệp Tức Thì
- [x] Gỡ bỏ hoàn toàn điều kiện chặn khoảng cách geofence ($> 50$m hay $> 200$m) khi Sales check-in hoặc cập nhật chăm sóc.
- [x] Tọa độ và khoảng cách vẫn được lưu ngầm vào hệ thống (`DistanceToCustomer`, `IsWithinGeofence`) để phục vụ kiểm tra/đối soát của Manager.
- [x] Nút **"Ghi nhận / Cập nhật"** mở ngay Modal nhập liệu chăm sóc 4 khối (Hàng hóa, Công nợ, Doanh số, Ý kiến trao đổi) cho bất kỳ khách hàng nào được chọn từ bất kỳ đâu.
- [x] Nút **"+ Thêm Điểm Mới"** mở ngay Modal tạo khách hàng mới tức thì mà không bị trễ bởi tiến trình chờ lấy GPS của trình duyệt.
- [x] Kết nối `onclick` cho phép bấm trực tiếp vào thẻ khách hàng trên toàn bộ các view để cập nhật nhanh.
- [x] Kiểm thử tự động `tests/test_logic.py` toàn diện (14/14 PASS).

## Mục tiêu trước đó
Nâng cấp Hệ thống Quản Lý Chăm Sóc Khách Hàng (Mục tiêu: KHÔNG ĐỂ SALES BỎ QUÊN KHÁCH HÀNG CŨ):
- [x] Phase 1: Mở rộng Database schema & Migration an toàn (`CUSTOMERS` & `VISITS` 4 Blocks).
- [x] Phase 2: Bổ sung Chu kỳ chăm sóc (`CareCycleDays`, `CustomerType`: VIP/NORMAL/SMALL), tính `NextCareDate`.
- [x] Phase 3: Thêm/Sửa khách hàng + GPS + Chống trùng & Cảnh báo khách gần (< 100m).
- [x] Phase 4: Chức năng "CHĂM SÓC KHÁCH HÀNG" (Check-in GPS -> Đo khoảng cách -> Mở form chăm sóc).
- [x] Phase 5: Cập nhật 4 khối thông tin: Hàng Hóa (Phân phối/Tồn kho), Công Nợ, Kinh Doanh (Đơn mới), Ý kiến chăm sóc.
- [x] Phase 6: Lịch sử chăm sóc dạng Timeline vĩnh viễn (không ghi đè dữ liệu).
- [x] Phase 7: Cảnh báo tự động khách hàng quá hạn (🔴 QUÁ HẠN, 🟠 SẮP ĐẾN HẠN, 🟢 ĐÚNG HẠN, ⚪ CHƯA CHĂM SÓC).
- [x] Phase 8: Dashboard Manager mở rộng (KPI tổng quan, KPI theo Sales, Thống kê Tồn kho & Công nợ).
- [x] Phase 9: Nâng cấp Mobile Sales View (`[ KHÁCH CẦN CHĂM SÓC ]`, `[ KHÁCH QUÁ HẠN 🔴 ]`).
- [x] Phase 10: Chạy kiểm thử tự động toàn diện (`tests/test_logic.py` - Pass 100%).

## Sửa lỗi Map & Đổi đơn vị khoảng cách sang KM
- [x] Phân tích nguyên nhân lỗi 403 Forbidden từ OpenStreetMap tile server.
- [x] Chuyển đổi tile provider sang CartoDB Voyager/Positron không cần API key, tải bản đồ nền mượt mà.
- [x] Tạo hàm `formatDistanceKm(meters)` dùng chung tại `frontend/js/geo.js` & `backend/Code.js`.
- [x] Thay thế toàn bộ hiển thị khoảng cách sang định dạng KM (2 chữ số thập phân) trên giao diện Sales, Manager, Popups, Check-in, Bán kính, Cảnh báo.
- [x] Giữ nguyên 100% logic tính toán khoảng cách nội bộ, GPS tracking, Haversine và các chức năng Dashboard.
- [x] Thêm unit test `test_format_distance_km` và chạy test suite thành công (7/7 PASS).

## Nâng Cấp Hệ Thống Đạt Độ Hoàn Thiện 100%
- [x] Chuẩn hóa & Nâng cấp Core Logic: Bổ sung Geofencing check-in validation ($\le 50\text{ m}$ / $0.05\text{ km}$), duy trì và tối ưu Haversine, Activity classification, chống trùng khách hàng, chu kỳ chăm sóc.
- [x] Bản Đồ & Tuyến Đường: Tích hợp OSRM Road-snapping Routing bám sát mạng lưới đường giao thông thực tế, loại bỏ hoàn toàn đường thẳng chim bay và watermark.
- [x] Chi Tiết & Timeline: Lọc chuẩn xác khung giờ làm việc thực tế (07:00 đến 18:00) và loại bỏ các điểm nhiễu GPS sai số cao (> 80m).
- [x] Tab Báo Cáo & Thống Kê (Tab 5): Lập trình hoàn chỉnh màn hình KPI tổng hợp (Doanh số, Đơn mới, Điểm bán đã ghé, Thời gian thị trường), bảng đánh giá hiệu suất nhân sự chi tiết với Route Completion Rate % và xuất file CSV.
- [x] Kiểm thử toàn diện: Unit tests đạt 100% PASS (8/8 tests).

## Phân Quyền Hiển Thị Giao Diện Theo Quyền Tài Khoản Demo
- [x] Gán class `restricted-admin-tool` cho nhóm nút công cụ quản trị (Cấu Hình GAS, Test Di Chuyển, Reset Data).
- [x] Tự động ẩn toàn bộ công cụ quản trị khi chọn tài khoản quyền `SALES`.
- [x] Tự động hiển thị công cụ quản trị khi chọn quyền `MANAGER` hoặc `ADMIN`.
- [x] Hiệu ứng chuyển đổi mượt mà, không phá vỡ bố cục giao diện Header.

## Chuẩn Hóa Toàn Bộ Hệ Thống Icon Giao Diện (Lucide Icons)
- [x] **Thống nhất bộ Icon chuẩn Lucide**:
  - Tích hợp thư viện Lucide Icons CDN và module `frontend/js/icons.js` với chuẩn thiết kế `stroke-width: 2px`, outline tinh tế, bo góc mềm mại.
  - Hỗ trợ rendering SVG trực tiếp đồng bộ không phụ thuộc network/offline.
- [x] **Đồng bộ hóa Icon trên các thành phần**:
  - **Thanh Navigation chính (Tabs)**: 5 tab (Tổng Quan `layout-dashboard`, Bản Đồ `map`, Timeline `clock`, Khách Hàng `users`, Báo Cáo `bar-chart-3`) kèm icon 18x18px thẳng hàng với text.
  - **Thẻ Thống Kê (Metric Cards)**: Cấu trúc `.kpi-card-header` và `.kpi-icon-box` bo tròn với hiệu ứng soft background / glassmorphism nhẹ, màu sắc phân loại theo chủ đề (Xanh dương, Đỏ, Cam, Xanh lá, Tím).
  - **Nút bấm (Action Buttons)**: Bổ sung icon chuẩn cho các nút thao tác (`plus` cho Thêm, `eye` cho Xem chi tiết, `pencil` cho Sửa, `check` cho Duyệt, `download` cho Xuất CSV, `crosshair` cho Lấy GPS).
  - **Status Pills**: Chuẩn hóa badge chu kỳ chăm sóc (`alert-circle` cho Quá hạn, `clock` cho Sắp hạn, `check-circle` cho Đúng hạn).
- [x] **Loại bỏ triệt để emoji**:
  - Loại bỏ hoàn toàn emoji rời rạc (`📊`, `🗺️`, `⏱️`, `🏢`, `📑`, `📍`, `👤`, `⚙️`, `⚡`, `🔄`, `🔴`, `🟠`, `🟢`, `⚪`, `💰`, `📦`, `🏆`, `👁️`, `✏️`, `✓`, v.v.) khỏi toàn bộ giao diện HTML, JS và CSS.

## Tích Hợp Tính Năng Mock GPS (Giả Lập Tọa Độ GPS)
- [x] **Cơ chế Mock GPS trong `GeoService` (`frontend/js/geo.js`)**:
  - Thêm trạng thái `isMockGpsEnabled`, `mockPosition`, `mockLocationName`.
  - Hàm `enableMockGps(target)`: Ghi đè `navigator.geolocation.getCurrentPosition` và `navigator.geolocation.watchPosition` trả về tọa độ giả lập với độ chính xác cao (`accuracy: 10m`).
  - Hàm `disableMockGps()`: Khôi phục lại các hàm định vị nguyên bản của trình duyệt.
  - Cập nhật `GeoService.getCurrentPosition()`: Tự động trả về vị trí mock ngay lập tức nếu đang bật chế độ mock.
- [x] **Tích hợp nút "Test Di Chuyển" (`frontend/js/app.js` -> `App.simulateMovement()`)**:
  - Tự động phát hiện hoặc gán tọa độ điểm bán cụ thể: **Đại lý Tạp Hóa Minh Phát** (`10.7685, 106.6892`).
  - Kích hoạt Mock GPS độ chính xác cao `accuracy: 10m` phục vụ mô phỏng đứng trước cửa hàng để check-in hoặc test khoảng cách.
  - Tự động ghi nhận log GPS vào phiên làm việc nếu Sales đang hoạt động.
  - Làm mới giao diện tức thì (Sales App & Manager App).
- [x] **Phản hồi giao diện người dùng (UI Toast Feedback)**:
  - Hiển thị Toast thông báo thành công: `Đã kích hoạt GPS giả lập tại Đại lý Minh Phát (10.7685, 106.6892)`.
  - Bổ sung nút bấm "Test Di Chuyển" tiện lợi trực tiếp trong modal Chọn Khách Hàng Gặp của Sales.

## Trạng thái
- Hệ thống Sales Field Management đã tích hợp hoàn chỉnh tính năng Mock GPS cho nút "Test Di Chuyển".
- Unit tests: 8/8 tests PASS (100%).
- Server đang hoạt động tại `http://localhost:3000/`.
