# AGENTS DIRECTIVE - SALER KINGPETRO WORKSPACE

Tất cả AI Agent khi làm việc trong dự án này **BẮT BUỘC** phải tuân thủ nghiêm ngặt quy trình làm việc sau:

## 1. BẮT ĐẦU PHIÊN LÀM VIỆC (BẮT BUỘC ĐỌC)
Trước khi phân tích, viết code hoặc thực hiện bất kỳ lệnh nào, AI **phải đọc các file tài liệu sau**:
- `AI_RULES.md`: Quy tắc nghiệp vụ, bảo mật, giới hạn tracking GPS và tối ưu Google Apps Script.
- `AI_CONTEXT.md`: Kiến trúc hệ thống, 8 bảng Google Sheets, trạng thái hiện tại.
- `CURRENT_TASK.md`: Tiến độ đầu việc và các mục tiêu đang làm dở.
- `CHANGELOG_AI.md`: Lịch sử các đợt cập nhật gần nhất để tránh ghi đè hoặc xung đột tính năng.

## 2. KỸ NĂNG BẮT BUỘC (SKILL)
- Kích hoạt và tuân thủ skill: `.agents/skills/workflow-logger/SKILL.md`.

## 3. KẾT THÚC HOẠT ĐỘNG (BẮT BUỘC LƯU VẾT VÀO FILE MD)
Sau khi hoàn thành bất kỳ tác vụ nào (thêm tính năng, fix bug, sửa giao diện, refactor hoặc cấu hình):
- **BẮT BUỘC** ghi nhận chi tiết vào `CHANGELOG_AI.md`:
  - Ngày tháng `[YYYY-MM-DD]`
  - Bối cảnh & Mục đích
  - Danh sách file thay đổi
  - Chi tiết kỹ thuật cụ thể (hàm, biến, logic)
  - Kết quả kiểm thử (Test results)
- **BẮT BUỘC** cập nhật trạng thái checklist trong `CURRENT_TASK.md`.
- Nếu có cập nhật kiến trúc hoặc schema bảng Sheets, cập nhật ngay vào `AI_CONTEXT.md`.
