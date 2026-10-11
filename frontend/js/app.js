/**
 * APPLICATION BOOTSTRAPPER & UI CONTROLLER
 * Coordinates role switching, responsive viewports, modals, and toasts.
 * Enforces Role-Based Access Control (RBAC) via PermissionService.
 */

const UI = {
  toastContainer: null,

  init() {
    this.toastContainer = document.getElementById("toast-container");
    if (!this.toastContainer) {
      this.toastContainer = document.createElement("div");
      this.toastContainer.id = "toast-container";
      this.toastContainer.className = "toast-container";
      document.body.appendChild(this.toastContainer);
    }
  },

  showToast(message, type = "info") {
    this.init();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  showModal(htmlContent) {
    let overlay = document.getElementById("main-modal-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "main-modal-overlay";
      overlay.className = "modal-overlay";
      overlay.innerHTML = `<div class="modal-card" id="main-modal-card"></div>`;
      document.body.appendChild(overlay);
    }
    const card = document.getElementById("main-modal-card");
    card.innerHTML = htmlContent;
    overlay.classList.add("active");
  },

  closeModal() {
    const overlay = document.getElementById("main-modal-overlay");
    if (overlay) {
      overlay.classList.remove("active");
    }
  },

  showLoading(text = "Đang xử lý...") {
    this.showModal(`
      <div style="text-align: center; padding: 2rem 1rem;">
        <div class="gps-indicator-dot active" style="width: 24px; height: 24px; margin-bottom: 1rem;"></div>
        <div style="font-weight: 600; font-size: 1.05rem; color: var(--text-main);">${text}</div>
      </div>
    `);
  },

  hideLoading() {
    this.closeModal();
  }
};

const App = {
  AUTH_STORAGE_KEY: "sales_field_auth_user",
  users: [
    { UserID: "USR-000", Name: "Admin Hệ Thống", Email: "admin@company.com", Role: "ADMIN", Team: "HQ", Phone: "0901234500" },
    { UserID: "USR-001", Name: "Quản Lý Nguyễn", Email: "manager@company.com", Role: "MANAGER", Team: "North Team", Phone: "0901234567" },
    { UserID: "USR-002", Name: "Nguyễn Văn A", Email: "sales.a@company.com", Role: "SALES", Team: "North Team", Phone: "0901234568" },
    { UserID: "USR-003", Name: "Trần Thị B", Email: "sales.b@company.com", Role: "SALES", Team: "North Team", Phone: "0901234569" },
    { UserID: "USR-004", Name: "Lê Văn C", Email: "sales.c@company.com", Role: "SALES", Team: "North Team", Phone: "0901234570" }
  ],
  currentUser: null,

  async init() {
    UI.init();

    // 1. Load active user from LocalStorage for persistence across reloads
    const savedUserJson = localStorage.getItem(this.AUTH_STORAGE_KEY);
    if (savedUserJson) {
      try {
        const parsed = JSON.parse(savedUserJson);
        const match = this.users.find(u => u.UserID === parsed.UserID || u.Email === parsed.Email);
        this.currentUser = match || parsed;
      } catch (e) {
        this.currentUser = this.users[2]; // Default: Sales A
      }
    } else {
      this.currentUser = this.users[2]; // Default: Sales rep A
    }

    this.renderRoleSwitcher();
    await this.applyUserRole(this.currentUser);
  },

  renderRoleSwitcher() {
    const bar = document.getElementById("role-switcher-container");
    if (!bar) return;

    const currentRole = (this.currentUser && this.currentUser.Role) || "SALES";
    const isAdmin = currentRole === "ADMIN";

    bar.innerHTML = `
      <div class="role-switcher-bar">
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span style="display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 700; color: #cbd5e1;">
            ${Icons.render('users', { size: 15 })} Vai trò:
          </span>
          <select id="user-role-select" onchange="App.onUserSelectChange(this.value)">
            ${this.users.map(u => `<option value="${u.UserID}" ${this.currentUser && u.UserID === this.currentUser.UserID ? 'selected' : ''}>[${u.Role}] ${u.Name} (${u.Team})</option>`).join("")}
          </select>
          <button onclick="App.showUserSwitcherModal()" style="display: inline-flex; align-items: center; gap: 0.35rem;" title="Xem chi tiết quyền hạn các vai trò (RBAC)">
            ${Icons.render('shield', { size: 13 })} Bảng Phân Quyền (RBAC)
          </button>
        </div>

        <div id="admin-tools-group" class="restricted-admin-tool" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          ${isAdmin ? `
            <button class="restricted-admin-tool" onclick="App.openSettingsDialog()" style="display: inline-flex; align-items: center; gap: 0.4rem; background: #4338ca;">
              ${Icons.render('settings', { size: 14 })} Cấu Hình Google Apps Script
            </button>
            <button class="restricted-admin-tool" onclick="App.resetMockData()" style="background: #991b1b; display: inline-flex; align-items: center; gap: 0.4rem;">
              ${Icons.render('rotate-ccw', { size: 14 })} Reset Data
            </button>
          ` : `
            <span style="font-size: 0.72rem; color: #94a3b8; display: inline-flex; align-items: center; gap: 0.3rem;">
              ${Icons.render('lock', { size: 12 })} Cấu hình & Reset chỉ mở cho ADMIN
            </span>
          `}
          <button class="restricted-admin-tool" onclick="App.simulateMovement()" title="Mô phỏng thay đổi trạng thái GPS di chuyển" style="display: inline-flex; align-items: center; gap: 0.4rem; background: #0891b2;">
            ${Icons.render('zap', { size: 14 })} Test Di Chuyển
          </button>
          <button onclick="App.showLoginModal()" style="background: #334155; display: inline-flex; align-items: center; gap: 0.35rem;" title="Mở hộp thoại đăng nhập hoặc đổi tài khoản">
            ${Icons.render('log-in', { size: 13 })} Đăng Nhập
          </button>
        </div>
      </div>
    `;
  },

  async onUserSelectChange(userId) {
    const found = this.users.find(u => u.UserID === userId);
    if (found) {
      await this.applyUserRole(found);
      UI.showToast(`Đã chuyển sang vai trò: ${found.Role} (${found.Name})`, "info");
    }
  },

  async applyUserRole(user) {
    this.currentUser = user;
    localStorage.setItem(this.AUTH_STORAGE_KEY, JSON.stringify(user));

    // Update Header
    const nameEl = document.getElementById("current-user-name");
    if (nameEl) nameEl.innerText = user.Name;

    const teamEl = document.getElementById("current-user-team");
    if (teamEl) teamEl.innerText = user.Team || "";

    const roleBadge = document.getElementById("current-user-role-badge");
    if (roleBadge) {
      roleBadge.innerText = user.Role;
      roleBadge.className = `role-pill role-${user.Role.toLowerCase()}`;
    }

    const btnIcon = document.getElementById("header-login-btn-icon");
    if (btnIcon) {
      btnIcon.innerHTML = Icons.render('repeat', { size: 12 });
    }

    // Refresh Switcher Toolbar
    this.renderRoleSwitcher();

    const salesContainer = document.getElementById("sales-view-container");
    const managerContainer = document.getElementById("manager-view-container");

    if (user.Role === "SALES") {
      salesContainer.style.display = "block";
      managerContainer.style.display = "none";
      try {
        await SalesApp.init(user);
      } catch (err) {
        console.error("[App] SalesApp.init failed:", err);
        salesContainer.innerHTML = `<div style="padding:2rem;color:var(--danger,#dc2626);text-align:center;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 700;">
            ${Icons.render('alert-triangle', { size: 20, color: '#dc2626' })} Lỗi khởi tạo giao diện Sales.
          </div><br/>
          <small>${err.message || err}</small><br/><br/>
          <button onclick="App.applyUserRole(App.currentUser)" style="padding:0.5rem 1rem;border-radius:6px;border:none;background:var(--primary,#6366f1);color:#fff;cursor:pointer;font-weight:600;">Thử lại</button>
        </div>`;
      }
    } else {
      salesContainer.style.display = "none";
      managerContainer.style.display = "block";
      try {
        await ManagerApp.init(user);
      } catch (err) {
        console.error("[App] ManagerApp.init failed:", err);
        managerContainer.innerHTML = `<div style="padding:2rem;color:var(--danger,#dc2626);text-align:center;">
          <div style="display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 700;">
            ${Icons.render('alert-triangle', { size: 20, color: '#dc2626' })} Lỗi khởi tạo giao diện Quản Lý.
          </div><br/>
          <small>${err.message || err}</small><br/><br/>
          <button onclick="App.applyUserRole(App.currentUser)" style="padding:0.5rem 1rem;border-radius:6px;border:none;background:var(--primary,#6366f1);color:#fff;cursor:pointer;font-weight:600;">Thử lại</button>
        </div>`;
      }
    }
  },

  /**
   * RBAC Switcher Modal: Explains role permissions and allows instant switching
   */
  showUserSwitcherModal() {
    const rolesData = [
      {
        role: "ADMIN",
        title: "Admin Hệ Thống",
        badgeClass: "role-admin",
        color: "#7e22ce",
        bg: "#f3e8ff",
        icon: "shield-check",
        description: "Toàn quyền quản trị, cấu hình GAS URL, quản lý nhân sự & phân bổ tuyến, reset dữ liệu.",
        permissions: [
          "Toàn quyền tất cả các Tab: Dashboard, Bản đồ, Timeline, Khách hàng, Báo cáo, Quản lý Nhân sự",
          "Cấu hình hệ thống & Kết nối Google Apps Script",
          "Quản lý danh sách nhân sự toàn công ty và phân bổ tuyến đường cho Sales",
          "Xóa/Thiết lập lại dữ liệu mẫu (Reset Data)"
        ],
        users: this.users.filter(u => u.Role === "ADMIN")
      },
      {
        role: "MANAGER",
        title: "Quản Lý Vùng / Giám Sát",
        badgeClass: "role-manager",
        color: "#b45309",
        bg: "#fef3c7",
        icon: "briefcase",
        description: "Giám sát toàn đội Sales thời gian thực, xem bản đồ lộ trình, timeline, báo cáo và duyệt điểm bán.",
        permissions: [
          "Giám sát thời gian thực toàn bộ nhân viên Sales dưới quyền",
          "Xem bản đồ lộ trình di chuyển, vị trí hiện tại và điểm ghé thăm của Sales",
          "Xem chi tiết dòng thời gian (Timeline) và cảnh báo bất thường",
          "Quản lý khách hàng, theo dõi quá hạn và phê duyệt điểm bán mới",
          "KHÔNG được sửa cấu hình Google Apps Script hoặc reset dữ liệu hệ thống"
        ],
        users: this.users.filter(u => u.Role === "MANAGER")
      },
      {
        role: "SALES",
        title: "Nhân Viên Thị Trường",
        badgeClass: "role-sales",
        color: "#0369a1",
        bg: "#e0f2fe",
        icon: "user",
        description: "Tác nghiệp đi tuyến, check-in điểm bán, cập nhật 4 khối chăm sóc và xem tuyến của riêng mình.",
        permissions: [
          "Chỉ xem danh sách khách hàng và tuyến đường được phân công cho chính mình",
          "Bắt đầu ca / Kết thúc ca làm việc và tự động tracking GPS trong phiên",
          "Check-in / Check-out điểm bán và cập nhật 4 khối dữ liệu chăm sóc",
          "Xem nhật ký timeline cá nhân và theo dõi khách hàng sắp/quá hạn chăm sóc",
          "Không xem thông tin và dữ liệu GPS của các Sales khác"
        ],
        users: this.users.filter(u => u.Role === "SALES")
      }
    ];

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
        <div>
          <h3 style="font-weight: 800; font-size: 1.25rem; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 0.4rem;">
            ${Icons.render('shield', { size: 20, color: '#2563eb' })} Hệ Thống Phân Quyền Người Dùng (RBAC)
          </h3>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
            Đang đăng nhập: <strong>${this.currentUser.Name}</strong> (<span class="role-pill role-${this.currentUser.Role.toLowerCase()}">${this.currentUser.Role}</span>)
          </div>
        </div>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 1rem; max-height: 65vh; overflow-y: auto; padding-right: 4px;">
        ${rolesData.map(r => `
          <div style="border: 1px solid var(--border); border-radius: 10px; padding: 1rem; background: var(--bg-card);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div style="background: ${r.bg}; color: ${r.color}; padding: 6px; border-radius: 6px; display: flex;">
                  ${Icons.render(r.icon, { size: 18, color: r.color })}
                </div>
                <div>
                  <strong style="font-size: 1rem; color: var(--text-main);">${r.title}</strong>
                  <span class="role-pill ${r.badgeClass}" style="margin-left: 0.5rem; font-size: 0.72rem;">${r.role}</span>
                </div>
              </div>
            </div>

            <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.65rem; line-height: 1.4;">
              ${r.description}
            </div>

            <div style="background: var(--bg-subtle); padding: 0.65rem 0.85rem; border-radius: 6px; margin-bottom: 0.75rem; font-size: 0.78rem;">
              <strong style="color: var(--text-main);">Quyền hạn chi tiết:</strong>
              <ul style="margin: 0.25rem 0 0 1.1rem; padding: 0; color: var(--text-muted);">
                ${r.permissions.map(p => `<li>${p}</li>`).join("")}
              </ul>
            </div>

            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">Chọn tài khoản đăng nhập:</span>
              ${r.users.map(u => {
                const isCurrent = this.currentUser && u.UserID === this.currentUser.UserID;
                return `
                  <button onclick="App.loginAsUser('${u.UserID}')" class="btn-action-inline" style="padding: 0.35rem 0.65rem; font-size: 0.78rem; background: ${isCurrent ? 'var(--primary)' : 'var(--bg-card)'}; color: ${isCurrent ? '#fff' : 'var(--text-main)'}; border: 1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'}; border-radius: 6px; cursor: pointer;">
                    ${isCurrent ? '✓ ' : ''}${u.Name}
                  </button>
                `;
              }).join("")}
            </div>
          </div>
        `).join("")}
      </div>

      <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
        <button onclick="App.showLoginModal()" style="border: none; background: none; color: var(--primary); font-size: 0.82rem; cursor: pointer; text-decoration: underline;">
          ${Icons.render('log-in', { size: 14 })} Đăng nhập bằng Email/Mật khẩu
        </button>
        <button onclick="UI.closeModal()" class="btn-action-inline" style="padding: 0.5rem 1rem;">
          Đóng
        </button>
      </div>
    `;

    UI.showModal(content);
  },

  /**
   * Standard Login Modal for email authentication or quick login
   */
  showLoginModal() {
    const currentEmail = (this.currentUser && this.currentUser.Email) || "admin@company.com";
    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div style="background: linear-gradient(135deg, #2563eb, #3b82f6); color: white; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
            ${Icons.render('lock', { size: 18, color: '#fff' })}
          </div>
          <div>
            <h3 style="font-weight: 800; font-size: 1.15rem; color: var(--text-main); margin: 0;">Đăng Nhập Hệ Thống</h3>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Xác thực tài khoản và phân quyền vai trò (RBAC)</div>
          </div>
        </div>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <form onsubmit="event.preventDefault(); App.handleEmailLogin();" style="margin-bottom: 1.25rem;">
        <div class="form-group" style="margin-bottom: 0.75rem;">
          <label class="form-label">Email tài khoản (*)</label>
          <input type="email" id="login-email-input" class="form-control" placeholder="admin@company.com" required value="${currentEmail}" />
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Mật khẩu (Demo: nhập bất kỳ)</label>
          <input type="password" id="login-pass-input" class="form-control" placeholder="••••••••" value="123456" />
        </div>
        <button type="submit" class="btn-action-large btn-meet-customer" style="padding: 0.75rem; font-size: 0.95rem; width: 100%;">
          ${Icons.render('log-in', { size: 16 })} ĐĂNG NHẬP
        </button>
      </form>

      <div style="border-top: 1px solid var(--border); padding-top: 1rem;">
        <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.35rem;">
          ${Icons.render('zap', { size: 14, color: '#f59e0b' })} HOẶC CHỌN NHANH TÀI KHOẢN MẪU:
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          ${this.users.map(u => {
            const roleColor = u.Role === 'ADMIN' ? '#7e22ce' : (u.Role === 'MANAGER' ? '#b45309' : '#0369a1');
            const roleBg = u.Role === 'ADMIN' ? '#f3e8ff' : (u.Role === 'MANAGER' ? '#fef3c7' : '#e0f2fe');
            return `
              <div onclick="App.loginAsUser('${u.UserID}')" style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.75rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; transition: all 0.15s ease;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
                <div>
                  <strong style="font-size: 0.88rem; color: var(--text-main);">${u.Name}</strong>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">${u.Email} • ${u.Team}</div>
                </div>
                <span class="role-pill" style="color: ${roleColor}; background: ${roleBg}; font-size: 0.7rem;">${u.Role}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;

    UI.showModal(content);
  },

  async handleEmailLogin() {
    const emailInput = document.getElementById("login-email-input");
    const email = (emailInput && emailInput.value.trim()) || "";
    if (!email) return UI.showToast("Vui lòng nhập email!", "danger");

    UI.showLoading("Đang xác thực thông tin tài khoản...");
    const res = await ApiService.login(email);
    UI.hideLoading();

    if (res && res.success && res.user) {
      UI.closeModal();
      UI.showToast(`Đăng nhập thành công! Xin chào ${res.user.Name} (${res.user.Role})`, "success");
      await this.applyUserRole(res.user);
    } else {
      const matched = this.users.find(u => u.Email.toLowerCase() === email.toLowerCase());
      if (matched) {
        UI.closeModal();
        UI.showToast(`Đăng nhập thành công! Xin chào ${matched.Name} (${matched.Role})`, "success");
        await this.applyUserRole(matched);
      } else {
        UI.showToast((res && res.message) || "Không tìm thấy người dùng có email này trong hệ thống!", "danger");
      }
    }
  },

  async loginAsUser(userId) {
    const u = this.users.find(x => x.UserID === userId);
    if (u) {
      UI.closeModal();
      UI.showToast(`Đã chuyển sang tài khoản ${u.Name} (${u.Role})`, "success");
      await this.applyUserRole(u);
    }
  },

  logout() {
    localStorage.removeItem(this.AUTH_STORAGE_KEY);
    UI.showToast("Đã đăng xuất khỏi tài khoản!", "info");
    this.showLoginModal();
  },

  /**
   * Action Guard: Core settings dialog only accessible to ADMIN
   */
  openSettingsDialog() {
    if (!PermissionService.guard(this.currentUser, "MANAGE_SYSTEM_SETTINGS", "Chỉ tài khoản ADMIN mới có quyền truy cập cấu hình hệ thống!")) {
      return;
    }

    const currentUrl = ApiService.getGasUrl();
    const isMock = ApiService.isMockMode();

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="font-weight: 700; font-size: 1.15rem;">Cấu Hình Google Apps Script</h3>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div class="form-group">
        <label class="form-label">Google Apps Script Web App URL</label>
        <input type="text" id="config-gas-url" class="form-control" placeholder="https://script.google.com/macros/s/.../exec" value="${currentUrl}" />
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.35rem;">
          Dán URL Web App sau khi Deploy từ Google Apps Script.
        </div>
      </div>

      <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem;">
        <input type="checkbox" id="config-use-mock" ${isMock ? 'checked' : ''} style="width: 18px; height: 18px;" />
        <label for="config-use-mock" style="font-size: 0.9rem; font-weight: 600; cursor: pointer;">
          Sử dụng CSDL Giả Lập Trình Duyệt (Mock Storage)
        </label>
      </div>

      <button id="btn-save-settings" class="btn-action-large btn-meet-customer" style="margin-top: 1rem;">
        LƯU CẤU HÌNH
      </button>
    `;

    UI.showModal(content);

    document.getElementById("btn-save-settings").onclick = () => {
      const url = document.getElementById("config-gas-url").value.trim();
      const mockChecked = document.getElementById("config-use-mock").checked;

      ApiService.setGasUrl(url);
      ApiService.setMockMode(mockChecked);

      UI.closeModal();
      UI.showToast("Đã lưu cấu hình kết nối!", "success");
      this.applyUserRole(this.currentUser);
    };
  },

  simulateMovement() {
    let targetLat = 10.7685;
    let targetLng = 106.6892;
    let targetName = "Đại lý Minh Phát";

    try {
      let cust = null;
      if (typeof SalesApp !== "undefined" && SalesApp.activeVisit) {
        cust = (SalesApp.customers || []).find(c => c.CustomerID === SalesApp.activeVisit.CustomerID);
      } else if (typeof SalesApp !== "undefined" && SalesApp.customers && SalesApp.customers.length > 0) {
        cust = SalesApp.customers.find(c => c.CustomerID === "CUST-001" || (c.CustomerName && c.CustomerName.includes("Minh Phát"))) || SalesApp.customers[0];
      } else if (typeof MockDatabase !== "undefined") {
        const db = MockDatabase.getDB();
        cust = (db.CUSTOMERS || []).find(c => c.CustomerID === "CUST-001" || (c.CustomerName && c.CustomerName.includes("Minh Phát"))) || (db.CUSTOMERS || [])[0];
      }

      if (cust) {
        targetLat = Number(cust.Latitude) || 10.7685;
        targetLng = Number(cust.Longitude) || 106.6892;
        targetName = cust.CustomerName ? cust.CustomerName.replace("Đại lý Tạp Hóa ", "Đại lý ") : "Đại lý Minh Phát";
      }
    } catch (e) {
      console.warn("[App.simulateMovement] Customer target detection fallback:", e);
    }

    if (typeof GeoService !== "undefined" && typeof GeoService.enableMockGps === "function") {
      GeoService.enableMockGps({
        coords: {
          latitude: targetLat,
          longitude: targetLng,
          accuracy: 10,
          speed: 0
        },
        locationName: targetName
      });
    }

    if (this.currentUser && this.currentUser.Role === "SALES" && typeof SalesApp !== "undefined") {
      if (SalesApp.activeSession) {
        const db = (typeof MockDatabase !== "undefined") ? MockDatabase.getDB() : null;
        if (db) {
          try {
            db.GPS_LOGS.push({
              GPSLogID: "GPS-MOCK-" + Date.now(),
              SessionID: SalesApp.activeSession.SessionID,
              SalesID: this.currentUser.UserID,
              Timestamp: new Date().toISOString(),
              Latitude: targetLat,
              Longitude: targetLng,
              Accuracy: 10,
              Speed: 0,
              ActivityStatus: "STATIONARY"
            });
            MockDatabase.saveDB(db);
          } catch (err) {
            console.warn("[App.simulateMovement] MockDatabase log error:", err);
          }
        }
      }

      if (typeof SalesApp.updateCurrentPositionUi === "function") {
        SalesApp.updateCurrentPositionUi(targetLat, targetLng, 10, "STATIONARY (MOCK GPS)");
      }
      if (typeof SalesApp.renderCustomerCards === "function") {
        SalesApp.renderCustomerCards();
      }
    }

    if (this.currentUser && (this.currentUser.Role === "MANAGER" || this.currentUser.Role === "ADMIN") && typeof ManagerApp !== "undefined") {
      if (ManagerApp.activeTab === "map" && typeof ManagerApp.onMapFilterChange === "function") {
        ManagerApp.onMapFilterChange();
      } else if (ManagerApp.activeTab === "dashboard" && typeof ManagerApp.loadDashboardData === "function") {
        ManagerApp.loadDashboardData();
      } else if (ManagerApp.activeTab === "timeline" && typeof ManagerApp.renderTimelineTab === "function") {
        ManagerApp.renderTimelineTab();
      }
    }

    UI.showToast(`Đã kích hoạt GPS giả lập tại ${targetName} (${targetLat.toFixed(4)}, ${targetLng.toFixed(4)})`, "success");
  },

  /**
   * Action Guard: Reset database only accessible to ADMIN
   */
  resetMockData() {
    if (!PermissionService.guard(this.currentUser, "RESET_DATABASE", "Chỉ tài khoản ADMIN mới có quyền đặt lại dữ liệu toàn hệ thống!")) {
      return;
    }

    if (confirm("Đặt lại toàn bộ dữ liệu mẫu ban đầu?")) {
      MockDatabase.resetDB();
      UI.showToast("Đã thiết lập lại dữ liệu mẫu!", "success");
      this.applyUserRole(this.currentUser);
    }
  }
};

window.addEventListener("DOMContentLoaded", () => {
  App.init();
});
