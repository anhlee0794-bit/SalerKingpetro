# CHANGELOG AI - SALES FIELD & CUSTOMER CARE MANAGEMENT

## [2026-10-11] - Authentication Wall, Approval Flow Khách Hàng & Quản Lý Danh Mục Hàng Hóa Cho Manager
- **Mục đích / Bối cảnh**: Nâng cấp hệ thống "SALES FIELD" theo yêu cầu nghiệp vụ chuyên sâu:
  1. Bắt buộc đăng nhập khi truy cập (Authentication Wall), chặn toàn bộ truy cập trái phép.
  2. Quy trình phê duyệt thay đổi thông tin khách hàng (Approval Flow): Sales chỉ gửi đề xuất vào hàng chờ; Manager/Admin kiểm tra so sánh Cũ vs Mới trước khi quyết định Chấp thuận (ghi đè) hoặc Từ chối.
  3. Quản lý danh mục hàng hóa (Product Management): Manager/Admin toàn quyền thêm/sửa/đổi trạng thái kinh doanh dầu nhờn Kingpetro; Sales chỉ được xem catalog để bán hàng.
- **Các file tạo mới / thay đổi (Affected Files)**:
  - `frontend/js/permissions.js`: Mở rộng ma trận quyền hạn với `MANAGE_PRODUCTS`, `VIEW_PRODUCTS`, `REQUEST_CUSTOMER_UPDATE`, `APPROVE_CUSTOMER_UPDATE`, và cấp quyền truy cập các tab `approvals`, `products`.
  - `frontend/css/style.css`: Thêm kiểu dáng hiện đại cho Authentication Wall (`.auth-wall-screen`, `.auth-card`, `.auth-brand-badge`, `.demo-account-btn`), và bộ so sánh diff (`.diff-container`, `.diff-column`, `.diff-old`, `.diff-new`).
  - `frontend/index.html`: Thêm container toàn màn hình `#auth-wall-container` và nút Đăng Xuất (Logout) trực quan trên Header.
  - `frontend/js/api.js`:
    - Thêm các API wrappers: `requestCustomerUpdate`, `getCustomerUpdateRequests`, `resolveCustomerUpdateRequest`, `getProducts`, `saveProduct`, `toggleProductStatus`.
    - Mở rộng `MockDatabase`: Thêm bảng `CUSTOMER_UPDATE_REQUESTS`, `PRODUCTS`, `PRODUCT_CATEGORIES`, cơ chế tự động migration dữ liệu cũ và các handlers tương ứng.
  - `frontend/js/products.js`: Chuyển đổi hàm `getCatalog()` sang lấy dữ liệu động từ database, hàm `renderProductOptions()` chỉ hiển thị các mặt hàng đang `ACTIVE`.
  - `frontend/js/sales_app.js`: Thêm nút "Đề xuất sửa" trên thẻ khách hàng, modal `showRequestCustomerUpdateModal` cho phép nhập SĐT, người liên hệ, địa chỉ, loại khách, lý do; gửi vào bảng chờ duyệt.
  - `frontend/js/manager_app.js`:
    - Tab "Phê Duyệt Thay Đổi" (`renderApprovalsTab`): Hiển thị danh sách yêu cầu với bộ lọc trạng thái, Diff Viewer so sánh 2 cột Cũ vs Mới, 2 nút [Chấp Thuận] (`handleApproveRequest`) và [Từ Chối] (`promptRejectRequest` / `handleRejectRequest`).
    - Tab "Quản Lý Hàng Hóa" (`renderProductsTab`): Các thẻ KPI thống kê mặt hàng, ô tìm kiếm, lọc theo ngành hàng, bảng sản phẩm với badge trạng thái; Modal thêm/sửa sản phẩm (`showAddProductModal`, `showEditProductModal`, `saveProductForm`) và nút bật/tắt kinh doanh (`toggleProductStatus`).
  - `frontend/js/app.js`:
    - `init()`: Kiểm tra session `localStorage`. Nếu chưa đăng nhập, kích hoạt `renderAuthWall()` và ẩn hoàn toàn header, switcher, workspace.
    - `renderAuthWall()`: Giao diện màn hình đăng nhập với Form Email/Password và 3 nhóm nút chọn nhanh Demo (ADMIN, MANAGER, SALES).
    - `showAuthenticatedApp()`: Hiển thị lại toàn bộ ứng dụng sau khi đăng nhập thành công.
    - `logout()`: Xóa token `localStorage`, reset user và quay lại màn hình Auth Wall ngay lập tức.
  - `tests/test_logic.py`: Bổ sung 4 unit tests kiểm thử Approval Flow (chấp thuận ghi đè DB, từ chối giữ nguyên DB, chặn Sales tự duyệt) và Product Management (Manager thêm/sửa/toggle status, chặn Sales sửa danh mục). Chạy 22/22 unit tests thành công (PASS).
  - `AI_CONTEXT.md` & `CURRENT_TASK.md`: Cập nhật schema dữ liệu mới và đánh dấu hoàn thành toàn bộ checklist.
- **Chi tiết kỹ thuật**:
  - `CustomerApprovalService` (Simulator & Frontend): Request ID sinh theo timestamp `REQ-YYYYMMDDHHMMSS`. Khi Manager bấm Chấp thuận, API `resolveCustomerUpdateRequest` tự động lấy các trường trong `NewData` ghi đè trực tiếp vào bản ghi khách hàng tương ứng trong `CUSTOMERS`.
  - Chống crash LocalStorage: Hàm `MockDatabase.getDB()` tự động inject dữ liệu mặc định của `CUSTOMER_UPDATE_REQUESTS` và `PRODUCTS` nếu người dùng đang dùng phiên lưu cũ trong trình duyệt.
- **Kết quả kiểm thử & xác minh**:
  - Chạy `python tests/test_logic.py`: 22/22 tests PASS (100%).
  - Kiểm tra Auth Wall: Ẩn hoàn toàn dữ liệu ứng dụng khi chưa có session đăng nhập, chuyển đổi mượt mà giữa các vai trò ADMIN, MANAGER, SALES và đăng xuất an toàn.

## [2026-10-11] - Phân Quyền Tài Khoản Theo Vai Trò (RBAC), Quản Lý Phiên Đăng Nhập & Phân Bổ Tuyến
- **Mục đích / Bối cảnh**: Triển khai hệ thống phân quyền chặt chẽ Role-Based Access Control (RBAC) cho 3 vai trò: ADMIN (Toàn quyền quản trị & nhân sự), MANAGER (Giám sát đội ngũ, bản đồ, timeline, báo cáo), SALES (Tác nghiệp đi tuyến cá nhân, chỉ xem khách hàng và timeline của mình).
- **Các file tạo mới / thay đổi (Affected Files)**:
  - `frontend/js/permissions.js`: Module cấu hình RBAC độc lập định nghĩa ma trận quyền hạn (`PERMISSIONS`, `TAB_PERMISSIONS`), metadata vai trò và các helper guards (`guard`, `filterCustomers`, `canAccessTab`).
  - `frontend/js/app.js`: Quản lý Auth State bền vững (`localStorage` qua `AUTH_STORAGE_KEY`), giao diện thanh chọn vai trò trực quan, Modal chuyển vai trò (Role Switcher Modal), Modal Đăng Nhập (Login Modal 1-click & Form Email/Password), Action Guard cho các thao tác nhạy cảm (Cấu hình GAS, Reset Data).
  - `frontend/js/manager_app.js`: Tab navigation động theo quyền, bổ sung Tab 6 "Quản Lý Nhân Sự & Tuyến Bán" riêng cho ADMIN (thêm nhân sự mới, gán/chuyển đổi tuyến khách hàng), Action Guard cho nút Duyệt khách hàng (`handleApproveCustomer`).
  - `frontend/js/api.js`: Bổ sung tài khoản mẫu `USR-000` (ADMIN) vào `USERS` seed data của `MockDatabase`.
  - `frontend/index.html`: Nhúng `js/permissions.js`, nâng cấp header account badge hiển thị tên, đội nhóm, badge vai trò và nút "Đổi vai trò" tương tác.
  - `tests/test_logic.py`: Bổ sung 4 unit tests kiểm thử quyền hạn RBAC và cô lập dữ liệu khách hàng theo từng vai trò (18/18 tests PASS).
- **Chi tiết kỹ thuật**:
  - `PermissionService.guard(user, permission, message)`: Chặn các thao tác gọi hàm trái phép với thông báo lỗi thân thiện.
  - Phân vùng dữ liệu: Sales Rep chỉ xem khách hàng được gán cho mình (`filterCustomers`), Manager và Admin xem toàn tuyến.
  - Tab "Quản Lý Nhân Sự & Tuyến" cho ADMIN: Hiển thị thống kê tổng nhân sự, số lượng điểm bán đã phân tuyến/chưa phân tuyến, và modal phân bổ tuyến bán hàng (`showReassignRouteModal`).
- **Kết quả kiểm thử & xác minh**:
  - `python tests/test_logic.py`: 18/18 tests PASS.
  - Giao diện phản hồi chuẩn xác khi chuyển đổi giữa ADMIN, MANAGER, SALES.

## [2026-10-11] - Tích Hợp Skill Lưu Quy Trình Làm Việc (Workflow Logger) & Đồng Bộ Nhóm
- **Mục đích / Bối cảnh**: Thiết lập quy chuẩn bắt buộc lưu vết mọi hoạt động/thay đổi vào các file Markdown dự án, đảm bảo bất kỳ thành viên nào trong nhóm khi sử dụng AI đều có thể tự động đọc và kế thừa bối cảnh lịch sử mà không làm đứt gãy quy trình.
- **Các file tạo mới / thay đổi (Affected Files)**:
  - `.agents/skills/workflow-logger/SKILL.md`: Định nghĩa kỹ năng Workspace Skill chuẩn của Antigravity với hướng dẫn 3 giai đoạn (Đọc bối cảnh -> Thực thi an toàn -> Bắt buộc lưu vết vào file MD).
  - `.agents/skills/workflow-logger/references/changelog-template.md`: Mẫu template chuẩn để AI ghi nhận lịch sử vào `CHANGELOG_AI.md`.
  - `AGENTS.md`: File quy tắc Workspace Rules tự động kích hoạt cho mọi AI khi truy cập dự án.
  - `CHANGELOG_AI.md`: Bổ sung ghi nhận lịch sử thay đổi phiên hiện tại.
  - `CURRENT_TASK.md`: Bổ sung trạng thái hoàn thành đầu việc thiết lập skill lưu quy trình.
- **Chi tiết kỹ thuật**:
  - Tích hợp chuẩn Progressive Disclosure của Antigravity: Skill được đặt trong `.agents/skills/` để tự động chia sẻ qua Git cho toàn bộ nhóm.
  - Ràng buộc 4 file Markdown trọng tâm: `AI_RULES.md`, `AI_CONTEXT.md`, `CURRENT_TASK.md`, `CHANGELOG_AI.md`.
- **Kết quả kiểm thử & xác minh**:
  - Cấu trúc skill hợp lệ theo định dạng YAML Frontmatter chuẩn.
  - Các file rule `AGENTS.md` được đặt ở thư mục gốc để mọi công cụ AI (Antigravity, Cursor, Copilot, Claude) đều tự động nhận diện.

## [2026-09-19] - Loại Bỏ Ràng Buộc Khoảng Cách Cho Sales & Tác Nghiệp Tức Thì
- **Loại bỏ ràng buộc khoảng cách geofence đối với Sales**:
  - Gỡ bỏ điều kiện chặn check-in (`if distance > radius return outOfRadius`) trong `frontend/js/api.js` và `backend/Code.js`.
  - Khoảng cách thực tế giữa Sales và khách hàng vẫn được tính toán và lưu ngầm vào trường `DistanceToCustomer` và `IsWithinGeofence` để Manager giám sát, đối chiếu tuyến đường mà không làm cản trở Sales nhập dữ liệu.
- **Tác nghiệp tức thì khi bấm "Ghi nhận / Cập nhật"**:
  - Cho phép Sales cập nhật nội dung chăm sóc cho bất kỳ cửa hàng nào trên tuyến từ bất kỳ đâu.
  - Hàm `SalesApp.openCareForCustomer(customerId)` tự động khởi tạo/chuyển đổi phiên thăm ngầm và mở ngay Modal "Cập Nhật Nội Dung Chăm Sóc" mà không gặp lỗi khoảng cách hay hộp thoại xác nhận cản trở.
  - Hàm `SalesApp.showCareCheckoutModal(targetCustomerId)` nhận diện chính xác khách hàng được chọn, tự động bảo vệ không bị crash nếu chưa có active visit.
- **Modal "+ Thêm Điểm Mới" mở tức thì**:
  - `SalesApp.showCreateProspectModal()` loại bỏ việc chờ lệnh GPS bất đồng bộ, mở Modal ngay lập tức và tự động cập nhật tọa độ tham chiếu nền.
- **Tương tác trực tiếp trên tất cả các danh sách**:
  - Bổ sung hành động gọi `SalesApp.openCareForCustomer` ngay khi bấm vào thẻ cửa hàng trong toàn bộ tuyến đường hoặc danh sách khách cần chăm sóc.

## [2026-09-19] - Dwell Time Engine & Auto-Checkin Ngầm (Passive Geofence Check-in)
- **`GeoService.dwellTracker` — Engine Auto-Checkin Ngầm (`frontend/js/geo.js`)**:
  - Bổ sung object `dwellTracker` với các thuộc tính: `active`, `customers`, `radiusMeters` (mặc định 30m), `thresholdMs` (mặc định 5 phút), `currentTarget`, `suppressedIds`.
  - Hàm `GeoService.startDwellTracking(customers, options, onDwellComplete, onDwellEntered, onDwellExited)`: Khởi động engine theo dõi thụ động. Nhận 3 callbacks: vào geofence, rời geofence, đạt ngưỡng tự động check-in.
  - Hàm `GeoService.stopDwellTracking()`: Dừng engine và xóa trạng thái tạm.
  - Hàm `GeoService.updateDwell(coords, activity)`: Gọi tự động trong `processLocation()` mỗi khi có GPS update. Thuật toán:
    1. **MOVING** → xóa target hiện tại (đang di chuyển đi).
    2. Tìm khách hàng gần nhất trong bán kính ≤30m.
    3. Vào geofence mới → fire `onDwellEntered`.
    4. Ở trong geofence ≥5 phút → fire `onDwellComplete` (auto-checkin!).
    5. Rời khỏi geofence trước ngưỡng → fire `onDwellExited`.
    6. Mỗi CustomerID chỉ auto-check-in 1 lần/ca (suppressedIds).
- **Tích hợp vào `SalesApp` (`frontend/js/sales_app.js`)**:
  - `SalesApp.startDwellTracking()`: Kích hoạt cùng lúc với `startGpsTracking()`, dùng `DWELL_RADIUS` và `DWELL_THRESHOLD_MINUTES` từ settings.
  - **onDwellComplete callback**: Tự động gọi `ApiService.checkinVisit()` ngầm → toast "Tự động ghi nhận chăm sóc" → render giao diện "ĐANG CHĂM SÓC KHÁCH".
  - **onDwellEntered callback**: Hiển thị toast thông báo "Bạn vừa vào khu vực X. Ở lại 5 phút để tự động ghi nhận" + cập nhật `#dwell-indicator` badge.
  - **onDwellExited callback**: Ẩn `#dwell-indicator` badge.
  - `SalesApp.showDwellIndicator(customer, thresholdMinutes)`: Render badge inline "Đang ở tại X — Tự động ghi nhận sau 5 phút".
  - `SalesApp.hideDwellIndicator()`: Ẩn badge.
  - `handleEndWork()` gọi `GeoService.stopDwellTracking()` + `hideDwellIndicator()` khi kết thúc ca.
- **UI: Nút "Test Di Chuyển" ngay trên màn hình Sales (Working State)**:
  - Thêm nút `btn-test-gps` màu Indigo với icon `zap` ngay trên màn hình làm việc của Sales.
  - Nối `onclick` → `App.simulateMovement()` để Sales có thể test check-in và Dwell ngay tại bàn mà không cần chuyển sang Manager view.
- **Settings mới** (`DWELL_RADIUS: 30`, `DWELL_THRESHOLD_MINUTES: 5`) thêm vào `MockDatabase.initDefaultDB()` và fallback settings trong `SalesApp.init()`.

## [2026-09-19] - Mock GPS Simulation for "Test Di Chuyển" & Geofenced Check-in
- **Cơ chế Mock GPS toàn diện trong `GeoService` (`frontend/js/geo.js`)**:
  - Bổ sung các thuộc tính trạng thái: `isMockGpsEnabled`, `mockPosition`, `mockLocationName`.
  - Hàm `enableMockGps(target)`: Sao lưu hàm định vị gốc (`window._nativeGeolocation`), ghi đè trực tiếp `navigator.geolocation.getCurrentPosition` và `navigator.geolocation.watchPosition` để trả về tọa độ mô phỏng với độ chính xác cao (`accuracy: 10m`).
  - Hàm `disableMockGps()`: Hoàn trả và khôi phục định vị thực tế của trình duyệt.
  - Cập nhật `GeoService.getCurrentPosition()`: Tự động trả về vị trí mock ngay lập tức mà không gặp lỗi timeout hoặc chặn quyền GPS từ trình duyệt.
- **Tích hợp nút "Test Di Chuyển" (`frontend/js/app.js` -> `App.simulateMovement()`)**:
  - Thiết lập tọa độ trùng khớp với điểm bán: **Đại lý Tạp Hóa Minh Phát** (`10.7685, 106.6892`).
  - Tự động ghi nhận log GPS vào ca làm việc của Sales nếu đang trong phiên `WORKING`.
  - Tự động cập nhật tức thì giao diện Sales App và Manager App (bản đồ, timeline, dashboard).
  - Bổ sung nút bấm "Test Di Chuyển" trực tiếp trong modal Chọn Khách Hàng Gặp để Sales test nhanh khoảng cách và check-in mà không cần chuyển màn hình.
- **Phản hồi giao diện người dùng**:
  - Hiển thị Toast thông báo: `Đã kích hoạt GPS giả lập tại Đại lý Minh Phát (10.7685, 106.6892)`.
  - Huy hiệu trạng thái Sales tự động chuyển sang `ĐỨNG YÊN (MOCK GPS)` với `Sai số: ~10m (GPS giả lập)`.
  - Danh sách khách hàng lập tức nhận diện khoảng cách đến Đại lý Minh Phát là `0.00 km` và hiển thị badge `Hợp lệ (0.00 km)`, cho phép bấm "CHECK-IN TẠI ĐÂY" thành công 100%.

## [2026-09-19] - Complete Lucide Icons Standardization & UI/UX Cohesion
- **Tích hợp & Chuẩn hóa Hệ Thống Icon (Lucide Icons)**:
  - Tạo mới module `frontend/js/icons.js` tích hợp bộ SVG Lucide Icons chuẩn (`stroke-width: 2px`, outline tinh tế, bo góc mềm mại) hỗ trợ render tức thì không độ trễ.
  - Tích hợp CDN Lucide Icons trong `frontend/index.html`.
- **Đồng bộ hóa Icon trên các thành phần UI**:
  - **Thanh Navigation chính (Tabs)**: Bổ sung icon chuẩn kích thước 18x18px cho tất cả 5 tab:
    - `layout-dashboard` cho *Tổng Quan Dashboard*
    - `map` cho *Bản Đồ & Tuyến Đường*
    - `clock` cho *Chi Tiết & Timeline*
    - `users` cho *Khách Hàng*
    - `bar-chart-3` cho *Báo Cáo & Thống Kê*
  - **Thẻ Thống Kê (Metric Cards)**:
    - Bổ sung cấu trúc `.kpi-card-header` và `.kpi-icon-box` bo tròn (10px), hiệu ứng soft background / glassmorphism nhẹ (`backdrop-filter: blur(8px)`).
    - Màu sắc icon & hộp nền phân loại theo chủ đề: Blue (Đội ngũ / Điểm bán), Rose (Cảnh báo quá hạn), Amber (Sắp đến hạn / Công nợ), Green (Tổng khách / Đơn hàng), Purple (Thời gian / GPS).
  - **Nút bấm Hành động (Action Buttons)**:
    - Thêm class `.btn-action-inline` và `.btn-add-primary` có icon đi kèm: `plus` (Thêm khách hàng), `eye` (Xem chi tiết), `pencil` (Sửa), `check` (Duyệt), `download` (Xuất CSV), `crosshair` (Lấy GPS), `refresh-cw` (Làm mới).
  - **Status Pills**:
    - Thay thế emoji chấm tròn bằng `.status-pill-icon` kèm icon Lucide: `alert-circle` (Quá hạn), `clock` (Sắp đến hạn), `check-circle` (Đúng hạn), `help-circle` (Chưa ghé).
- **Loại bỏ triệt để Emoji**:
  - Quét và loại bỏ 100% emoji rời rạc (`📊`, `🗺️`, `⏱️`, `🏢`, `📑`, `📍`, `👤`, `⚙️`, `⚡`, `🔄`, `🔴`, `🟠`, `🟢`, `⚪`, `💰`, `📦`, `🏆`, `👁️`, `✏️`, `✓`, v.v.) khỏi toàn bộ giao diện HTML, JS và CSS.

## [2026-09-19] - Role-based UI Access Control for Demo Account Switcher
- **Phân quyền hiển thị công cụ quản trị cấp cao**:
  - Gán class định danh `restricted-admin-tool` cho nhóm nút công cụ quản trị (Cấu Hình Google Apps Script, Test Di Chuyển, Reset Data).
  - Cập nhật logic `applyUserRole()`:
    - Khi chọn tài khoản **SALES** (Nguyễn Văn A, Trần Thị B...): Ẩn hoàn toàn nhóm công cụ quản trị (`display: none`), chỉ hiển thị thanh tác nghiệp cơ bản của nhân viên thị trường.
    - Khi chọn tài khoản **MANAGER** hoặc **ADMIN**: Hiển thị đầy đủ nhóm công cụ quản trị (`display: flex`).
  - Thêm hiệu ứng chuyển đổi mượt mà trong CSS (`.restricted-admin-tool`).

## [2026-09-19] - 100% System Completion & Production Milestone
- **Core Logic & Geofencing Validation ($\le 50\text{ m}$)**:
  - Chuẩn hóa bán kính Check-in nghiêm ngặt tại điểm bán $\le 50\text{ m}$ (`0.05 km`) trong `backend/Code.js`, `frontend/js/api.js` và `frontend/js/sales_app.js`.
  - Bổ sung hàm kiểm tra `validate_geofence_checkin()` và unit test `test_geofence_validation_50m` (8/8 tests PASS).
- **Tab Bản Đồ & Tuyến Đường (Road-snapping Routing)**:
  - Tích hợp hàm `fetchRoadRoute()` kết nối OSRM (Open Source Routing Machine) giúp vệt lộ trình di chuyển bám sát hệ thống đường phố giao thông thực tế, thay thế hoàn toàn đường thẳng chim bay thô sơ.
  - Lọc bỏ các điểm nhiễu GPS có sai số lớn (`Accuracy > 80m`).
  - Đảm bảo tile layer CartoDB Voyager hiển thị mượt mà không watermark và không yêu cầu API Key.
- **Tab Chi Tiết & Timeline**:
  - Tối ưu bộ lọc giờ làm việc: Chỉ hiển thị các sự kiện, mốc di chuyển và check-in trong khung giờ thực tế **07:00 đến 18:00**.
- **Tab Báo Cáo & Thống Kê (Tab 5 - Manager Dashboard)**:
  - Xây dựng hoàn chỉnh màn hình phân tích hiệu suất chuyên sâu:
    - Thẻ KPI tổng hợp: Tổng số điểm bán đã ghé thăm, Doanh số / Đơn hàng mới (+Đơn), Tỷ lệ hoàn thành tuyến đường (Route Completion Rate %), Thời gian bám sát thị trường (Field Hours).
    - Bộ lọc đa chiều: Theo kỳ báo cáo (Hôm nay, Tuần này, Tháng này, Toàn bộ) và theo Sales Rep (Tất cả hoặc từng nhân sự).
    - Bảng xếp hạng và đánh giá hiệu suất chi tiết: Tiến độ hoàn thành tuyến (Progress bar), Đơn hàng, Phân phối, Thời lượng thị trường, Tỷ lệ tuân thủ chu kỳ khách, Xếp loại (`Xuất sắc ⭐`, `Đạt ✓`, `Cần cải thiện ⚠️`).
    - Nút xuất dữ liệu báo cáo chuyên nghiệp ra file `.csv`.

## [2026-09-19] - Fix Map 403 Forbidden & Standardize Distance Display to KM
- **Sửa lỗi Bản đồ (Map 403 Forbidden)**:
  - Khắc phục triệt để lỗi `Access blocked - 403` do server `tile.openstreetmap.org` từ chối truy cập trực tiếp từ frontend.
  - Chuyển sang sử dụng **CartoDB Voyager** raster tiles (`basemaps.cartocdn.com`) tuân thủ chính sách sử dụng, tốc độ tải nhanh, hiển thị mượt mà trên cả 2 màn hình:
    1. *Bản Đồ Định Vị & Lộ Trình Tuyến Đi* (`manager_app.js` -> `initLeafletMap`).
    2. *Bản Đồ Khách Hàng Toàn Hệ Thống* (`manager_app.js` -> `initCustomerMap`).
  - Giữ nguyên 100% logic Leaflet, GPS tracking, markers, route polylines, filters. Không yêu cầu API Key.
- **Thống nhất hiển thị khoảng cách sang KM (2 chữ số thập phân)**:
  - Bổ sung hàm `formatDistanceKm(meters)` dùng chung tại `frontend/js/geo.js` và `backend/Code.js`.
  - Quy đổi toàn bộ khoảng cách hiển thị cho người dùng:
    - Bán kính check-in: `200m` -> `0.20 km`.
    - Khoảng cách đến khách: `125m` -> `0.13 km`, `350m` -> `0.35 km`, `12,500m` -> `12.50 km`.
    - Cảnh báo khoảng cách check-in & lân cận khi thêm mới.
  - Giữ nguyên dữ liệu mét nội bộ và công thức Haversine.
- **Unit Tests**:
  - Bổ sung `test_format_distance_km` vào `tests/test_logic.py` (7/7 tests PASS).

## [2026-09-19] - Fix Icon Rendering (Triệt Tiêu Lỗi Dấu Hỏi Chấm '?')
- **Khắc phục lỗi hiển thị icon dấu hỏi chấm trên các nút thao tác Sales**:
  - Bổ sung các định nghĩa SVG chuẩn của **Lucide Icons** còn thiếu trong `frontend/js/icons.js`: `file-edit`, `edit`, `edit-2`, `edit-3`, `pen`, `x-circle`, `log-out`, `plus-circle`, `boxes`, `info`.
  - Chuẩn hóa icon trên các nút bấm của Sales (`frontend/js/sales_app.js`):
    - Nút **"CẬP NHẬT NỘI DUNG"**: Áp dụng icon `file-edit` (tờ giấy & bút viết sắc nét).
    - Nút **"Bỏ qua / Rời điểm này"**: Áp dụng icon `x-circle` (vòng tròn thoát/đóng trực quan).
    - Nút **"Ghi nhận / Cập nhật"** & **"Ghi nhận"**: Áp dụng icon `edit` (cây bút thao tác nghiệp vụ).
  - Quét kiểm tra toàn diện 100% các thành phần giao diện, loại bỏ triệt để tình trạng fallback về `help-circle` (`?`).

## [2026-09-19] - Multi-Unit Product Management & Flexible Care Update Form
- **Quản lý đa dạng Đơn Vị Tính & Quy Đổi Sản Phẩm**:
  - Tạo module `frontend/js/products.js` hỗ trợ danh mục đơn vị: **Thùng, Xô, Chai, Bình, Phuy**.
  - Hệ số quy đổi chuẩn hóa với đơn vị cơ sở `Chai` (1 Thùng = 24 Chai, 1 Xô = 18 Chai, 1 Bình = 4 Chai, 1 Phuy = 200 Chai).
  - Tích hợp tính năng hiển thị quy đổi trực tiếp (real-time preview hint) khi nhập số lượng (VD: `≈ 48 Chai (Base) | 2 Thùng`).
- **Nâng cấp Modal "Ghi nhận / Cập nhật" của Sales**:
  - Bổ sung bộ chọn sản phẩm ("Sản phẩm ghi nhận") tự động điền đơn vị đo lường tương ứng.
  - Từng ô nhập số lượng (Hàng phân phối thêm, Tồn kho thực tế, Đặt hàng mới) đều có dropdown chọn đơn vị tính linh hoạt đi kèm.
  - Bố cục responsive dạng lưới song song gọn gàng, hiển thị sắc nét trên cả desktop và mobile.
- **Đồng bộ hóa & Hiển thị bên Manager**:
  - Lưu trữ chi tiết đơn vị tính (`DistributedUnit`, `InventoryUnit`, `ReorderUnit`, `NewOrderUnit`) và sản phẩm (`SelectedProduct`) trong `VISITS`.
  - Cập nhật tồn kho khách hàng đi kèm đơn vị tính (`CurrentStock` + `StockUnit`) thay thế cho nhãn tĩnh `SP`.
  - Cập nhật form thêm/sửa khách hàng và modal chi tiết khách hàng của Quản lý để hỗ trợ chọn và hiển thị đơn vị tồn kho.
  - Mở rộng bộ kiểm thử tự động với 6 test case quy đổi đơn vị (14/14 tests PASS).

## [2026-09-19] - Customer Care & Retention Engine Upgrade (Mục tiêu: Không bỏ quên khách cũ)
- Nâng cấp trọng tâm hệ thống thành **QUẢN LÝ CHĂM SÓC KHÁCH HÀNG**:
  - **Chu kỳ chăm sóc linh hoạt**: Cấu hình theo loại khách (`VIP` = 3 ngày, `NORMAL` = 7 ngày, `SMALL` = 14 ngày) trong `SETTINGS`.
  - **Tự động tính ngày chăm sóc kế tiếp**: `NextCareDate = LastCareDate + CareCycleDays`.
  - **Hệ thống phân loại & cảnh báo đa cấp**: `🔴 QUÁ HẠN` (Overdue), `🟠 SẮP ĐẾN HẠN` (Due Soon), `🟢 ĐÚNG HẠN` (On Track), `⚪ CHƯA TỪNG CHĂM SÓC` (Never Visited).
  - **Form Báo Cáo Chăm Sóc 4 Khối Toàn Diện**:
    - **A. Hàng Hóa**: Lượng phân phối, Tồn kho thực tế kiểm đếm, Nhu cầu nhập thêm.
    - **B. Công Nợ**: Công nợ ghi nhận, Hạn mức, Tình trạng thanh toán.
    - **C. Kinh Doanh**: Đơn hàng mới chốt, Dự kiến đơn tiếp theo, Tình hình tiêu thụ.
    - **D. Chăm Sóc & Ý Kiến**: Chi tiết trao đổi, Vấn đề khách hàng phản ánh, Nhu cầu tiếp theo.
  - **Lịch sử chăm sóc vĩnh viễn**: Lưu theo từng bản ghi `VISITS` (không ghi đè dữ liệu cũ), tổng hợp dòng thời gian chi tiết.
  - **Cảnh báo khách hàng gần khi tạo mới (< 100m)**: Thông báo vị trí điểm bán lân cận tránh tạo trùng lặp.
  - **Dashboard Manager toàn diện**:
    - Thẻ KPI Quá Hạn / Sắp Đến Hạn / Đúng Hạn / Chưa Ghé.
    - Bảng thống kê Tổng Công Nợ khách hàng & Tổng Tồn Kho điểm bán.
    - Bảng theo dõi trách nhiệm chăm sóc và tỷ lệ quá hạn theo từng Sales Rep.
  - **Giao diện Sales Mobile**: Bổ sung lối tắt `[ KHÁCH CẦN CHĂM SÓC ]` và `[ KHÁCH QUÁ HẠN 🔴 ]`.
  - **Bộ kiểm thử Unit Test**: Bổ sung `test_care_status_overdue_calculation` (Pass 100%).

- Khởi tạo tài liệu quy tắc và ngữ cảnh: `AI_RULES.md`, `AI_CONTEXT.md`, `CURRENT_TASK.md`, `CHANGELOG_AI.md`.
- Thiết kế Database Google Sheets với đầy đủ 8 bảng: `USERS`, `CUSTOMERS`, `WORK_SESSIONS`, `GPS_LOGS`, `VISITS`, `SCHEDULES`, `SETTINGS`, `LOGS`.
- Xây dựng Backend Google Apps Script hoàn chỉnh (`Code.gs` và các module hỗ trợ: Auth, Sessions, GPS, Visits, Customers, Reports, Settings, Database init).
- Xây dựng Frontend SPA hiện đại:
  - Mobile PWA dành cho Sales: Giao diện trực quan, 3 nút hành động, GPS watcher, tính toán trạng thái di chuyển/đứng yên, Check-in khách hàng theo bán kính GPS, Check-out ghi nhận kết quả.
  - Desktop Dashboard dành cho Manager: Giao diện Pastel/Clean, KPI thống kê tức thời, Bản đồ OpenStreetMap / Leaflet hiển thị vị trí realtime và lộ trình tuyến đường trong ngày, Timeline chi tiết từng mốc thời gian, Quản lý khách hàng, Cảnh báo bất thường (Anomalies).
  - Hỗ trợ chế độ hoạt động kép: Kết nối trực tiếp Google Apps Script API hoặc chạy chế độ Test/Demo giả lập thông minh trên máy tính/trình duyệt.
