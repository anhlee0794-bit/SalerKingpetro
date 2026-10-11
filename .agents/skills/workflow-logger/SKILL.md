---
name: workflow-logger
description: >-
  Use this skill to log, track, and inspect project workflow activities and changelog records.
  Mandatory for all AI agents working on this repository to read existing workflow state
  before taking action, and to record all code modifications, bug fixes, features, and test results
  into project markdown files (CHANGELOG_AI.md, CURRENT_TASK.md, AI_CONTEXT.md).
---

# Quy Trình Quản Lý & Lưu Vết Lịch Sử Làm Việc (Workflow Logger)

Kỹ năng này chuẩn hóa quy trình làm việc cho tất cả AI và thành viên tham gia phát triển dự án **SalerKingpetro (Sales Field Management)**.

Mọi AI khi tương tác trong repository này **BẮT BUỘC** phải tuân thủ 3 bước:
1. **ĐỌC HIỂU TRƯỚC KHI LÀM (Pre-Action Context Loading)**
2. **THỰC THI & KIỂM THỬ AN TOÀN (Implementation & Testing)**
3. **LƯU VẾT CHI TIẾT VÀO FILE MD (Mandatory Markdown Logging)**

---

## 1. GIAI ĐOẠN 1: Đọc Hiểu Bối Cảnh (Bắt Buộc Khi Bắt Đầu)

Trước khi thực hiện bất kỳ thay đổi nào, AI phải tự động đọc các file sau:
1. `AI_RULES.md`: Nắm vững các nguyên tắc cốt lõi (GPS tracking chỉ khi working, phân quyền, tối ưu Sheets, không giả mạo dữ liệu).
2. `AI_CONTEXT.md`: Nắm vững kiến trúc hệ thống, schema database 8 sheets, các thuật toán hiện có.
3. `CURRENT_TASK.md`: Nắm rõ các đầu việc đang thực hiện hoặc vừa hoàn thành.
4. `CHANGELOG_AI.md` (các mục gần nhất): Nắm rõ lịch sử các thay đổi vừa diễn ra để không làm xung đột hoặc xóa mất code trước đó.

---

## 2. GIAI ĐOẠN 2: Thực Thi & Kiểm Thử

- Thực hiện thay đổi tập trung, đúng yêu cầu.
- Giữ nguyên các comment và logic cũ không liên quan.
- Chạy kiểm thử xác minh ngay sau khi sửa đổi (ví dụ: `python tests/test_logic.py`, kiểm tra syntax và chức năng liên quan).

---

## 3. GIAI ĐOẠN 3: Bắt Buộc Ghi Lịch Sử Vào File Markdown

Mỗi khi hoàn thành một hoạt động (thêm tính năng, sửa bug, tối ưu, refactor, đổi cấu hình), AI **BẮT BUỘC** phải cập nhật ngay vào 2 file markdown:

### A. Cập nhật `CHANGELOG_AI.md` (Lịch Sử Chi Tiết Từng Thay Đổi)
Thêm một mục mới lên **đầu file** (ngay dưới tiêu đề chính) theo đúng định dạng chuẩn:

```markdown
## [YYYY-MM-DD] - <Tiêu đề ngắn gọn về tính năng / thay đổi>
- **Mục đích / Bối cảnh**: <Mô tả tại sao cần thay đổi>
- **Các file thay đổi (Affected Files)**:
  - `<đường_dẫn_file_1>`: <Tóm tắt những gì đã thay đổi trong file này>
  - `<đường_dẫn_file_2>`: <Tóm tắt những gì đã thay đổi trong file này>
- **Chi tiết kỹ thuật**:
  - Tên hàm/module/biến được thêm hoặc sửa đổi: `functionName()`, `ClassName`.
  - Logic nghiệp vụ mới: Giải thích rõ ràng cách xử lý.
  - Xử lý giao diện (UI/UX) nếu có.
- **Kết quả kiểm thử & xác minh**:
  - Đã chạy kiểm thử nào (VD: `tests/test_logic.py` - X/X tests PASS).
  - Trạng thái kiểm tra trực quan hoặc console log.
```

### B. Cập nhật `CURRENT_TASK.md` (Tiến Độ Đầu Việc)
- Đánh dấu `[x]` cho các đầu việc đã hoàn thành.
- Nếu phát sinh việc mới cần làm tiếp, thêm vào danh sách `[ ]` để thành viên tiếp theo hoặc AI phiên sau nắm được.

### C. Cập nhật `AI_CONTEXT.md` (Nếu Có Thay Đổi Kiến Trúc / Schema)
- Nếu thay đổi cấu trúc bảng Google Sheets, thêm tham số `SETTINGS`, hoặc bổ sung module lớn, phải cập nhật trực tiếp vào file này.

---

## 4. Hướng Dẫn Cho Các Thành Viên Trong Dự Án Khi Dùng AI

Khi một thành viên mới trong team hoặc một phiên AI mới tiếp nhận dự án, chỉ cần gõ lời nhắc đơn giản:

> *"Đọc các file md dự án (AI_RULES.md, CURRENT_TASK.md, CHANGELOG_AI.md) và thực hiện tiếp công việc X. Sau khi làm xong hãy cập nhật lại lịch sử thay đổi vào file md theo đúng skill workflow-logger."*

AI sẽ tự động đọc toàn bộ bối cảnh, thực thi và tự động ghi chép nhật ký đầy đủ.
