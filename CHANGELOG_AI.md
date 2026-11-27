# CHANGELOG AI - SALES FIELD & CUSTOMER CARE MANAGEMENT

## [2026-11-27] - Chuyển Đổi Giao Diện Hệ Thống Tab Sang Sidebar Dọc Thu Gọn/Mở Rộng & Tối Ưu Toàn Diện Cho Điện Thoại
- **Mục đích / Bối cảnh**: Thay thế thanh Tab ngang dài (dễ bị tràn thanh cuộn ngang trên màn hình nhỏ) bằng hệ thống **Sidebar dọc** phân nhóm trực quan kèm nút icon bật/tắt ngay góc trái Header, đồng thời tối ưu trải nghiệm ngăn kéo trượt (Slide-over Drawer) và bố cục responsive cho điện thoại di động.
- **Các file thay đổi (Affected Files)**:
  - `frontend/index.html` & `frontend/css/style.css`:
    - Thêm nút icon điều hướng `#btn-nav-toggle` cạnh logo `SALES FIELD` và lớp nền mờ `#mobile-nav-backdrop`.
    - Thiết kế `.app-shell-layout` & `.app-vertical-sidebar`: Trên máy tính (`> 992px`) hỗ trợ thu gọn (`68px` chỉ hiện icon) hoặc mở rộng (`252px` hiện nhóm chức năng + nhãn đầy đủ); trên điện thoại & máy tính bảng (`<= 992px`) tự chuyển thành ngăn kéo trượt từ cạnh trái (`282px`, chuẩn nút chạm $\ge 44\text{px}$) kèm thanh hiển thị nhanh mục đang mở (`mobile-current-tab-bar`).
    - Tối ưu responsive di động (`<= 768px` & `<= 380px`) cho Header gọn gàng, thẻ KPI 2 cột chống tràn số, bảng đối chiếu Trước/Sau 1 cột, bản đồ `350px` và hộp thoại dạng Bottom Sheet dễ bấm bằng 1 tay.
  - `frontend/js/app.js`, `frontend/js/manager_app.js`, `frontend/js/sales_app.js`, `frontend/js/icons.js`, `frontend/sw.js`:
    - Bổ sung `initSidebarState()`, `toggleSidebarNav()`, `closeMobileNav()`, `updateNavToggleIcon()` lưu trạng thái thu gọn vào `localStorage` và tự động gọi `ManagerApp.invalidateMaps()` để bản đồ Leaflet co giãn mượt mà khi đóng/mở sidebar.
    - Cập nhật `ManagerApp.renderLayout()` (phân 3 nhóm: Giám sát thị trường, Khách hàng & Hàng hóa, Báo cáo & Quản trị) và `SalesApp.renderSalesSidebarHtml()` đồng bộ Sidebar dọc trên cả giao diện Quản lý lẫn Sales; nâng cache PWA lên `?v=20261127f`.
- **Kết quả kiểm thử & xác minh**:
  - Quét kiểm tra tĩnh `full_cross_audit.py` đạt **0 lỗi**, pass **36/36** unit tests, `node --check` 9/9 file JS sạch lỗi và đồng bộ nguyên tử FTP (bao gồm `css/style.css`) lên `hiepphucduc.vn`.

## [2026-11-27] - Hoàn Thiện 5 Điểm Trải Nghiệm & Luồng Phụ Cuối Cùng (Tìm Kiếm Giữ Con Trỏ, Gom Duyệt Điểm Mới, CSV Excel UTF-8 BOM, Offline Điểm Mới & Cảnh Báo Kết Ca)
- **Mục đích / Bối cảnh**: Xử lý dứt điểm 5 điểm cấn nhỏ còn lại sau đợt quét kiểm tra chéo toàn bộ 39/39 API và giao diện vận hành.
- **Các file thay đổi (Affected Files)**:
  - `frontend/js/manager_app.js`:
    - **Tìm kiếm tức thì giữ nguyên con trỏ bàn phím**: Bổ sung bộ đệm RAM (`useCached = true` + `_restoreSearchFocus()`) cho Tab 4 (`Khách Hàng`), Tab 6 (`Hàng Hóa`) và Tab 8 (`Nhân Sự`), giúp gõ tìm kiếm mượt tức thì không gọi lại API mỗi ký tự và không bị văng focus ô nhập.
    - **Gom duyệt Điểm bán mới vào Tab 5 (`Phê Duyệt`) & thêm nút `Từ chối` ở Tab 4**: Hiển thị khối *Điểm Bán Mới Do Sales Đề Xuất Mở Tuyến* (`PENDING_APPROVAL`) ngay đầu Tab 5 kèm đủ nút **Duyệt Mở Tuyến** & **Từ Chối**.
    - **Chuẩn hóa Xuất Báo Cáo CSV cho Microsoft Excel**: Bổ sung ký tự **UTF-8 BOM (`\uFEFF`)**, tải qua `Blob`, dịch tiêu đề cột sang Tiếng Việt và thêm cột **Doanh Số Đơn Mới (VNĐ)**.
  - `frontend/js/api.js`: Đưa thao tác tạo điểm bán mới (`createCustomer` của `SALES`) vào Hàng đợi Offline 4G, tạo mã tạm `CUST-OFFLINE-*` vào cache tuyến đi và tự động ánh xạ sang mã thật `CUST-*` cho các lượt Check-in tiếp theo khi có sóng lại.
  - `frontend/js/sales_app.js` & `backend-php/api.php`:
    - Bổ sung cảnh báo rõ tên cửa hàng đang ghé dở nếu Sales bấm *Kết thúc ca làm việc* khi chưa bấm lưu phiếu chăm sóc; đồng thời cập nhật `endWork` và kiểm tra boolean nghiêm ngặt cho `approveCustomer` trên `api.php`.
  - `frontend/js/icons.js`, `frontend/js/app.js`, `frontend/index.html`, `frontend/sw.js`: Bổ sung icon SVG `'lock'` còn thiếu, đồng bộ lời gọi `SalesApp.render()` trong `teleportToCustomer()` và nâng cache PWA lên `?v=20261127e`.
  - `tests/test_logic.py`: Bổ sung `test_utf8_bom_csv_and_offline_prospect_id_mapping` (**36/36 PASS**).
- **Kết quả kiểm thử & xác minh**:
  - Quét kiểm tra tĩnh `full_cross_audit.py`: **0 missing API actions, 0 missing icons, 0 missing method calls**.
  - Pass **36/36** unit tests, `node --check` 9/9 file JS sạch lỗi, đồng bộ nguyên tử FTP lên `hiepphucduc.vn` và đẩy lên GitHub.

## [2026-11-27] - Xóa Bỏ Cấu Hình Google Apps Script Cũ & Bổ Sung Quyền Bật/Tắt Thanh Công Cụ ADMIN Trong Cài Đặt Hệ Thống
- **Mục đích / Bối cảnh**: Dọn bỏ hộp thoại `Cấu Hình Google Apps Script` và nút `Reset Data` (Mock Storage) không còn dùng trên hệ thống MySQL thực tế; đồng thời cho phép `ADMIN` tùy ý Bật / Tắt thanh `Công cụ ADMIN` ngay trong Tab 9 (`Cài Đặt Hệ Thống`).
- **Các file thay đổi (Affected Files)**:
  - `frontend/js/app.js`:
    - Xóa hoàn toàn hàm `openSettingsDialog()` (`Cấu Hình Google Apps Script`) và `resetMockData()` khỏi thanh công cụ `ADMIN`.
    - Bổ sung cơ chế quản lý trạng thái hiển thị thanh công cụ `SHOW_ADMIN_TOOLBAR` (`isAdminToolbarVisible()`, `setAdminToolbarEnabled()`, `syncAdminToolbarSettingFromServer()`), tự động trả góc nhìn về tài khoản gốc `ADMIN` nếu tắt thanh công cụ khi đang đóng vai nhân viên khác; đổi nút cài đặt trên thanh sang lối tắt mở thẳng Tab 9 (`openAdminSystemSettings()`).
  - `frontend/js/manager_app.js` & `backend-php/api.php`:
    - Bổ sung khóa `SHOW_ADMIN_TOOLBAR` (mặc định `1`) trong `loadSettingsMap()`.
    - Thêm **Khối 3: Phân Quyền Hiển Thị Công Cụ ADMIN** trong Tab 9 (`Cài Đặt Hệ Thống`) với tùy chọn Bật (`🟢 ĐANG BẬT`) / Tắt (`⚪ ĐANG TẮT`) áp dụng tức thì và lưu bền vững xuống bảng `settings` trên MySQL.
  - `frontend/index.html` & `frontend/sw.js`: Nâng cache PWA lên `?v=20261127d`.
  - `tests/test_logic.py`: Bổ sung `test_admin_toolbar_toggle_and_impersonation_reset` (**35/35 PASS**).
- **Kết quả kiểm thử & xác minh**:
  - Pass **35/35** unit tests, `node --check` 9/9 file JS sạch lỗi, đồng bộ nguyên tử FTP lên `hiepphucduc.vn` và kiểm tra trực tiếp khóa `SHOW_ADMIN_TOOLBAR` từ API `getSettings`.

## [2026-11-27] - Nâng Cấp Công Cụ "Test Di Chuyển" Thành Bộ Mô Phỏng Lộ Trình & Tuyến Đi Thực Tế Cho ADMIN
- **Mục đích / Bối cảnh**: Nâng cấp nút `⚡ Test Di Chuyển` trên thanh công cụ `ADMIN` từ cơ chế nhảy tọa độ đơn điểm sang hộp thoại mô phỏng đầy đủ 2 chế độ: (1) Mô phỏng quãng đường chạy xe qua nhiều đại lý thực tế hiển thị ngay trên Bản đồ đường phố OSRM & Timeline, và (2) Đặt vị trí đứng trước 1 đại lý tùy chọn để test form Check-in, kèm nút dọn sạch dữ liệu test an toàn 100%.
- **Các file thay đổi (Affected Files)**:
  - `backend-php/api.php`:
    - Bổ sung `simulateSalesRoute` (khóa cứng quyền `ADMIN`): Tự động nội suy các điểm GPS chạy xe dọc đường (`MOVING`, ~25–31 km/h) xen kẽ các điểm dừng tại cửa hàng (`STATIONARY`) và lượt Check-in mẫu (`VIS-SIM-*`) đi qua 2–4 đại lý thực tế mà không làm biến đổi công nợ/tồn kho thật của đại lý.
    - Bổ sung `clearSimulatedRoutes` (khóa cứng quyền `ADMIN`): Dọn sạch 100% các bản ghi mang tiền tố `SES-SIM-%`, `GPS-SIM-%`, `VIS-SIM-%` mà không ảnh hưởng tới dữ liệu đi làm thật của nhân viên.
  - `frontend/js/app.js` & `frontend/js/api.js`:
    - Nâng cấp `App.simulateMovement()` mở hộp thoại trực quan 2 chế độ (`runRouteSimulation`, `teleportToCustomer`, `clearRouteSimulation`); sau khi bấm chạy mô phỏng sẽ tự động chuyển về Tab Bản đồ, chọn đúng nhân viên + ngày và phóng to vào đường lộ trình vừa tạo.
  - `frontend/js/manager_app.js`: Hiển thị thêm chấm xanh lá (`🟢 Vị trí mới nhất của Sales`) ở đầu mũi tên lộ trình khi xem tuyến chi tiết của 1 nhân viên trên Bản đồ.
  - `frontend/index.html` & `frontend/sw.js`: Nâng cache PWA lên `?v=20261127c`.
  - `tests/test_logic.py`: Bổ sung `test_admin_route_simulation_and_safe_cleanup` (**34/34 PASS**).
- **Kết quả kiểm thử & xác minh**:
  - Pass **34/34** unit tests, `node --check` 9/9 file JS sạch lỗi, đồng bộ nguyên tử FTP lên `hiepphucduc.vn` và kiểm thử E2E tạo + xóa lộ trình mô phỏng thành công 100%.

## [2026-11-27] - Rà Soát Chéo Quy Trình Nghiệp Vụ Đầu-Cuối & Sửa 6 Điểm Đứt Luồng Vận Hành
- **Mục đích / Bối cảnh**: Rà soát toàn diện quy trình nghiệp vụ thực tế từ lúc Sales mở ca ngoài đường đến khi Quản lý đối soát và phê duyệt trên văn phòng, phát hiện và khắc phục triệt để 6 lỗi đứt luồng tiềm ẩn.
- **Các file thay đổi (Affected Files)**:
  - `backend-php/api.php`, `frontend/js/api.js`, `frontend/js/manager_app.js`, `frontend/js/sales_app.js`:
    - **Khắc phục lỗi nghiêm trọng luồng Phê duyệt thay đổi thông tin đại lý (Tab 5)**:
      - Sửa lỗi phân tích biến quyết định duyệt (`isApproved`): Trước đây `handleRejectRequest()` truyền chuỗi `"REJECT"` khiến cả PHP (`!empty("REJECT") === true`) lẫn JS (`if ("REJECT")`) hiểu nhầm nút **Từ chối** thành **Chấp thuận** và ghi đè dữ liệu khách hàng. Đã chuẩn hóa kiểm tra boolean/status nghiêm ngặt ở cả 3 tầng.
      - Đồng bộ tên trường dữ liệu trả về của `getCustomerUpdateRequests` (`requests` & `data`) để Tab 5 Quản lý hiển thị đầy đủ danh sách yêu cầu chờ duyệt thay vì luôn báo trống `0 yêu cầu`.
      - Khôi phục nút **`✏️ Đề xuất sửa`** (`showRequestCustomerUpdateModal`) trên thẻ khách hàng của Sales để nhân viên hiện trường gửi yêu cầu cập nhật SĐT, người liên hệ, địa chỉ, tọa độ.
      - Đồng bộ trường `ContactName`/`contactName` trong bảng đối chiếu Trước – Sau (Diff Viewer) và tự động tính lại `next_care_date` theo chu kỳ mới (`VIP`/`NORMAL`/`SMALL`) ngay khi Quản lý bấm Duyệt thay đổi phân loại đại lý.
  - `frontend/js/sales_app.js`:
    - **Chặn lệch phiên khi bấm Chăm sóc mà chưa Bắt đầu ca**: Trong `openCareForCustomer()`, nếu Sales bấm vào đại lý từ danh sách *Khách Quá Hạn* khi chưa mở ca (`!activeSession`), hệ thống tự nhắc xác nhận và kích hoạt `handleStartWork()` trước để đảm bảo GPS tuyến đi và mã phiên luôn đồng bộ.
    - **Bổ sung Chỉ đường Google Maps & Tóm tắt Tồn/Nợ nhanh trên thẻ đại lý**: Hiển thị dòng `📦 Tồn: ... • 💰 Nợ: ...` ngay ngoài danh sách tuyến và thêm nút **`🧭 Chỉ đường`** mở thẳng điều hướng dẫn đường Google Maps miễn phí tới tọa độ cửa hàng.
  - `frontend/js/manager_app.js`:
    - **Bộ chọn ngày trên Tab Tổng Quan (Tab 1) & Chi Tiết Timeline (Tab 3)**: Gắn ô chọn ngày `<input type="date">` đồng bộ với `onGlobalDateChange()` giúp Quản lý tra cứu lại ca làm và nhật ký di chuyển của các ngày trước đó mà không cần vòng qua Tab Bản đồ.
    - **Hiển thị Điểm Check-in màu tím (`🟣`) trên Bản đồ Tuyến đường (Tab 2)**: Vẽ các điểm ghé thăm thực tế (`visits`) kèm popup giờ vào, thời lượng đứng, khoảng cách đối soát và kết quả chăm sóc khớp đúng chú giải bản đồ.
  - `frontend/js/icons.js`, `frontend/index.html`, `frontend/sw.js`, `frontend/js/app.js`:
    - Bổ sung 2 icon SVG bị thiếu (`file-check` trên Tab 5 và `user-plus` trên nút Thêm nhân sự) để không còn hiện dấu `?`; nâng phiên bản cache PWA lên `?v=20261127b`.
  - `tests/test_logic.py`: Bổ sung unit test `test_approval_decision_parsing_reject_never_treated_as_approve` kiểm chứng mọi biến thể `"REJECT"`, `false`, `"0"` không bao giờ bị hiểu nhầm là duyệt (**33/33 PASS**).
- **Kết quả kiểm thử & xác minh**:
  - Chạy `python tests/test_logic.py` (**33/33 PASS**) & `node --check` trên toàn bộ 9 file JS (0 lỗi).
  - Đồng bộ nguyên tử FTP lên `https://hiepphucduc.vn/saler/` và kiểm tra E2E trực tiếp endpoint `getCustomerUpdateRequests` & `getManagerDashboard` hoạt động chuẩn xác.

## [2026-11-27] - Xử Lý Toàn Diện Báo Cáo Thẩm Tra Quy Trình Sales, Trung Thực GPS, Giỏ Đơn Nhiều Mặt Hàng, Chụp Ảnh Điểm Bán & Tách Bí Mật Khỏi Git
- **Mục đích / Bối cảnh**: Giải quyết triệt để các lỗ hổng bảo mật, tính trung thực tọa độ GPS, thuật toán nhận diện di chuyển và các giới hạn nghiệp vụ bán hàng phát hiện trong đợt thẩm tra toàn hệ thống (`audit_sales_app.md`).
- **Các file thay đổi (Affected Files)**:
  - `backend-php/config.php`, `backend-php/config.local.php` (git-ignored), `.gitignore`, `backend-php/.htaccess`:
    - Tách hoàn toàn `DB_PASS` và khóa ký JWT riêng biệt (`AUTH_TOKEN_SECRET`) sang `config.local.php` (nằm trong `.gitignore`, không đẩy lên GitHub) và chặn `403 Forbidden` qua `.htaccess`; bổ sung whitelist tên miền CORS (`applySecureCorsHeaders()`).
  - `backend-php/api.php` & `backend-php/schema.sql`:
    - **Bảo mật đăng nhập**: Bổ sung Rate-Limit khóa tạm 10 phút nếu nhập sai mật khẩu $\ge 5$ lần trên cùng IP+Email (ghi vào bảng `logs`), cấm mật khẩu rỗng và trả cờ `mustChangePassword: true` khi nhân viên còn dùng mật khẩu mặc định `123456`.
    - **Đối soát khoảng cách Check-in trung thực**: Tự động thêm cột `distance_meters`, `is_within_geofence`, `photo_url`, `order_items_json`, `order_total_amount` vào bảng `visits`; hàm `computeCustomerGeofence()` tính chính xác khoảng cách Haversine thực tế giữa Sales và đại lý (ghi nhận cảnh báo dữ liệu khách quan `OUT_OF_GEOFENCE` trên Timeline nếu ở ngoài bán kính).
    - **Tự đóng ca treo qua đêm & Thời lượng ghé thực tế**: Hàm `closeStaleWorkSessions()` tự chốt các ca `WORKING` của ngày cũ lúc `18:00`; nhận mốc `arrivedAt` từ bộ theo dõi vùng điểm bán để tính đúng số phút đứng tại đại lý; lọc bỏ các điểm GPS nhiễu (`LOW_ACCURACY` > ngưỡng sai số) khỏi thời gian đứng yên.
    - **Nghiệp vụ bán hàng mở rộng**: Lưu ảnh chụp thực tế xuống thư mục `api/uploads/visits/` (kèm `.htaccess` chặn thực thi `.php`), lưu chi tiết giỏ đơn nhiều sản phẩm & tổng thành tiền, chuyển `createCustomer` của Sales sang `PENDING_APPROVAL` chờ Quản lý duyệt, ẩn đại lý chưa phân tuyến khỏi Sales, chuyển `deleteCustomer` sang xóa mềm (`status = 'DELETED'`), tính chỉ tiêu tuyến hợp lý theo ngày (`DAILY_VISIT_TARGET = 8`) và thêm API `getSalesMySummary`.
  - `frontend/js/geo.js`:
    - Bổ sung `getReliablePosition()` (thử GPS vệ tinh chính xác cao -> dự phòng trạm sóng/Wi-Fi, **tuyệt đối không chèn tọa độ giả**).
    - Nâng cấp `classifyActivity()` đối chiếu theo **cửa sổ điểm neo 30 giây (`anchorPosition`)** và nhận đầy đủ `settings` của Admin, khắc phục triệt để lỗi chạy xe máy bị nhận nhầm là `STATIONARY`.
    - Tích hợp **Screen Wake Lock API** giữ sáng màn hình khi đang đi tuyến, tự động đồng bộ GPS ngay khi mở khóa màn hình (`visibilitychange`) và ghi nhận `arrivalMap` thời điểm tới điểm bán.
  - `frontend/js/sales_app.js` & `frontend/js/products.js`:
    - Xóa bỏ 100% tọa độ giả Quận 1 (`10.7760, 106.6950`) và bỏ hành vi lấy tọa độ đại lý gán cho Sales khi mất GPS.
    - Nâng cấp Block C thành **Giỏ đơn hàng nhiều mặt hàng** (`+ Thêm mặt hàng khác`, tự tính đơn giá theo đơn vị tính & tổng thành tiền VNĐ).
    - Bổ sung nút **📷 Chụp ảnh cửa hàng / kệ hàng thực tế** trong Block D (tự động nén ảnh qua `<canvas>` chuẩn 800px JPEG nhẹ cho 4G).
    - Thêm thanh chuyển đổi 2 tab trên di động: **`📍 Tuyến Đi Hôm Nay`** và **`📊 Kết Quả Của Tôi`** (hiển thị tiến độ chỉ tiêu ngày, doanh số tháng và 15 lượt chăm sóc gần nhất).
  - `frontend/js/manager_app.js` & `frontend/js/app.js` & `frontend/js/icons.js`:
    - Hiển thị nhãn đối soát khoảng cách (`🟢 Đúng vị trí` / `🟠 Cách cửa hàng X km`), chi tiết giỏ đơn nhiều sản phẩm, doanh số đơn hàng và ảnh chụp thực tế trong Modal Chi Tiết Khách Hàng & Báo Cáo; thêm ô cấu hình `DAILY_VISIT_TARGET` trong Tab Cài Đặt; tự bật hộp thoại bắt đổi mật khẩu khi nhân sự dùng pass mặc định `123456`.
  - `frontend/index.html` & `frontend/sw.js`: Nâng version PWA cache `?v=20261127a`.
  - `tests/test_logic.py`: Bổ sung 3 bộ test mới (`test_anchor_movement_classification_and_geofence_audit`, `test_stale_overnight_session_auto_close_and_multi_item_order`, `test_login_rate_limiter_and_soft_delete_isolation`) — đạt **32/32 PASS**.
- **Kết quả kiểm thử & xác minh**:
  - Khắc phục thêm lỗi trộn dòng buffer IDE tại `backend-php/api.php` (dòng 86–89 bị đan xen chữ ký hàm `checkCallerAuthorization` cũ), ghi sạch lại file chuẩn không trùng hàm/case.
  - Chạy `python tests/test_logic.py` (**32/32 PASS**) & `node --check` trên toàn bộ 9 file JS (0 lỗi).
  - Đồng bộ nguyên tử FTP 14 file lên `https://hiepphucduc.vn/saler/` và kiểm tra E2E: `/api/config.php` & `/api/config.local.php` đều trả `HTTP 403`, `config.php` sạch mật khẩu 100%, `getManagerDashboard`, `getPerformanceReports(today)` (`targetVisits <= 8`), `getSalesMySummary` hoạt động chuẩn xác.

## [2026-11-26] - Hoàn Thiện Đồng Bộ API MySQL, Hàng Đợi Offline 4G, PWA Di Động & Bảo Mật Máy Chủ (9 Hạng Mục Production)
- **Mục đích / Bối cảnh**: Xử lý trọn vẹn 9 hạng mục trọng yếu thuộc 3 nhóm ưu tiên (🔴 Khớp 100% API Frontend - MySQL, 🟠 Chống mất dữ liệu khi rớt sóng 3G/4G & Cài đặt PWA trên điện thoại, 🟡 Khóa chặt JWT 100% endpoint, chặn truy cập thư mục `.htaccess` và tự động dọn rác bảng `gps_logs`) trước khi bàn giao đội ngũ Sales vận hành thực tế.
- **Các file thay đổi (Affected Files)**:
  - `backend-php/api.php`:
    - **🔴 Nhóm 1 (API Parity)**:
      - Nâng cấp toàn diện `getManagerDashboard`: Trả về đầy đủ `stats` (13 chỉ số vận hành, công nợ, tồn kho, chu kỳ), danh sách `sales` kèm tọa độ `lastGps` thời gian thực và `careAlerts` (`overdue`, `dueSoon`, `onTrack`, `neverVisited`, `highDebt`, `lowStock`).
      - Bổ sung 2 API quản trị còn thiếu: `getSalesTimeline` (Tab 3: Lộ trình `gpsRoute`, `timeline`, `summary`, cảnh báo `anomalies`) và `getPerformanceReports` (Tab 7: Lọc thực tế theo `today`/`week`/`month`/`all`, xếp hạng hiệu suất, tỷ lệ hoàn thành tuyến).
      - Sửa `checkoutCareVisit` đọc chuẩn cả gói `careData` (PascalCase) lẫn gốc `$params` (camelCase), lưu đầy đủ `result`, `note`, 4 khối hàng hóa/tồn kho/công nợ/đơn mới, tự giữ nguyên công nợ/tồn kho cũ nếu bỏ trống, cập nhật `stock_unit` cho đại lý và tự động nâng cột `visits.reorder_demand` sang `VARCHAR(255)`; bổ sung thêm `checkoutVisit` và `cancelVisit`.
      - Sửa lỗi thiếu tham số SQL (`?`) trong `requestCustomerUpdate` và đồng bộ hoa/thường khi ghi đè khách hàng ở `resolveCustomerUpdateRequest` + `getCustomerVisits`.
      - Đồng nhất song ngữ `SessionID`/`sessionId` và `VisitID`/`visitId` trên `getActiveSession` (trả kèm `activeVisit` đang `IN_PROGRESS`), `startWork` (trả kèm object `session` và lưu điểm GPS mở ca đầu tiên), `checkinVisit` (trả kèm object `visit`), `endWork` (trả cả `duration` và `workDuration`).
    - **🟡 Nhóm 3 (Bảo mật JWT & Dọn rác GPS)**:
      - Áp dụng middleware `requireAuth()` kiểm tra chữ ký JWT HS256 bắt buộc trên 100% endpoint đọc/ghi (trừ `login` và `verifyToken`), kèm hàm `resolveTargetSalesId()` cô lập dữ liệu từng Sales.
      - Bổ sung `purgeOldGpsLogs()` tự động dọn tọa độ thô trong `gps_logs` cũ quá 90 ngày (chạy đầu ca `startWork`, xác suất 1/100 trên `recordGps`, và qua API `cleanupGpsLogs` cho Admin) trong khi giữ vĩnh viễn lịch sử chăm sóc bảng `visits`.
  - `backend-php/config.php` & `backend-php/schema.sql`: Đặt `SYNC_TO_GOOGLE_SHEETS = false` mặc định, thêm hằng số `GPS_LOG_RETENTION_DAYS = 90` và cập nhật schema `reorder_demand VARCHAR(255)`.
  - `backend-php/.htaccess` & `frontend/.htaccess`: Tắt liệt kê thư mục (`Options -Indexes`) và chặn `403 Forbidden` mọi truy cập HTTP trực tiếp vào `config.php`, `sync.php`, `schema.sql`, `README.md`, `.env`.
  - `frontend/js/api.js`:
    - Ngắt hoàn toàn cơ chế tự nhảy sang dữ liệu giả `MockDatabase` khi đang chạy Production (`!isMockMode()`).
    - Xây dựng **Offline Queue (`sales_field_offline_queue`)**: Tự động xếp hàng các thao tác hiện trường (`startWork`, `endWork`, `recordGps`, `checkinVisit`, `cancelVisit`, `checkoutVisit`, `checkoutCareVisit`, `requestCustomerUpdate`) kèm `clientTimestamp` khi mất sóng 4G, tự động ánh xạ mã tạm `SES-OFFLINE-*`/`VIS-OFFLINE-*` và đẩy bù FIFO qua `flushOfflineQueue()` ngay khi có mạng trở lại (`window.online`).
    - Lưu đệm bản đọc gần nhất từ MySQL (`getCustomers`, `getSettings`, `getActiveSession`) để Sales mở app vùng mất sóng vẫn thấy đúng đại lý thật; báo lỗi mạng rõ ràng cho các thao tác Quản trị khi offline.
  - `frontend/js/sales_app.js`: Khôi phục `activeVisit` trực tiếp từ MySQL (`getActiveSession`) thay vì đọc `MockDatabase`, gọi `cancelVisit` khi rời điểm bán, chuẩn hóa `parseSafeDate()` trên Safari iOS và hiển thị thanh trạng thái Ngoại tuyến kèm nút `Đồng bộ ngay`.
  - `frontend/manifest.json`, `frontend/icon.svg`, `frontend/sw.js`, `frontend/index.html`, `frontend/js/app.js`: Cấu hình chuẩn **PWA (Add to Home Screen)** chạy toàn màn hình `standalone` với Service Worker chiến lược Network-First cho App Shell (`?v=20261126g`).
  - `frontend/js/manager_app.js`: Bổ sung cài đặt `GPS_RETENTION_DAYS` và nút `🧹 Dọn rác GPS cũ ngay` trong Tab 9 (Cài Đặt Hệ Thống).
  - `tests/test_logic.py`: Bổ sung 3 bộ unit test mới cho `checkoutCareVisit`, `OfflineQueueSimulator` và `GpsRetentionCleaner` (Pass **29/29** tests).
- **Kết quả kiểm thử & xác minh**:
  - Chạy `python tests/test_logic.py` (29/29 PASS) & `node --check` trên toàn bộ 9 file JS (0 lỗi cú pháp).
  - Đồng bộ nguyên tử FTP 13 file lên `https://hiepphucduc.vn/saler/` và kiểm tra E2E thực tế: gọi không Token bị chặn `tokenExpired: true`, `/api/config.php` và `/api/` trả `HTTP 403`, `manifest.json` & `sw.js` trả `HTTP 200`, `getManagerDashboard` / `getSalesTimeline` / `getPerformanceReports` / `getActiveSession` / `cleanupGpsLogs` trả dữ liệu chuẩn 100%.

## [2026-11-26] - Tích Hợp Tìm Địa Chỉ Ra Tọa Độ Miễn Phí (Free Geocoding) & Bản Đồ Kéo Thả Ghim (Mini-Map Picker)
- **Mục đích / Bối cảnh**: Giúp Quản lý ngồi tại văn phòng hoặc nhân viên Sales thêm/sửa đại lý có thể gõ địa chỉ để tự dò ra Kinh độ & Vĩ độ chính xác (chi phí 0đ, không cần Google Maps API) hoặc bấm/kéo thả ghim trực tiếp trên bản đồ đường phố & vệ tinh ngay trong biểu mẫu.
- **Các file thay đổi (Affected Files)**:
  - `frontend/js/geo.js`:
    - Bổ sung `GeoService.geocodeAddress(query)`: Kết hợp **OpenStreetMap Nominatim** (ưu tiên Việt Nam `countrycodes=vn`) kèm dự phòng tự động **Photon API** (`photon.komoot.io`).
    - Bổ sung `GeoService.reverseGeocode(lat, lng)` & `fillAddressFromPin()`: Tự tra ngược tên đường tiếng Việt từ vị trí ghim trên bản đồ.
    - Bổ sung `GeoService.initMiniMapPicker()`, `setMiniMapPosition()`, `searchAddressForPicker()`, `selectSearchResult()`: Bản đồ nhỏ tương tác hỗ trợ bấm chọn điểm, kéo thả ghim (`draggable: true`), chuyển lớp Đường phố / Vệ tinh Esri và đồng bộ 2 chiều với ô Kinh độ & Vĩ độ.
  - `frontend/js/manager_app.js`: Tích hợp nút `🔍 Tìm tọa độ`, danh sách gợi ý địa điểm, nút `📝 Lấy địa chỉ từ ghim` và khung bản đồ nhỏ tương tác vào cả `showAddCustomerModal()` và `showEditCustomerModal()`.
  - `frontend/js/sales_app.js`: Tích hợp tìm địa chỉ và bản đồ nhỏ kéo thả ghim vào `showCreateProspectModal()` cho nhân viên Sales.
  - `frontend/index.html`: Nâng version chống cache `?v=20261126f`.
  - `tests/test_logic.py`: Bổ sung `test_geocoding_result_normalization_osm_and_photon` (Pass 26/26 unit tests).
- **Kết quả kiểm thử & xác minh**:
  - Chạy `python tests/test_logic.py` & `node --check`: 26/26 unit tests PASS, 0 lỗi cú pháp.
  - Đồng bộ nguyên tử (atomic FTP upload) trực tiếp lên server `https://hiepphucduc.vn/saler/`.


## [2026-11-26] - Khắc Phục Lỗi Watermark `API KEY REQUIRED` Của CartoDB Trên Domain Thực Tế & Bổ Sung 4 Lớp Bản Đồ Miễn Phí
- **Mục đích / Bối cảnh**: Máy chủ nền bản đồ CartoDB (`basemaps.cartocdn.com`) tự động gắn chữ chìm `API KEY REQUIRED` khi phát hiện request đến từ tên miền doanh nghiệp thực tế (`https://hiepphucduc.vn/`). Chuyển sang hệ thống đa lớp bản đồ miễn phí 100% không giới hạn, không cần API Key.
- **Các file thay đổi (Affected Files)**:
  - `frontend/js/manager_app.js`: Thêm hàm `attachFreeMapBaseLayers(map)` tích hợp bộ chuyển đổi 4 lớp nền miễn phí (`OpenStreetMap Standard`, `OSM Humanitarian HOT`, `Esri World Street`, `Esri Satellite Ảnh Vệ Tinh`) kèm tự động dự phòng `tileerror` cho cả `initLeafletMap()` và `initCustomerMap()`.
  - `frontend/index.html`: Nâng version chống cache `?v=20261126d`.
- **Kết quả kiểm thử & xác minh**:
  - Kiểm tra HTTP 200 OK với `Referer: https://hiepphucduc.vn/saler/` trên cả 3 cụm tile server; chạy `python tests/test_logic.py` (25/25 PASS) và đồng bộ FTP trực tiếp lên server.


## [2026-11-26] - Hoàn Thiện Trọn Bộ Quản Trị CRUD (Nhân Sự, Khách Hàng, Hàng Hóa & Cài Đặt Hệ Thống) Trực Tiếp Trên MySQL
- **Mục đích / Bối cảnh**: Xây dựng đầy đủ chức năng Thêm / Sửa / Xóa / Khóa / Đặt lại mật khẩu / Phân tuyến cho toàn bộ Quản lý, Nhân viên Sales, Khách hàng đại lý, Danh mục hàng hóa và Cài đặt thông số hệ thống ngay trên giao diện web, lưu trữ trực tiếp 100% vào MySQL mà không cần can thiệp qua phpMyAdmin.
- **Các file thay đổi (Affected Files)**:
  - `backend-php/api.php`:
    - Bổ sung middleware kiểm tra JWT & phân quyền `checkCallerAuthorization()` và công thức Haversine `calcDistanceMeters()`.
    - **Quản trị Nhân sự (`USERS`)**: Nâng cấp `getUsers` (hỗ trợ cả tài khoản `INACTIVE`), thêm mới `saveUser` (tạo mới + chỉnh sửa + băm Bcrypt + bảo vệ không hạ quyền/khóa Admin cuối cùng), `resetUserPassword`, `toggleUserStatus`, `deleteUser` (tự động gỡ phân tuyến trong Transaction), và `reassignRoutes`.
    - **Quản lý Khách hàng (`CUSTOMERS`)**: Bổ sung đầy đủ `createCustomer` (kiểm tra trùng SĐT + cảnh báo gần < 100m), `updateCustomer`, `deleteCustomer`, `approveCustomer`, và `getCustomerVisits`.
    - **Quản lý Hàng hóa (`PRODUCTS`)**: Chuẩn hóa song ngữ PascalCase/camelCase cho `getProducts` và `saveProduct` (khắc phục lỗi hiển thị trống bảng sản phẩm), bổ sung `deleteProduct`.
    - **Cài đặt Hệ thống (`SETTINGS`)**: Bổ sung `saveSettings` lưu toàn bộ tham số vận hành vào MySQL (`ON DUPLICATE KEY UPDATE`).
  - `frontend/js/api.js` & `frontend/js/products.js`: Bổ sung các hàm gọi API mới, đồng bộ tự động `ProductService.syncCatalog()` với dữ liệu MySQL thực tế cho cả Sales Mobile và Manager Desktop.
  - `frontend/js/permissions.js` & `frontend/js/sales_app.js`: Mở quyền tab `settings` riêng cho `ADMIN` và tải tự động danh mục sản phẩm `ACTIVE` khi khởi động Sales App.
  - `frontend/js/manager_app.js`:
    - **Tab Nhân Sự & Phân Tuyến**: Thêm ô tìm kiếm, lọc theo vai trò, Modal Thêm/Sửa thông tin nhân sự (`showEditUserModal`), Modal Cấp lại mật khẩu (`showResetUserPasswordModal`), nút Khóa/Mở khóa, Xóa nhân sự và Lưu phân tuyến vào MySQL.
    - **Tab Khách Hàng**: Bổ sung nút `🗑️ Xóa` đại lý trực tiếp trên bảng và trong Modal chỉnh sửa.
    - **Tab Quản Lý Hàng Hóa**: Hiển thị đầy đủ danh mục động từ MySQL, hỗ trợ tự nhập ngành hàng mới (`datalist`) và bổ sung nút `🗑️ Xóa` mặt hàng.
    - **Tab Cài Đặt Hệ Thống (Mới - Độc quyền ADMIN)**: Giao diện chỉnh sửa trực quan 13 tham số GPS, Dwell Time và Chu kỳ chăm sóc VIP/Thường/Nhỏ.
  - `frontend/index.html`: Nâng version chống cache `?v=20261126c`.
  - `tests/test_logic.py`: Bổ sung `test_admin_user_crud_and_settings_protection` (Pass 25/25 unit tests).
- **Kết quả kiểm thử & xác minh**:
  - Chạy `python tests/test_logic.py` & `node --check`: 25/25 unit tests PASS, 0 lỗi cú pháp JS.
  - Đồng bộ toàn bộ mã nguồn trực tiếp lên hosting `https://hiepphucduc.vn/saler/`.


## [2026-11-26] - Khóa Chặt Công Cụ Kiểm Thử & Chuyển Vai Trò Chỉ Dành Riêng Cho ADMIN (Production Hardening)
- **Mục đích / Bối cảnh**: Gỡ bỏ toàn bộ nút đăng nhập nhanh Demo 1-Click ngoài màn hình Login, ẩn hoàn toàn thanh công cụ Dev/Role Switcher và vô hiệu hóa tính năng giả lập vị trí (`Test Di Chuyển` / Mock GPS) đối với tài khoản `SALES` và `MANAGER`; chỉ mở thanh công cụ kiểm thử cho duy nhất phiên đăng nhập gốc là `ADMIN`.
- **Các file thay đổi (Affected Files)**:
  - `frontend/js/permissions.js`: Giới hạn quyền `SIMULATE_GPS` chỉ còn `[ROLES.ADMIN]`.
  - `frontend/js/app.js`:
    - Bổ sung cơ chế `rootUser` và `isAdminSession()` xác thực đối chiếu trực tiếp từ JWT Server để giữ thanh công cụ cho Admin ngay cả khi Admin chuyển sang xem thử góc nhìn `SALES`/`MANAGER` (kèm nút `↩ Quay về ADMIN gốc`).
    - Ẩn hoàn toàn `#role-switcher-container` và nút `#btn-header-login-switch` ("Đổi vai trò"), đồng thời tự động gọi `GeoService.disableMockGps()` đối với tài khoản `SALES` và `MANAGER`.
    - Gỡ bỏ cụm nút chọn nhanh Demo trên màn hình `renderAuthWall()` và `showLoginModal()`, xóa mật khẩu gợi ý điền sẵn.
    - Bổ sung Action Guard chặn `simulateMovement()`, `loginAsUser()`, `onUserSelectChange()`, `showUserSwitcherModal()` nếu không phải phiên gốc `ADMIN`.
  - `frontend/index.html`: Nâng version chống cache `?v=20261126b`.
  - `tests/test_logic.py`: Bổ sung kiểm thử quyền `SIMULATE_GPS` độc quyền cho `ADMIN` (Pass 24/24 tests).
- **Kết quả kiểm thử & xác minh**:
  - Chạy `python tests/test_logic.py` & `node --check`: 24/24 tests PASS, 0 lỗi cú pháp.
  - Đồng bộ trực tiếp lên server `https://hiepphucduc.vn/saler/`.


## [2026-11-26] - Triển Khai JWT Auth Token Ghi Nhớ Đăng Nhập 3 Ngày (72 Giờ)
- **Mục đích / Bối cảnh**: Bổ sung cơ chế cấp phát mã xác thực bảo mật **JWT Token (HMAC-SHA256)** khi người dùng đăng nhập bằng mật khẩu để tự động duy trì phiên đăng nhập trong đúng **3 ngày (259,200 giây)** kể cả khi đóng trình duyệt hoặc khởi động lại điện thoại, đồng thời tự động thu hồi phiên khi hết hạn mà không cần thêm bảng/cột vào CSDL MySQL.
- **Các file thay đổi (Affected Files)**:
  - `backend-php/config.php`: Định nghĩa `AUTH_TOKEN_TTL_SECONDS = 3 * 86400`, `AUTH_TOKEN_SECRET`, và các hàm ký/kiểm tra chuẩn JWT HS256 (`generateAuthToken()`, `verifyAuthToken()`, `base64UrlEncode()`, `base64UrlDecode()`).
  - `backend-php/api.php`:
    - Chuẩn hóa hàm `formatUserPayload()` đồng bộ PascalCase & camelCase cho dữ liệu User.
    - Action `login`: Cấp phát JWT Token 3 ngày (`token`, `expiresAt`, `ttlDays: 3`) sau khi xác thực mật khẩu Bcrypt.
    - Action `verifyToken`: Kiểm tra chữ ký HMAC-SHA256, thời hạn `exp` và trạng thái `ACTIVE` của tài khoản trong MySQL.
    - Action `changePassword`: Tự động cấp lại Token 3 ngày mới sau khi đổi mật khẩu thành công.
  - `frontend/js/api.js`: Bổ sung lưu trữ `sales_field_auth_token`, đính kèm `authToken` tự động vào payload request, thêm `ApiService.verifyToken()`, và mô phỏng đầy đủ JWT 3 ngày trong `MockDatabase`.
  - `frontend/js/app.js`:
    - Thêm quản lý phiên `saveAuthSession()`, `clearAuthSession()`, `scheduleSessionExpiry()`, `bindVisibilitySessionCheck()` và `handleTokenExpired()`.
    - Tách biệt rõ phiên đăng nhập bằng mật khẩu (`localStorage` kèm JWT Token hạn 3 ngày) với chế độ xem nhanh Demo (`sessionStorage` tạm thời trong tab).
    - Hiển thị thời lượng hiệu lực còn lại của Token trực quan trên Header (`🔑 Token còn X ngày Yh`).
  - `tests/test_logic.py`: Bổ sung unit test `test_jwt_token_3_day_persistence_and_expiry` kiểm thử sinh JWT, còn hạn < 3 ngày, hết hạn >= 3 ngày và chống giả mạo chữ ký (Pass 24/24 tests).
- **Chi tiết kỹ thuật**:
  - Sử dụng `hash_hmac('sha256', ..., AUTH_TOKEN_SECRET, true)` kết hợp `hash_equals()` chống tấn công timing-attack trên PHP; không cần chạy lệnh SQL migration mới trên hosting.
  - Tự động kiểm tra hạn Token ở cả 3 thời điểm: khi mở lại app (`App.init()`), bộ hẹn giờ nền (`setTimeout`), và sự kiện mở sáng màn hình di động (`visibilitychange`).
- **Kết quả kiểm thử & xác minh**:
  - Chạy `python tests/test_logic.py`: 24/24 unit tests PASS (100%).
  - Upload đồng bộ trực tiếp lên hosting `https://hiepphucduc.vn/saler/` và kiểm tra thực tế endpoint `login` & `verifyToken` trả về JWT hợp lệ.


## [2026-11-23] - Nâng Cấp Hệ Thống Xác Thực Mật Khẩu (Bcrypt Password Authentication & Change Password)
- **Mục đích / Bối cảnh**: Chuyển đổi từ cơ chế đăng nhập email demo sang hệ thống xác thực mật khẩu bảo mật thực tế cho môi trường Production: thêm cột mật khẩu mã hóa Bcrypt, bảo vệ đăng nhập và hỗ trợ tính năng tự đổi mật khẩu cho người dùng.
- **Các file thay đổi (Affected Files)**:
  - `backend-php/schema.sql`: Bổ sung cột `password VARCHAR(255) DEFAULT NULL` trong bảng `users`.
  - `backend-php/api.php`: Cập nhật action `login` (xác thực `password_verify`, tự động nâng cấp bcrypt hash cho tài khoản khởi tạo `123456`) và bổ sung action `changePassword` (kiểm tra mật khẩu cũ, mã hóa mật khẩu mới tối thiểu 6 ký tự).
  - `frontend/js/api.js`: Nâng cấp wrapper `ApiService.login(email, password)` và bổ sung `ApiService.changePassword(userId, oldPassword, newPassword)`, cập nhật xử lý `MockDatabase`.
  - `frontend/js/app.js`: Cập nhật `handleEmailLogin`, `handleAuthWallLogin` gửi mật khẩu thực tế, thêm modal đổi mật khẩu `showChangePasswordModal()` và hàm xử lý `handleChangePassword()`.
  - `frontend/index.html`: Thêm nút bấm **🔑 Đổi mật khẩu** (`#btn-header-change-pass`) trên thanh điều khiển người dùng Header.
  - `tests/test_logic.py`: Bổ sung test case `test_password_authentication_and_change_flow` kiểm thử toàn bộ luồng đăng nhập đúng/sai mật khẩu và đổi mật khẩu (Pass 23/23 tests).
  - `saler.zip`: Đóng gói cập nhật bản phát hành mới nhất.
- **Chi tiết kỹ thuật**:
  - Tự động di chuyển (Auto-migration): Các tài khoản cũ chưa có mật khẩu (`password IS NULL`) sẽ tự động chấp nhận mật khẩu khởi tạo `123456`, khi đăng nhập lần đầu hệ thống tự băm Bcrypt và lưu vào DB.
- **Kết quả kiểm thử & xác minh**:
  - Chạy `python tests/test_logic.py`: 23/23 tests PASS (100%).


## [2026-11-21] - Triển Khai Thực Tế Hệ Thống Lên Tên Miền hiepphucduc.vn (Production cPanel & MySQL)
- **Mục đích / Bối cảnh**: Hoàn thành cấu hình DNS, chứng chỉ bảo mật AutoSSL, cài đặt WordPress cho trang chủ và triển khai hệ thống quản lý SalerKingpetro lên môi trường sản xuất thực tế trên hosting cPanel.
- **Các file thay đổi (Affected Files)**:
  - `frontend/js/api.js`: Cập nhật endpoint mặc định sang production URL `https://hiepphucduc.vn/saler/api/api.php`.
  - `backend-php/config.php`: Cấu hình database kết nối MySQL `luatdoan_kingpetrosaler`.
  - `saler.zip`: Đóng gói bộ cài đặt bao gồm cả Frontend SPA và Backend PHP API.
  - `AI_CONTEXT.md` & `CURRENT_TASK.md`: Cập nhật trạng thái môi trường production.
- **Chi tiết kỹ thuật**:
  - Trỏ DNS thành công A record `hiepphucduc.vn` và `www.hiepphucduc.vn` về IP server `139.99.50.190`.
  - AutoSSL được xác thực thành công (Active đến 2027) đảm bảo hoạt động định vị HTML5 Geolocation trên di động.
  - Cài đặt WordPress trang giới thiệu tại thư mục gốc `/home/luatdoan/hiepphucduc.vn`.
  - Khởi tạo Database MySQL `luatdoan_kingpetrosaler` và import thành công toàn bộ schema cùng dữ liệu seed ban đầu (27 queries).
  - Triển khai phân hệ ứng dụng tại `https://hiepphucduc.vn/saler/` và REST API tại `https://hiepphucduc.vn/saler/api/api.php`.
- **Kết quả kiểm thử & xác minh**:
  - Kiểm tra REST API endpoint: `curl https://hiepphucduc.vn/saler/api/api.php?action=getSettings` -> Trả về JSON thành công 100%.
  - Kiểm tra kết nối cơ sở dữ liệu: `curl https://hiepphucduc.vn/saler/api/api.php?action=getUsers` -> Trả về 5 tài khoản hệ thống (Admin, Manager, Sales).


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
