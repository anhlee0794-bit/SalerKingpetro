/**
 * APPLICATION BOOTSTRAPPER & UI CONTROLLER
 * Coordinates role switching, responsive viewports, modals, and toasts.
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
  users: [
    { UserID: "USR-002", Name: "Nguyễn Văn A", Email: "sales.a@company.com", Role: "SALES", Team: "North Team" },
    { UserID: "USR-003", Name: "Trần Thị B", Email: "sales.b@company.com", Role: "SALES", Team: "North Team" },
    { UserID: "USR-001", Name: "Quản Lý Nguyễn", Email: "manager@company.com", Role: "MANAGER", Team: "North Team" },
    { UserID: "USR-000", Name: "Admin Hệ Thống", Email: "admin@company.com", Role: "ADMIN", Team: "HQ" }
  ],
  currentUser: null,

  async init() {
    UI.init();

    // Default to Sales rep A
    this.currentUser = this.users[0];

    this.renderRoleSwitcher();
    await this.applyUserRole(this.currentUser);
  },

  renderRoleSwitcher() {
    const bar = document.getElementById("role-switcher-container");
    if (!bar) return;

    bar.innerHTML = `
      <div class="role-switcher-bar">
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
            ${Icons.render('user', { size: 16 })} <strong>Tài khoản Demo:</strong>
          </span>
          <select id="user-role-select" onchange="App.onUserSelectChange(this.value)">
            ${this.users.map(u => `<option value="${u.UserID}" ${u.UserID === this.currentUser.UserID ? 'selected' : ''}>${u.Name} (${u.Role})</option>`).join("")}
          </select>
        </div>

        <div id="admin-tools-group" class="restricted-admin-tool" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <button class="restricted-admin-tool" onclick="App.openSettingsDialog()" style="display: inline-flex; align-items: center; gap: 0.4rem;">
            ${Icons.render('settings', { size: 14 })} Cấu Hình Google Apps Script
          </button>
          <button class="restricted-admin-tool" onclick="App.simulateMovement()" title="Mô phỏng thay đổi trạng thái GPS di chuyển" style="display: inline-flex; align-items: center; gap: 0.4rem;">
            ${Icons.render('zap', { size: 14 })} Test Di Chuyển
          </button>
          <button class="restricted-admin-tool" onclick="App.resetMockData()" style="background: #991b1b; display: inline-flex; align-items: center; gap: 0.4rem;">
            ${Icons.render('rotate-ccw', { size: 14 })} Reset Data
          </button>
        </div>
      </div>
    `;
  },

  async onUserSelectChange(userId) {
    const found = this.users.find(u => u.UserID === userId);
    if (found) {
      await this.applyUserRole(found);
    }
  },

  async applyUserRole(user) {
    this.currentUser = user;

    // Update Header
    document.getElementById("current-user-name").innerText = user.Name;
    const roleBadge = document.getElementById("current-user-role-badge");
    roleBadge.innerText = user.Role;
    roleBadge.className = `role-pill role-${user.Role.toLowerCase()}`;

    // Toggle restricted admin tools based on role.
    // If the group element is missing (e.g. role-switcher was re-rendered),
    // rebuild the switcher bar first.
    let adminToolsGroup = document.getElementById("admin-tools-group");
    if (!adminToolsGroup) {
      this.renderRoleSwitcher();
      adminToolsGroup = document.getElementById("admin-tools-group");
    }
    const isAdminOrManager = user.Role === "MANAGER" || user.Role === "ADMIN";
    if (adminToolsGroup) {
      adminToolsGroup.style.display = isAdminOrManager ? "flex" : "none";
    }

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
            ${Icons.render('alert-triangle', { size: 20, color: '#dc2626' })} Lỗi khởi tạo giao diện Manager.
          </div><br/>
          <small>${err.message || err}</small><br/><br/>
          <button onclick="App.applyUserRole(App.currentUser)" style="padding:0.5rem 1rem;border-radius:6px;border:none;background:var(--primary,#6366f1);color:#fff;cursor:pointer;font-weight:600;">Thử lại</button>
        </div>`;
      }
    }
  },

  openSettingsDialog() {
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
    // 1. Determine target coordinates (default: Đại lý Tạp Hóa Minh Phát: 10.7685, 106.6892)
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

    // 2. Enable Mock GPS mode in GeoService (overrides navigator.geolocation with accuracy: 10m)
    GeoService.enableMockGps({
      lat: targetLat,
      lng: targetLng,
      accuracy: 10,
      name: targetName
    });

    // 3. Update active session & GPS logs
    const salesId = (this.currentUser && this.currentUser.Role === "SALES")
      ? this.currentUser.UserID
      : ((typeof ManagerApp !== "undefined" && ManagerApp.selectedSalesId && ManagerApp.selectedSalesId !== "ALL") ? ManagerApp.selectedSalesId : "USR-002");

    if (typeof ApiService !== "undefined") {
      try {
        const db = (typeof MockDatabase !== "undefined") ? MockDatabase.getDB() : null;
        if (db) {
          const session = (db.WORK_SESSIONS || []).find(s => s.SalesID === salesId && s.Status === "WORKING");
          if (session) {
            ApiService.recordGps(
              session.SessionID,
              salesId,
              targetLat,
              targetLng,
              10,
              0,
              "STATIONARY"
            ).catch(err => console.warn("[App.simulateMovement] recordGps error:", err));
          }
        }
      } catch (err) {
        console.warn("[App.simulateMovement] MockDatabase log error:", err);
      }
    }

    // 4. Refresh UI view
    if (this.currentUser && this.currentUser.Role === "SALES" && typeof SalesApp !== "undefined") {
      if (typeof SalesApp.render === "function") {
        SalesApp.render();
      }
      // If customer picker modal is currently open, refresh it so distance reflects 0.00 km immediately
      const modalOverlay = document.getElementById("modal-overlay");
      if (modalOverlay && modalOverlay.classList.contains("active")) {
        const modalHeader = document.querySelector(".modal-content h3");
        if (modalHeader && modalHeader.innerText.includes("Chọn Khách Hàng")) {
          SalesApp.showCustomerPickerModal();
        }
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

    // 5. User Feedback: Show toast
    UI.showToast(`Đã kích hoạt GPS giả lập tại ${targetName} (${targetLat.toFixed(4)}, ${targetLng.toFixed(4)})`, "success");
  },

  resetMockData() {
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
