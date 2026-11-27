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
  AUTH_SESSION_KEY: "sales_field_auth_session",
  DEMO_SESSION_KEY: "sales_field_demo_session",
  ADMIN_TOOLBAR_STORAGE_KEY: "sales_field_show_admin_toolbar",
  SESSION_TTL_MS: 3 * 24 * 60 * 60 * 1000, // 3 ngày (259,200,000 ms)
  sessionExpiryTimer: null,
  visibilityWatcherBound: false,
  authSession: null,
  adminToolbarEnabled: true,
  users: [
    { UserID: "USR-000", Name: "Admin Hệ Thống", Email: "admin@company.com", Role: "ADMIN", Team: "HQ", Phone: "0901234500" },
    { UserID: "USR-001", Name: "Quản Lý Nguyễn", Email: "manager@company.com", Role: "MANAGER", Team: "North Team", Phone: "0901234567" },
    { UserID: "USR-002", Name: "Nguyễn Văn A", Email: "sales.a@company.com", Role: "SALES", Team: "North Team", Phone: "0901234568" },
    { UserID: "USR-003", Name: "Trần Thị B", Email: "sales.b@company.com", Role: "SALES", Team: "North Team", Phone: "0901234569" },
    { UserID: "USR-004", Name: "Lê Văn C", Email: "sales.c@company.com", Role: "SALES", Team: "North Team", Phone: "0901234570" }
  ],
  currentUser: null,

  /**
   * Chuẩn hóa cấu trúc User đồng nhất (hỗ trợ cả dữ liệu từ PHP API camelCase và PascalCase)
   */
  normalizeUser(raw) {
    if (!raw) return null;
    const matched = this.users.find(u =>
      u.UserID === (raw.UserID || raw.userId) ||
      (raw.Email || raw.email || "").toLowerCase() === u.Email.toLowerCase()
    );
    return {
      UserID: raw.UserID || raw.userId || (matched && matched.UserID) || "",
      Name: raw.Name || raw.name || (matched && matched.Name) || "Người dùng",
      Email: raw.Email || raw.email || (matched && matched.Email) || "",
      Role: String(raw.Role || raw.role || (matched && matched.Role) || "SALES").toUpperCase(),
      Phone: raw.Phone || raw.phone || (matched && matched.Phone) || "",
      Team: raw.Team || raw.team || (matched && matched.Team) || ""
    };
  },

  /**
   * Định dạng thời gian hiệu lực còn lại của Token (VD: "Còn 2 ngày 23 giờ")
   */
  formatTokenRemaining(expiresAt) {
    if (!expiresAt) return "";
    const diffMs = Number(expiresAt) - Date.now();
    if (diffMs <= 0) return "Đã hết hạn";
    const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (days > 0) {
      return `Token còn ${days} ngày${hours > 0 ? ` ${hours}h` : ""}`;
    }
    const mins = Math.max(1, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
    return totalHours > 0 ? `Token còn ${totalHours}h ${mins}p` : `Token còn ${mins} phút`;
  },

  /**
   * Kiểm tra phiên đăng nhập gốc có phải tài khoản ADMIN thật hay không
   * (Giữ nguyên quyền công cụ kiểm thử ngay cả khi ADMIN đang chuyển sang xem thử góc nhìn SALES/MANAGER)
   */
  isAdminSession() {
    if (!this.authSession) return false;
    const root = this.authSession.rootUser || this.authSession.user;
    return Boolean(root && root.Role === "ADMIN");
  },

  /**
   * Lưu phiên đăng nhập bằng mật khẩu kèm Token 3 ngày vào LocalStorage
   */
  saveAuthSession(user, token, expiresAt) {
    const normalized = this.normalizeUser(user);
    const expMs = Number(expiresAt) > Date.now() ? Number(expiresAt) : (Date.now() + this.SESSION_TTL_MS);
    const sessionData = {
      rootUser: normalized,
      user: normalized,
      token: token || "",
      expiresAt: expMs,
      issuedAt: Date.now(),
      loginMethod: "password"
    };
    this.authSession = sessionData;
    localStorage.setItem(this.AUTH_SESSION_KEY, JSON.stringify(sessionData));
    localStorage.setItem(this.AUTH_STORAGE_KEY, JSON.stringify(normalized));
    sessionStorage.removeItem(this.DEMO_SESSION_KEY);
    if (token) {
      ApiService.setAuthToken(token);
    }
    if (normalized.Role !== "ADMIN" && typeof GeoService !== "undefined" && typeof GeoService.disableMockGps === "function") {
      GeoService.disableMockGps();
    }
    this.scheduleSessionExpiry(expMs);
    this.bindVisibilitySessionCheck();
  },

  /**
   * Xóa toàn bộ Token & phiên đăng nhập
   */
  clearAuthSession() {
    this.authSession = null;
    if (this.sessionExpiryTimer) {
      clearTimeout(this.sessionExpiryTimer);
      this.sessionExpiryTimer = null;
    }
    localStorage.removeItem(this.AUTH_SESSION_KEY);
    localStorage.removeItem(this.AUTH_STORAGE_KEY);
    sessionStorage.removeItem(this.DEMO_SESSION_KEY);
    ApiService.clearAuthToken();
  },

  /**
   * Đặt bộ đếm tự động thu hồi phiên khi đủ 3 ngày
   */
  scheduleSessionExpiry(expiresAt) {
    if (this.sessionExpiryTimer) {
      clearTimeout(this.sessionExpiryTimer);
      this.sessionExpiryTimer = null;
    }
    const remainingMs = Number(expiresAt) - Date.now();
    if (remainingMs <= 0) {
      this.handleTokenExpired("Phiên đăng nhập 3 ngày đã hết hạn. Vui lòng đăng nhập lại!");
      return;
    }
    const safeTimeout = Math.min(remainingMs, 2147483647);
    this.sessionExpiryTimer = setTimeout(() => {
      if (this.authSession && Date.now() >= Number(this.authSession.expiresAt)) {
        this.handleTokenExpired("Phiên đăng nhập 3 ngày đã hết hạn. Vui lòng đăng nhập lại!");
      } else if (this.authSession) {
        this.scheduleSessionExpiry(this.authSession.expiresAt);
      }
    }, safeTimeout);
  },

  /**
   * Kiểm tra hạn Token ngay khi người dùng mở sáng màn hình điện thoại / quay lại tab
   */
  bindVisibilitySessionCheck() {
    if (this.visibilityWatcherBound || typeof document === "undefined") return;
    this.visibilityWatcherBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.authSession && this.authSession.expiresAt) {
        if (Date.now() >= Number(this.authSession.expiresAt)) {
          this.handleTokenExpired("Phiên đăng nhập 3 ngày đã hết hạn. Vui lòng đăng nhập lại!");
        }
      }
    });
  },

  /**
   * Xử lý khi Token hết hạn sau 3 ngày hoặc bị thu hồi từ Server
   */
  handleTokenExpired(message) {
    this.clearAuthSession();
    this.currentUser = null;
    UI.closeModal();
    UI.showToast(message || "Phiên đăng nhập 3 ngày đã hết hạn. Vui lòng đăng nhập lại!", "warning");
    this.renderAuthWall();
  },

  registerPwaServiceWorker() {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js?v=20261127e").catch((err) => {
          console.warn("[PWA] Service Worker registration skipped:", err.message);
        });
      });
    }
  },

  isAdminToolbarVisible() {
    return this.isAdminSession() && this.adminToolbarEnabled !== false;
  },

  loadLocalAdminToolbarPref() {
    const raw = localStorage.getItem(this.ADMIN_TOOLBAR_STORAGE_KEY);
    if (raw === "0" || raw === "false") {
      this.adminToolbarEnabled = false;
    } else if (raw === "1" || raw === "true") {
      this.adminToolbarEnabled = true;
    }
  },

  async syncAdminToolbarSettingFromServer() {
    if (!this.isAdminSession()) return;
    try {
      const sRes = await ApiService.getSettings();
      if (sRes && sRes.success && sRes.settings && sRes.settings.SHOW_ADMIN_TOOLBAR !== undefined) {
        const val = sRes.settings.SHOW_ADMIN_TOOLBAR;
        const enabled = !(val === 0 || val === "0" || val === false || String(val).toLowerCase() === "false");
        this.adminToolbarEnabled = enabled;
        localStorage.setItem(this.ADMIN_TOOLBAR_STORAGE_KEY, enabled ? "1" : "0");
        if (!enabled && this.currentUser && this.authSession && this.authSession.rootUser && this.currentUser.UserID !== this.authSession.rootUser.UserID) {
          await this.applyUserRole(this.authSession.rootUser);
        } else {
          this.renderRoleSwitcher();
          const switchBtn = document.getElementById("btn-header-login-switch");
          if (switchBtn) switchBtn.style.display = this.isAdminToolbarVisible() ? "inline-flex" : "none";
        }
      }
    } catch (e) {
      console.warn("[App] Sync SHOW_ADMIN_TOOLBAR skipped:", e);
    }
  },

  async setAdminToolbarEnabled(enabled, persistToServer = true) {
    if (!this.isAdminSession()) return;
    const cleanEnabled = Boolean(enabled);
    this.adminToolbarEnabled = cleanEnabled;
    localStorage.setItem(this.ADMIN_TOOLBAR_STORAGE_KEY, cleanEnabled ? "1" : "0");

    // Nếu tắt thanh Công cụ ADMIN khi đang đóng vai nhân viên khác -> tự quay về tài khoản ADMIN gốc để không bị kẹt
    if (!cleanEnabled) {
      if (typeof GeoService !== "undefined" && typeof GeoService.disableMockGps === "function") {
        GeoService.disableMockGps();
      }
      if (this.authSession && this.authSession.rootUser && this.currentUser && this.currentUser.UserID !== this.authSession.rootUser.UserID) {
        await this.applyUserRole(this.authSession.rootUser);
      }
    }

    this.renderRoleSwitcher();
    const switchBtn = document.getElementById("btn-header-login-switch");
    if (switchBtn) {
      switchBtn.style.display = this.isAdminToolbarVisible() ? "inline-flex" : "none";
    }

    if (persistToServer) {
      const res = await ApiService.saveSettings({ SHOW_ADMIN_TOOLBAR: cleanEnabled ? 1 : 0 });
      if (res && res.success) {
        UI.showToast(
          cleanEnabled
            ? "Đã BẬT thanh Công cụ ADMIN trên đầu trang!"
            : "Đã TẮT thanh Công cụ ADMIN! (Bạn có thể bật lại bất cứ lúc nào trong Tab Cài Đặt Hệ Thống)",
          "success"
        );
      }
    }
  },

  async openAdminSystemSettings() {
    if (!this.isAdminSession()) return;
    if (this.currentUser && this.currentUser.Role === "SALES" && this.authSession && this.authSession.rootUser) {
      await this.applyUserRole(this.authSession.rootUser);
    }
    if (typeof ManagerApp !== "undefined" && typeof ManagerApp.switchTab === "function") {
      await ManagerApp.switchTab("settings");
    }
  },

  async init() {
    UI.init();
    this.loadLocalAdminToolbarPref();
    this.registerPwaServiceWorker();
    if (typeof ApiService !== "undefined" && typeof ApiService.bindOnlineAutoSync === "function") {
      ApiService.bindOnlineAutoSync();
    }

    // 1. Kiểm tra Auth Session (Token 3 ngày khi đăng nhập bằng mật khẩu)
    const savedSessionJson = localStorage.getItem(this.AUTH_SESSION_KEY);
    if (savedSessionJson) {
      try {
        const session = JSON.parse(savedSessionJson);
        if (!session || !session.user || !session.expiresAt || Date.now() >= Number(session.expiresAt)) {
          this.clearAuthSession();
          UI.showToast("Phiên đăng nhập 3 ngày đã hết hạn. Vui lòng đăng nhập lại!", "warning");
          this.renderAuthWall();
          return;
        }

        // Còn hạn < 3 ngày -> Đồng bộ & xác thực chữ ký Token với Server (nếu có mạng)
        if (session.token) {
          ApiService.setAuthToken(session.token);
          const verifyRes = await ApiService.verifyToken(session.token);
          if (verifyRes && verifyRes.tokenExpired) {
            this.clearAuthSession();
            UI.showToast(verifyRes.message || "Token đăng nhập đã hết hạn. Vui lòng đăng nhập lại!", "warning");
            this.renderAuthWall();
            return;
          }
          if (verifyRes && verifyRes.success && verifyRes.user) {
            const verifiedRoot = this.normalizeUser(verifyRes.user);
            session.rootUser = verifiedRoot;
            // Nếu không phải tài khoản gốc ADMIN thì bắt buộc khóa đúng vào user thật, không cho xem vai trò khác
            if (verifiedRoot.Role !== "ADMIN") {
              session.user = verifiedRoot;
            } else {
              session.user = this.normalizeUser(session.user || verifiedRoot);
            }
            localStorage.setItem(this.AUTH_SESSION_KEY, JSON.stringify(session));
          }
        }

        if (!session.rootUser) {
          session.rootUser = this.normalizeUser(session.user);
        }
        if (session.rootUser.Role !== "ADMIN") {
          session.user = session.rootUser;
          if (typeof GeoService !== "undefined" && typeof GeoService.disableMockGps === "function") {
            GeoService.disableMockGps();
          }
        }

        this.authSession = session;
        this.currentUser = this.normalizeUser(session.user);
        this.scheduleSessionExpiry(session.expiresAt);
        this.bindVisibilitySessionCheck();

        // Nếu là phiên ADMIN, đồng bộ danh sách nhân sự thực tế & cài đặt hiển thị thanh Công cụ ADMIN từ DB
        if (this.isAdminSession()) {
          try {
            const [uRes] = await Promise.all([
              ApiService.getUsers(),
              this.syncAdminToolbarSettingFromServer()
            ]);
            if (uRes && uRes.success && Array.isArray(uRes.users) && uRes.users.length > 0) {
              this.users = uRes.users.map(x => this.normalizeUser(x));
            }
          } catch (err) {
            // Giữ danh sách mặc định nếu lỗi mạng
          }
        }
      } catch (e) {
        this.clearAuthSession();
        this.currentUser = null;
      }
    } else {
      // Bắt buộc đăng nhập bằng Email + Mật khẩu (không cho phép vào không mật khẩu)
      localStorage.removeItem(this.AUTH_STORAGE_KEY);
      sessionStorage.removeItem(this.DEMO_SESSION_KEY);
      this.currentUser = null;
    }

    if (!this.currentUser) {
      // BẮT BUỘC ĐĂNG NHẬP (AUTH WALL): Không cho xem Dashboard hay dữ liệu nếu chưa login
      this.renderAuthWall();
      return;
    }

    // Đã đăng nhập: Hiện toàn bộ ứng dụng và áp dụng phân quyền
    this.showAuthenticatedApp();
    this.renderRoleSwitcher();
    await this.applyUserRole(this.currentUser);
  },

  renderRoleSwitcher() {
    const bar = document.getElementById("role-switcher-container");
    if (!bar) return;

    // Ẩn thanh công cụ đối với SALES, MANAGER hoặc khi ADMIN chủ động tắt trong Cài đặt hệ thống
    if (!this.isAdminToolbarVisible()) {
      bar.style.display = "none";
      bar.innerHTML = "";
      return;
    }

    bar.style.display = "block";
    const rootAdmin = this.authSession.rootUser;
    const isImpersonating = this.currentUser && rootAdmin && this.currentUser.UserID !== rootAdmin.UserID;

    bar.innerHTML = `
      <div class="role-switcher-bar">
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span style="display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 700; color: #fde047;">
            ${Icons.render('shield-check', { size: 15 })} Công cụ ADMIN (Xem góc nhìn):
          </span>
          <select id="user-role-select" onchange="App.onUserSelectChange(this.value)">
            ${this.users.map(u => `<option value="${u.UserID}" ${this.currentUser && u.UserID === this.currentUser.UserID ? 'selected' : ''}>[${u.Role}] ${u.Name} (${u.Team})</option>`).join("")}
          </select>
          ${isImpersonating ? `
            <button onclick="App.onUserSelectChange('${rootAdmin.UserID}')" style="background: #7e22ce; color: #fff; display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 700;">
              ↩ Quay về ADMIN gốc
            </button>
          ` : ''}
          <button onclick="App.showUserSwitcherModal()" style="display: inline-flex; align-items: center; gap: 0.35rem;" title="Xem chi tiết quyền hạn các vai trò (RBAC)">
            ${Icons.render('shield', { size: 13 })} Bảng Phân Quyền (RBAC)
          </button>
        </div>

        <div id="admin-tools-group" class="restricted-admin-tool" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <button class="restricted-admin-tool" onclick="App.simulateMovement()" title="Mô phỏng lộ trình di chuyển & điểm dừng (Chỉ dành cho ADMIN)" style="display: inline-flex; align-items: center; gap: 0.4rem; background: #0891b2;">
            ${Icons.render('zap', { size: 14 })} Test Di Chuyển
          </button>
          <button class="restricted-admin-tool" onclick="App.openAdminSystemSettings()" title="Mở Tab Cài Đặt Hệ Thống & Bật/Tắt thanh Công cụ ADMIN" style="display: inline-flex; align-items: center; gap: 0.4rem; background: #4338ca;">
            ${Icons.render('settings', { size: 14 })} Cài Đặt & Ẩn/Hiện
          </button>
        </div>
      </div>
    `;
  },

  async onUserSelectChange(userId) {
    if (!this.isAdminSession()) {
      return UI.showToast("Từ chối truy cập: Chỉ tài khoản ADMIN mới được phép chuyển góc nhìn kiểm thử!", "danger");
    }
    const found = this.users.find(u => u.UserID === userId);
    if (found) {
      await this.applyUserRole(found);
      UI.showToast(`Đang xem dưới góc nhìn: ${found.Role} (${found.Name})`, "info");
    }
  },

  async applyUserRole(rawUser) {
    const user = this.normalizeUser(rawUser);
    if (!user) return;
    this.currentUser = user;

    if (this.authSession && this.authSession.expiresAt && Date.now() < Number(this.authSession.expiresAt)) {
      this.authSession.user = user;
      localStorage.setItem(this.AUTH_SESSION_KEY, JSON.stringify(this.authSession));
      localStorage.setItem(this.AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      sessionStorage.setItem(this.DEMO_SESSION_KEY, JSON.stringify(user));
    }

    // Update Header
    const nameEl = document.getElementById("current-user-name");
    if (nameEl) nameEl.innerText = user.Name;

    const teamEl = document.getElementById("current-user-team");
    if (teamEl) {
      if (this.authSession && this.authSession.expiresAt) {
        const expDateStr = new Date(Number(this.authSession.expiresAt)).toLocaleString("vi-VN");
        const remainLabel = this.formatTokenRemaining(this.authSession.expiresAt);
        teamEl.innerText = `${user.Team ? user.Team + " • " : ""}🔑 ${remainLabel}`;
        teamEl.title = `Phiên đăng nhập bằng mật khẩu (JWT Token) hiệu lực đến: ${expDateStr}`;
      } else {
        teamEl.innerText = `${user.Team ? user.Team + " • " : ""}Chế độ Demo`;
        teamEl.title = "Phiên Demo tạm thời (Đăng nhập bằng mật khẩu để lưu phiên 3 ngày)";
      }
    }

    const roleBadge = document.getElementById("current-user-role-badge");
    if (roleBadge) {
      roleBadge.innerText = user.Role;
      roleBadge.className = `role-pill role-${user.Role.toLowerCase()}`;
    }

    const switchBtn = document.getElementById("btn-header-login-switch");
    if (switchBtn) {
      switchBtn.style.display = this.isAdminToolbarVisible() ? "inline-flex" : "none";
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
   * RBAC Switcher Modal: Chỉ mở riêng cho tài khoản gốc ADMIN
   */
  showUserSwitcherModal() {
    if (!this.isAdminSession()) {
      return UI.showToast("Từ chối truy cập: Công cụ chuyển đổi góc nhìn chỉ dành cho tài khoản ADMIN!", "danger");
    }
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

      <form onsubmit="event.preventDefault(); App.handleEmailLogin();" style="margin-bottom: 0.5rem;">
        <div class="form-group" style="margin-bottom: 0.75rem;">
          <label class="form-label">Email tài khoản (*)</label>
          <input type="email" id="login-email-input" class="form-control" placeholder="Nhập email công ty..." required value="${currentEmail}" />
        </div>
        <div class="form-group" style="margin-bottom: 0.75rem;">
          <label class="form-label">Mật khẩu (*)</label>
          <input type="password" id="login-pass-input" class="form-control" placeholder="Nhập mật khẩu..." required />
        </div>
        <div style="font-size: 0.76rem; color: #0369a1; background: #e0f2fe; border: 1px solid #bae6fd; padding: 0.45rem 0.65rem; border-radius: 6px; margin-bottom: 0.9rem; display: flex; align-items: center; gap: 0.4rem;">
          ${Icons.render('shield-check', { size: 14, color: '#0284c7' })}
          <span>Tự động cấp <strong>Auth Token</strong> lưu đăng nhập trong <strong>3 ngày</strong>.</span>
        </div>
        <button type="submit" class="btn-action-large btn-meet-customer" style="padding: 0.75rem; font-size: 0.95rem; width: 100%;">
          ${Icons.render('log-in', { size: 16 })} ĐĂNG NHẬP
        </button>
      </form>
    `;

    UI.showModal(content);
  },

  async handleEmailLogin() {
    const emailInput = document.getElementById("login-email-input");
    const passInput = document.getElementById("login-pass-input");
    const email = (emailInput && emailInput.value.trim()) || "";
    const password = (passInput && passInput.value.trim()) || "";
    if (!email) return UI.showToast("Vui lòng nhập email!", "danger");

    UI.showLoading("Đang xác thực & cấp phát Token đăng nhập...");
    const res = await ApiService.login(email, password);
    UI.hideLoading();

    if (res && res.success && res.user) {
      const normalizedUser = this.normalizeUser(res.user);
      this.saveAuthSession(normalizedUser, res.token, res.expiresAt);
      UI.closeModal();
      UI.showToast(`Đăng nhập thành công! Xin chào ${normalizedUser.Name} (Lưu phiên 3 ngày)`, "success");
      await this.applyUserRole(normalizedUser);
    } else {
      UI.showToast((res && res.message) || "Đăng nhập không thành công. Vui lòng kiểm tra lại email và mật khẩu!", "danger");
    }
  },

  renderAuthWall() {
    const authContainer = document.getElementById("auth-wall-container");
    const roleSwitcher = document.getElementById("role-switcher-container");
    const header = document.querySelector(".app-header");
    const mainWrapper = document.querySelector(".main-wrapper");

    if (roleSwitcher) roleSwitcher.style.display = "none";
    if (header) header.style.display = "none";
    if (mainWrapper) mainWrapper.style.display = "none";

    if (!authContainer) return;
    authContainer.style.display = "flex";

    authContainer.innerHTML = `
      <div class="auth-wall-screen">
        <div class="auth-card">
          <!-- Logo & Title -->
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <div class="auth-brand-badge">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <h1 style="font-size: 1.45rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.35rem; letter-spacing: -0.5px;">
              SALES FIELD KINGPETRO
            </h1>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">
              Hệ Thống Quản Lý Tuyến & Hoạt Động Thị Trường
            </p>
          </div>

          <!-- Email / Password Login Form -->
          <form onsubmit="event.preventDefault(); App.handleAuthWallLogin();" style="margin-bottom: 0.25rem;">
            <div class="form-group" style="margin-bottom: 0.85rem;">
              <label class="form-label" style="font-size: 0.82rem; font-weight: 600;">Email Tài Khoản (*)</label>
              <input type="email" id="auth-wall-email" class="form-control" placeholder="Nhập email được cấp..." required autocomplete="username" style="padding: 0.65rem 0.85rem; font-size: 0.9rem;" />
            </div>
            <div class="form-group" style="margin-bottom: 0.85rem;">
              <label class="form-label" style="font-size: 0.82rem; font-weight: 600;">Mật Khẩu (*)</label>
              <input type="password" id="auth-wall-pass" class="form-control" placeholder="Nhập mật khẩu..." required autocomplete="current-password" style="padding: 0.65rem 0.85rem; font-size: 0.9rem;" />
            </div>
            <div style="font-size: 0.76rem; color: #0369a1; background: #f0f9ff; border: 1px solid #bae6fd; padding: 0.5rem 0.75rem; border-radius: 6px; margin-bottom: 1.1rem; display: flex; align-items: center; gap: 0.45rem;">
              ${Icons.render('shield-check', { size: 15, color: '#0284c7' })}
              <span>Phiên đăng nhập bảo mật được tự động lưu trên thiết bị trong <strong>3 ngày</strong>.</span>
            </div>
            <button type="submit" class="btn-action-large btn-meet-customer" style="width: 100%; padding: 0.75rem; font-size: 0.95rem; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              ${Icons.render('log-in', { size: 16 })} ĐĂNG NHẬP HỆ THỐNG
            </button>
          </form>
        </div>
      </div>
    `;
  },

  showAuthenticatedApp() {
    const authContainer = document.getElementById("auth-wall-container");
    const roleSwitcher = document.getElementById("role-switcher-container");
    const header = document.querySelector(".app-header");
    const mainWrapper = document.querySelector(".main-wrapper");

    if (authContainer) authContainer.style.display = "none";
    if (roleSwitcher) roleSwitcher.style.display = this.isAdminToolbarVisible() ? "block" : "none";
    if (header) header.style.display = "block";
    if (mainWrapper) mainWrapper.style.display = "block";
  },

  async handleAuthWallLogin() {
    const emailInput = document.getElementById("auth-wall-email");
    const passInput = document.getElementById("auth-wall-pass");
    const email = (emailInput && emailInput.value.trim()) || "";
    const password = (passInput && passInput.value.trim()) || "";
    if (!email) return UI.showToast("Vui lòng nhập email!", "danger");

    UI.showLoading("Đang xác thực & cấp phát Token đăng nhập...");
    const res = await ApiService.login(email, password);
    UI.hideLoading();

    if (res && res.success && res.user) {
      const normalizedUser = this.normalizeUser(res.user);
      this.saveAuthSession(normalizedUser, res.token, res.expiresAt);
      if (this.isAdminSession()) {
        try {
          const [uRes] = await Promise.all([
            ApiService.getUsers(),
            this.syncAdminToolbarSettingFromServer()
          ]);
          if (uRes && uRes.success && Array.isArray(uRes.users) && uRes.users.length > 0) {
            this.users = uRes.users.map(x => this.normalizeUser(x));
          }
        } catch (err) {}
      }
      UI.showToast(`Đăng nhập thành công! Xin chào ${normalizedUser.Name} (Lưu phiên 3 ngày)`, "success");
      this.showAuthenticatedApp();
      await this.applyUserRole(normalizedUser);
      if (res.mustChangePassword && normalizedUser.Role !== "ADMIN") {
        setTimeout(() => {
          UI.showToast("Bạn đang dùng mật khẩu khởi tạo mặc định (123456). Vui lòng đặt mật khẩu cá nhân mới để bảo mật!", "warning");
          this.showChangePasswordModal(true);
        }, 400);
      }
    } else {
      UI.showToast((res && res.message) || "Đăng nhập không thành công. Vui lòng kiểm tra lại email và mật khẩu!", "danger");
    }
  },

  async loginAsUser(userId) {
    if (!this.isAdminSession()) {
      return UI.showToast("Từ chối truy cập: Chỉ tài khoản ADMIN mới có quyền chuyển đổi vai trò kiểm thử!", "danger");
    }
    const u = this.users.find(x => x.UserID === userId);
    if (u) {
      UI.closeModal();
      this.showAuthenticatedApp();
      UI.showToast(`Đang xem dưới góc nhìn: ${u.Role} (${u.Name})`, "info");
      await this.applyUserRole(u);
    }
  },

  logout() {
    this.clearAuthSession();
    this.currentUser = null;
    if (typeof GeoService !== "undefined" && typeof GeoService.disableMockGps === "function") {
      GeoService.disableMockGps();
    }
    UI.showToast("Đã đăng xuất và xóa Token khỏi thiết bị!", "info");
    this.renderAuthWall();
  },

  async simulateMovement() {
    if (!this.isAdminSession()) {
      return UI.showToast("Từ chối truy cập: Tính năng giả lập GPS kiểm thử chỉ dành riêng cho ADMIN!", "danger");
    }

    UI.showLoading("Đang chuẩn bị danh sách tuyến mô phỏng...");
    let salesUsers = (this.users || []).filter(u => u.Role === "SALES");
    let customers = [];
    try {
      const [uRes, cRes] = await Promise.all([
        ApiService.getUsers("ADMIN"),
        ApiService.getCustomers(null, "MANAGER")
      ]);
      if (uRes && uRes.success && Array.isArray(uRes.users)) {
        this.users = uRes.users.map(x => this.normalizeUser(x));
        salesUsers = this.users.filter(u => u.Role === "SALES");
      }
      if (cRes && Array.isArray(cRes.customers)) {
        customers = cRes.customers.filter(c => c.Latitude && c.Longitude && (Number(c.Latitude) !== 0 || Number(c.Longitude) !== 0));
      }
    } catch (e) {
      console.warn("[App.simulateMovement] Load lists fallback:", e);
    }
    UI.hideLoading();

    this._simCustomersCache = customers;
    const defaultSalesId = (this.currentUser && this.currentUser.Role === "SALES")
      ? this.currentUser.UserID
      : ((typeof ManagerApp !== "undefined" && ManagerApp.selectedSalesId && ManagerApp.selectedSalesId !== "ALL")
        ? ManagerApp.selectedSalesId
        : (salesUsers[0] ? salesUsers[0].UserID : ""));
    const todayStr = (typeof ManagerApp !== "undefined" && ManagerApp.selectedDate)
      ? ManagerApp.selectedDate
      : new Date().toISOString().split("T")[0];
    const isMockGpsOn = (typeof GeoService !== "undefined" && GeoService.isMockGpsEnabled);

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <div style="background: linear-gradient(135deg, #0891b2, #2563eb); color: #fff; width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
            ${Icons.render('zap', { size: 20, color: '#fff' })}
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.1rem; font-weight: 800; color: var(--text-main);">Bộ Mô Phỏng Lộ Trình & Di Chuyển (ADMIN)</h3>
            <div style="font-size: 0.76rem; color: var(--text-muted);">Giúp Admin ngồi văn phòng kiểm tra trực quan Bản đồ đường đi, Timeline & Check-in</div>
          </div>
        </div>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <!-- CHẾ ĐỘ 1: MÔ PHỎNG QUÃNG ĐƯỜNG CHẠY XE QUA NHIỀU ĐẠI LÝ -->
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 1rem; margin-bottom: 0.9rem;">
        <div style="font-weight: 800; font-size: 0.92rem; color: #1e40af; margin-bottom: 0.35rem;">
          🛵 Chế độ 1: Tạo Quãng Đường Chạy Xe Qua Nhiều Đại Lý (Xem trên Bản Đồ & Timeline)
        </div>
        <div style="font-size: 0.78rem; color: #334155; margin-bottom: 0.85rem; line-height: 1.45;">
          Hệ thống sẽ sinh chuỗi tọa độ chạy xe dọc đường từ lúc mở ca qua các đại lý thực tế, sau đó <strong>tự động mở Tab Bản Đồ và phóng to vào vệt đường xanh</strong> cho bạn xem ngay.
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.65rem; margin-bottom: 0.75rem;">
          <div>
            <label style="display: block; font-size: 0.76rem; font-weight: 700; color: #1e3a8a; margin-bottom: 0.25rem;">Nhân viên Sales mô phỏng</label>
            <select id="sim-route-sales" class="form-control" style="padding: 0.45rem 0.6rem; font-size: 0.85rem; background: #fff;">
              ${salesUsers.length > 0
                ? salesUsers.map(s => `<option value="${s.UserID}" ${s.UserID === defaultSalesId ? 'selected' : ''}>${s.Name} (${s.UserID})</option>`).join("")
                : `<option value="">-- Chưa có tài khoản SALES --</option>`}
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 0.76rem; font-weight: 700; color: #1e3a8a; margin-bottom: 0.25rem;">Số điểm đại lý đi qua</label>
            <select id="sim-route-stops" class="form-control" style="padding: 0.45rem 0.6rem; font-size: 0.85rem; background: #fff;">
              <option value="2">Đi qua 2 đại lý (~12 điểm GPS)</option>
              <option value="3" selected>Đi qua 3 đại lý (~19 điểm GPS)</option>
              <option value="4">Đi qua 4 đại lý (~25 điểm GPS)</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 0.76rem; font-weight: 700; color: #1e3a8a; margin-bottom: 0.25rem;">Ngày chạy tuyến</label>
            <input type="date" id="sim-route-date" class="form-control" value="${todayStr}" style="padding: 0.42rem 0.6rem; font-size: 0.85rem; background: #fff;" />
          </div>
        </div>

        <label style="display: flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; color: #1e3a8a; font-weight: 600; cursor: pointer; margin-bottom: 0.85rem;">
          <input type="checkbox" id="sim-route-visits" checked style="width: 15px; height: 15px;" />
          Tạo kèm các điểm ghim tím Check-in gặp khách & đơn hàng mẫu tại mỗi đại lý
        </label>

        <button type="button" onclick="App.runRouteSimulation()" style="width: 100%; padding: 0.7rem 1rem; border-radius: 8px; border: none; background: linear-gradient(135deg, #2563eb, #0891b2); color: #fff; font-weight: 800; font-size: 0.9rem; cursor: pointer; box-shadow: 0 2px 6px rgba(37,99,235,0.25);">
          🚀 CHẠY MÔ PHỎNG & MỞ BẢN ĐỒ XEM TUYẾN ĐƯỜNG NGAY
        </button>
      </div>

      <!-- CHẾ ĐỘ 2: ĐẶT VỊ TRÍ ĐỨNG TRƯỚC 1 CỬA HÀNG ĐỂ TEST FORM CHECK-IN -->
      <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 10px; padding: 0.9rem; margin-bottom: 0.9rem;">
        <div style="font-weight: 800; font-size: 0.88rem; color: var(--text-main); margin-bottom: 0.3rem;">
          📍 Chế độ 2: Đứng Ngay Trước Cửa 1 Đại Lý (Để tự bấm nút Check-in bên màn hình Sales)
        </div>
        <div style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 0.65rem;">
          Chuyển sang màn hình của nhân viên Sales và đặt GPS cách cửa hàng 5m để bạn thử tự bấm Check-in, chụp ảnh & lên đơn.
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <select id="sim-teleport-customer" class="form-control" style="flex: 1; min-width: 200px; padding: 0.45rem 0.6rem; font-size: 0.84rem;">
            ${customers.length > 0
              ? customers.map(c => `<option value="${c.CustomerID}">${c.CustomerName} (${c.AssignedSalesID || 'Chưa gán'})</option>`).join("")
              : `<option value="">Đại lý mẫu (10.7685, 106.6892)</option>`}
          </select>
          <button type="button" onclick="App.teleportToCustomer()" style="padding: 0.48rem 0.9rem; border-radius: 7px; border: none; background: #0f766e; color: #fff; font-weight: 700; font-size: 0.82rem; cursor: pointer;">
            📍 Đứng trước đại lý này
          </button>
          ${isMockGpsOn ? `
            <button type="button" onclick="GeoService.disableMockGps(); UI.closeModal(); UI.showToast('Đã tắt GPS giả lập, quay về định vị thật!', 'info');" style="padding: 0.48rem 0.75rem; border-radius: 7px; border: 1px solid #cbd5e1; background: #fff; color: #334155; font-weight: 600; font-size: 0.8rem; cursor: pointer;">
              🛰️ Tắt GPS giả
            </button>
          ` : ''}
        </div>
      </div>

      <!-- DỌN SẠCH DỮ LIỆU TEST AN TOÀN 100% -->
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding-top: 0.5rem; border-top: 1px dashed var(--border); flex-wrap: wrap;">
        <span style="font-size: 0.75rem; color: var(--text-muted);">
          🛡️ Dữ liệu mô phỏng được gắn mã riêng (<code>SES-SIM-*</code>), không làm thay đổi công nợ/tồn kho thật.
        </span>
        <button type="button" onclick="App.clearRouteSimulation()" style="padding: 0.45rem 0.85rem; border-radius: 6px; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; font-weight: 700; font-size: 0.78rem; cursor: pointer;">
          🧹 Xóa sạch dữ liệu Test đã tạo
        </button>
      </div>
    `;

    UI.showModal(content);
  },

  async runRouteSimulation() {
    if (!this.isAdminSession()) return;
    const salesEl = document.getElementById("sim-route-sales");
    const stopsEl = document.getElementById("sim-route-stops");
    const dateEl = document.getElementById("sim-route-date");
    const visitsEl = document.getElementById("sim-route-visits");

    const salesId = salesEl ? salesEl.value : "";
    const stopCount = stopsEl ? Number(stopsEl.value) || 3 : 3;
    const date = dateEl && dateEl.value ? dateEl.value : new Date().toISOString().split("T")[0];
    const includeVisits = visitsEl ? visitsEl.checked : true;

    if (!salesId) {
      return UI.showToast("Vui lòng tạo hoặc chọn ít nhất 1 tài khoản nhân viên SALES!", "warning");
    }

    UI.showLoading("Đang tạo lộ trình di chuyển & dựng đường đi trên bản đồ...");
    const res = await ApiService.simulateSalesRoute({ salesId, stopCount, date, includeVisits });
    UI.hideLoading();

    if (!res || !res.success) {
      return UI.showToast((res && res.message) || "Không thể tạo lộ trình mô phỏng!", "danger");
    }

    UI.closeModal();

    // Nếu Admin đang đứng ở góc nhìn SALES, tự quay về góc nhìn ADMIN để mở Bản đồ quản lý xem tuyến đường ngay
    if (this.currentUser && this.currentUser.Role === "SALES" && this.authSession && this.authSession.rootUser) {
      await this.applyUserRole(this.authSession.rootUser);
    }

    if (typeof ManagerApp !== "undefined") {
      ManagerApp.selectedSalesId = salesId;
      ManagerApp.selectedDate = date;
      await ManagerApp.switchTab("map");
    }

    UI.showToast(res.message || "Đã tạo lộ trình mô phỏng! Đang hiển thị tuyến đường trên Bản đồ.", "success");
  },

  async teleportToCustomer() {
    if (!this.isAdminSession()) return;
    const selEl = document.getElementById("sim-teleport-customer");
    const custId = selEl ? selEl.value : "";
    const cust = (this._simCustomersCache || []).find(c => c.CustomerID === custId);

    const targetLat = cust ? Number(cust.Latitude) + 0.00004 : 10.7685;
    const targetLng = cust ? Number(cust.Longitude) + 0.00004 : 106.6892;
    const targetName = cust ? cust.CustomerName : "Đại lý Minh Phát";

    if (typeof GeoService !== "undefined" && typeof GeoService.enableMockGps === "function") {
      GeoService.enableMockGps({
        coords: { latitude: targetLat, longitude: targetLng, accuracy: 8, speed: 0 },
        locationName: targetName
      });
    }

    UI.closeModal();

    // Tự động chuyển sang góc nhìn nhân viên SALES phụ trách đại lý đó để Admin thấy ngay màn hình đi tuyến
    let targetSalesUser = null;
    if (cust && cust.AssignedSalesID) {
      targetSalesUser = (this.users || []).find(u => u.UserID === cust.AssignedSalesID && u.Role === "SALES");
    }
    if (!targetSalesUser) {
      targetSalesUser = (this.currentUser && this.currentUser.Role === "SALES")
        ? this.currentUser
        : (this.users || []).find(u => u.Role === "SALES");
    }

    if (targetSalesUser && (!this.currentUser || this.currentUser.UserID !== targetSalesUser.UserID)) {
      await this.applyUserRole(targetSalesUser);
    } else if (typeof SalesApp !== "undefined") {
      if (typeof SalesApp.updateActivityUI === "function") {
        SalesApp.updateActivityUI("STATIONARY", 8);
      }
      if (typeof SalesApp.render === "function") {
        SalesApp.render();
      }
    }

    UI.showToast(`Đã đưa góc nhìn sang ${targetSalesUser ? targetSalesUser.Name : 'SALES'} và đứng cách "${targetName}" ~5m!`, "success");
  },

  async clearRouteSimulation() {
    if (!this.isAdminSession()) return;
    if (!confirm("Xóa toàn bộ lộ trình Test (SES-SIM-*)? Dữ liệu đi làm thật của nhân viên sẽ được giữ nguyên 100%.")) {
      return;
    }

    UI.showLoading("Đang dọn sạch dữ liệu mô phỏng...");
    const res = await ApiService.clearSimulatedRoutes();
    UI.hideLoading();

    if (res && res.success) {
      if (typeof GeoService !== "undefined" && typeof GeoService.disableMockGps === "function") {
        GeoService.disableMockGps();
      }
      UI.closeModal();
      if (typeof ManagerApp !== "undefined" && this.currentUser && this.currentUser.Role !== "SALES") {
        await ManagerApp.switchTab(ManagerApp.activeTab || "map");
      }
      UI.showToast(res.message || "Đã xóa sạch lộ trình mô phỏng!", "success");
    } else {
      UI.showToast((res && res.message) || "Lỗi khi xóa dữ liệu mô phỏng!", "danger");
    }
  },

  /**
   * Modal đổi mật khẩu tài khoản hiện tại
   */
  showChangePasswordModal(isForcedDefault = false) {
    if (!this.currentUser) return UI.showToast("Vui lòng đăng nhập trước!", "warning");
    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div style="background: linear-gradient(135deg, #0284c7, #38bdf8); color: white; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
            ${Icons.render('key', { size: 18, color: '#fff' })}
          </div>
          <div>
            <h3 style="font-weight: 800; font-size: 1.15rem; color: var(--text-main); margin: 0;">${isForcedDefault ? 'Đặt Mật Khẩu Cá Nhân Lần Đầu' : 'Đổi Mật Khẩu'}</h3>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${this.currentUser.Name} (${this.currentUser.Email})</div>
          </div>
        </div>
        ${isForcedDefault ? '' : '<button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>'}
      </div>

      ${isForcedDefault ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 0.65rem 0.85rem; margin-bottom: 1rem; font-size: 0.8rem; color: #92400e;">
          🔒 Tài khoản của bạn đang dùng mật khẩu mặc định <strong>123456</strong>. Vui lòng đổi sang mật khẩu riêng tối thiểu 6 ký tự trước khi bắt đầu làm việc!
        </div>
      ` : ''}

      <form onsubmit="event.preventDefault(); App.handleChangePassword();">
        <div class="form-group" style="margin-bottom: 0.85rem;">
          <label class="form-label" style="font-size: 0.82rem; font-weight: 600;">Mật khẩu hiện tại (*)</label>
          <input type="password" id="change-pass-old" class="form-control" value="${isForcedDefault ? '123456' : ''}" placeholder="Nhập mật khẩu hiện tại" required style="padding: 0.65rem 0.85rem;" />
        </div>
        <div class="form-group" style="margin-bottom: 0.85rem;">
          <label class="form-label" style="font-size: 0.82rem; font-weight: 600;">Mật khẩu mới (*)</label>
          <input type="password" id="change-pass-new" class="form-control" placeholder="Tối thiểu 6 ký tự (khác 123456)" minlength="6" required style="padding: 0.65rem 0.85rem;" />
        </div>
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" style="font-size: 0.82rem; font-weight: 600;">Xác nhận mật khẩu mới (*)</label>
          <input type="password" id="change-pass-confirm" class="form-control" placeholder="Nhập lại mật khẩu mới" minlength="6" required style="padding: 0.65rem 0.85rem;" />
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          ${isForcedDefault ? '' : '<button type="button" onclick="UI.closeModal()" class="btn-action-inline" style="padding: 0.6rem 1.1rem;">Hủy</button>'}
          <button type="submit" class="btn-action-inline" style="background: var(--primary); color: #fff; padding: 0.6rem 1.25rem; font-weight: 700; border: none; border-radius: 6px;">
            LƯU MẬT KHẨU MỚI
          </button>
        </div>
      </form>
    `;
    UI.showModal(content);
  },

  async handleChangePassword() {
    const oldPass = document.getElementById("change-pass-old").value.trim();
    const newPass = document.getElementById("change-pass-new").value.trim();
    const confirmPass = document.getElementById("change-pass-confirm").value.trim();

    if (!oldPass || !newPass) {
      return UI.showToast("Vui lòng điền đầy đủ thông tin!", "danger");
    }
    if (newPass.length < 6) {
      return UI.showToast("Mật khẩu mới phải có tối thiểu 6 ký tự!", "danger");
    }
    if (newPass === "123456") {
      return UI.showToast("Mật khẩu mới không được trùng mật khẩu mặc định 123456!", "danger");
    }
    if (newPass !== confirmPass) {
      return UI.showToast("Mật khẩu xác nhận không trùng khớp!", "danger");
    }

    UI.showLoading("Đang cập nhật mật khẩu...");
    const res = await ApiService.changePassword(this.currentUser.UserID, oldPass, newPass);
    UI.hideLoading();

    if (res && res.success) {
      if (res.token && this.currentUser) {
        this.saveAuthSession(this.currentUser, res.token, res.expiresAt);
        await this.applyUserRole(this.currentUser);
      }
      UI.closeModal();
      UI.showToast(res.message || "Đổi mật khẩu thành công! Đã làm mới Token 3 ngày.", "success");
    } else {
      UI.showToast((res && res.message) || "Không thể đổi mật khẩu. Vui lòng kiểm tra lại mật khẩu cũ!", "danger");
    }
  }
};

window.addEventListener("DOMContentLoaded", () => {
  App.init();
});
