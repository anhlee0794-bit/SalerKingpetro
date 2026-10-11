# AI RULES & SYSTEM DIRECTIVES - SALES FIELD MANAGEMENT

## 1. Mục đích hệ thống
Quản lý hoạt động thực tế của nhân viên Sales đi thị trường (quy mô < 10 người) một cách minh bạch, an toàn, tiết kiệm chi phí bằng Google Apps Script, Google Sheets, HTML5/CSS/JS.

## 2. Nguyên tắc cốt lõi
- **Chỉ tracking khi WORKING**: Không theo dõi 24/7. Chỉ thu thập GPS từ lúc bấm "BẮT ĐẦU LÀM" đến khi bấm "KẾT THÚC LÀM".
- **Không giả mạo dữ liệu**: Không tự suy đoán hoặc fake tọa độ GPS.
- **Bảo mật & Phân quyền server-side**:
  - `ADMIN`: Quản trị toàn bộ.
  - `MANAGER`: Xem tất cả Sales, trạng thái, GPS, lịch sử, khách hàng, báo cáo, cảnh báo.
  - `SALES`: Thao tác phiên làm việc, xem khách được giao, Check-in/Check-out, ghi kết quả. Không xem GPS Sales khác.
- **Không tự quy chụp**: Cảnh báo bất thường (Anomaly) chỉ đưa ra dữ liệu thực tế để Quản lý đánh giá, không tự kết luận nhân viên gian lận hay lười biếng.
- **Tối ưu Google Sheets**: Dùng `getValues()` / `setValues()` theo batch, hạn chế gọi Spreadsheet API nhiều lần, dùng LockService chống race condition.
- **Xử lý ngoại lệ**: Xử lý GPS timeout, permission denied, accuracy thấp, mất mạng, thiết bị khóa màn hình.

## 3. Quy trình phát triển
- Thực hiện tuần tự theo Roadmap (Phase 1 -> Phase 9).
- Sau mỗi Phase: Test logic, test UI, cập nhật `CURRENT_TASK.md`, `AI_CONTEXT.md`, `CHANGELOG_AI.md`.
