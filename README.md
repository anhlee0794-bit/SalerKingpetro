# 📍 SALES FIELD MANAGEMENT SYSTEM

Hệ thống quản lý hoạt động làm việc thực tế của nhân viên Sales đi thị trường (quy mô dưới 10 người), bảo vệ quyền riêng tư (chỉ tracking khi bấm **BẮT ĐẦU LÀM**, dừng tracking khi **KẾT THÚC LÀM**), không theo dõi 24/7.

---

## 🛠️ Công Nghệ & Nền Tảng
- **Backend / Database Serverless**: Google Apps Script (GAS), Google Sheets, Google Drive.
- **Frontend Web / Mobile App**: HTML5, Vanilla CSS3 (Pastel design system), JavaScript ES6+.
- **Map & Routing**: OpenStreetMap & Leaflet.js.
- **GPS Engine**: HTML5 Geolocation API, Haversine Distance, Dynamic Moving/Stationary Classifier.

---

## 📂 Cấu Trúc Dự Án
```
c:\IDE\SALER\
├── backend/
│   ├── Code.js              # Toàn bộ mã nguồn Google Apps Script (Auth, GPS, Sessions, Visits, Dashboard)
│   └── appsscript.json      # Manifest cấu hình Google Apps Script
├── frontend/
│   ├── index.html           # Single Page App (Sales Mobile + Manager Desktop)
│   ├── css/
│   │   └── style.css        # Hệ thống giao diện Pastel, Responsive, Mobile Touch-friendly
│   └── js/
│       ├── geo.js           # Xử lý GPS, tính khoảng cách Haversine, phân loại MOVING/STATIONARY
│       ├── api.js           # API Connector + Trình giả lập Mock Database CSDL Google Sheets
│       ├── sales_app.js     # Logic Mobile App cho Sales (Start work, GPS watch, Check-in, Timer, End)
│       ├── manager_app.js   # Logic Desktop App cho Quản lý (Dashboard KPI, Map Route, Timeline, Report)
│       └── app.js           # Quản lý phiên, chuyển đổi Role và khởi động
├── server.js                # Local development server (Node.js)
├── package.json             # Package configuration
├── AI_RULES.md              # Quy tắc cốt lõi & bảo mật hệ thống
├── AI_CONTEXT.md            # Ngữ cảnh kiến trúc & CSDL
├── CURRENT_TASK.md          # Tiến độ theo dõi nhiệm vụ
└── CHANGELOG_AI.md          # Lịch sử thay đổi hệ thống
```

---

## 🚀 HƯỚNG DẪN TRIỂN KHAI LÊN GOOGLE APPS SCRIPT & GOOGLE SHEETS

### Bước 1: Tạo Google Sheet mới
1. Truy cập [Google Sheets](https://sheets.new) và tạo một bảng tính mới.
2. Đặt tên: `SALES_FIELD_DATABASE`.

### Bước 2: Dán mã nguồn Google Apps Script
1. Trên Google Sheet, vào menu **Tiện ích mở rộng (Extensions)** -> **Apps Script**.
2. Xóa nội dung mặc định trong file `Mã.gs` (Code.gs).
3. Copy toàn bộ nội dung trong file [Code.js](file:///c:/IDE/SALER/backend/Code.js) và dán vào Apps Script editor.
4. Nhấn **Lưu (Save)**.

### Bước 3: Khởi tạo CSDL tự động
1. Trong Apps Script editor, tại thanh công cụ chọn hàm `setupSheets` và nhấn nút **Chạy (Run)**.
2. Cấp quyền truy cập Google Account khi được yêu cầu.
3. Script sẽ tự động tạo đủ **8 Sheets** với tiêu đề cột chuẩn và dữ liệu mẫu:
   - `USERS`: Quản lý tài khoản (Admin, Manager, Sales).
   - `CUSTOMERS`: Danh bạ khách hàng & tọa độ GPS.
   - `WORK_SESSIONS`: Lưu phiên làm việc, giờ bắt đầu, kết thúc, tọa độ xuất phát.
   - `GPS_LOGS`: Lưu lịch sử tọa độ định kỳ trong ca (chỉ khi WORKING).
   - `VISITS`: Lưu lượt gặp khách, thời gian check-in/out, kết quả gặp.
   - `SCHEDULES`: Lịch trình hẹn gặp.
   - `SETTINGS`: Cấu hình chu kỳ GPS (5 phút), bán kính check-in (200m),...
   - `LOGS`: Ghi nhận lỗi và sự kiện hệ thống.

### Bước 4: Triển khai Web App (Deploy)
1. Trong Apps Script, bấm nút **Triển khai (Deploy)** -> **Triển khai mới (New deployment)**.
2. Chọn loại: **Ứng dụng web (Web app)**.
3. Cấu hình:
   - **Mô tả**: `Sales Field Management V1`
   - **Thực thi dưới dạng**: `Tôi (Your account)`
   - **Ai có quyền truy cập**: `Bất kỳ ai (Anyone)`
4. Bấm **Triển khai (Deploy)** và copy đường dẫn **Web App URL** (`https://script.google.com/macros/s/.../exec`).

### Bước 5: Kết nối Frontend
1. Mở giao diện Web App.
2. Bấm vào nút **⚙️ Cấu Hình Google Apps Script** ở góc trên.
3. Dán Web App URL vào và bấm **LƯU CẤU HÌNH**.

---

## 📱 QUY TRÌNH HOẠT ĐỘNG THỰC TẾ CỦA SALES (MOBILE)
1. **Bắt đầu ngày**: Nhân viên mở app trên điện thoại -> Bấm `[ BẮT ĐẦU LÀM ]`.
2. **GPS tự động kết nối**: Hệ thống ghi nhận tọa độ GPS khởi đầu và trạng thái chuyển thành `ĐANG LÀM VIỆC`.
3. **Di chuyển trên đường**: Hệ thống tự động phân loại `ĐANG DI CHUYỂN` hoặc `ĐỨNG YÊN` định kỳ theo cấu hình (1/5/10/15 phút).
4. **Đến khách hàng**:
   - Bấm `[ GẶP KHÁCH HÀNG ]` -> Chọn khách hàng.
   - Hệ thống so khớp GPS với tọa độ khách hàng (bán kính chuẩn `200m`).
   - Nếu trong bán kính: Cho phép `CHECK-IN` -> Đồng hồ bấm giờ buổi gặp bắt đầu chạy.
   - Nếu ngoài bán kính: Báo khoảng cách thực tế và chặn check-in giả mạo.
5. **Rời khách hàng**: Bấm `[ CHECK-OUT ]` -> Chọn kết quả (Có nhu cầu / Đang trao đổi / Chờ phản hồi /...) & ghi chú.
6. **Hết giờ làm**: Bấm `[ KẾT THÚC LÀM ]` -> Hệ thống dừng hoàn toàn định vị GPS.

---

## 💻 QUY TRÌNH DÀNH CHO MANAGER (DESKTOP)
- **Tổng quan Dashboard**: Xem số lượng Sales đang làm, chưa bắt đầu, số lượt gặp khách theo thời gian thực.
- **Bản đồ OpenStreetMap**: Xem vị trí mới nhất của tất cả Sales và toàn bộ tuyến đường di chuyển trong ngày (Route polyline).
- **Timeline Chi tiết**: Mốc thời gian từng sự kiện (Bắt đầu -> Di chuyển -> Gặp khách A 52 phút -> Di chuyển -> Gặp khách B 38 phút -> Kết thúc).
- **Cảnh báo bất thường (Anomalies)**: Dữ liệu khách quan về việc mất tín hiệu GPS hoặc đứng yên quá lâu để Quản lý nắm bắt.
- **Xuất dữ liệu**: Xuất báo cáo hoạt động ra file CSV nhanh chóng.
