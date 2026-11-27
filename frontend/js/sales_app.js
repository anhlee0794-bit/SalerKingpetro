/**
 * SALES MOBILE APP CONTROLLER
 * Powers the fast, simple, touch-optimized mobile experience for field reps.
 */

const SalesApp = {
  currentUser: null,
  activeSession: null,
  activeVisit: null,
  customers: [],
  visitTimerInterval: null,
  visitSeconds: 0,
  settings: {},
  searchQuery: "",
  activeFilter: "ALL", // "ALL", "DUE", "ON_TRACK"
  salesSubView: "route", // "route" | "my_stats"
  mySummary: null,
  careOrderItems: [],
  carePhotoBase64: "",
  lastTraccarPing: null,

  async init(user) {
    this.currentUser = user;
    console.log("[SalesApp] Initializing for user:", user.Name);

    // Fetch system settings
    const settingsRes = await ApiService.getSettings();
    this.settings = (settingsRes && settingsRes.settings) || {
      GPS_INTERVAL: 5,
      CUSTOMER_RADIUS: 200,
      MOVING_SPEED_THRESHOLD: 1.2,
      STATIONARY_DISTANCE_THRESHOLD: 30,
      GPS_ACCURACY_LIMIT: 80,
      DWELL_RADIUS: 30,
      DWELL_THRESHOLD_MINUTES: 5
    };

    // Sync live product catalog from MySQL backend
    ApiService.getProducts(null, "ACTIVE").catch(() => {});
    // Check if user already has an active working session
    await this.refreshSessionState();
    // Load assigned customers
    await this.loadCustomers();
    // Render the initial UI
    this.render();
  },

  parseSafeDate(dtStr) {
    if (!dtStr) return new Date();
    return new Date(String(dtStr).replace(" ", "T"));
  },

  async refreshSessionState() {
    const res = await ApiService.getActiveSession(this.currentUser.UserID);
    if (res && res.offline && this.activeSession) {
      // Mất mạng tạm thời khi đã có phiên trên RAM -> Giữ nguyên ca làm việc, không tự ngắt ca
      return;
    }

    if (res && res.traccarDeviceId && this.currentUser) {
      this.currentUser.TraccarDeviceID = res.traccarDeviceId;
      this.currentUser.TraccarServerUrl = res.traccarServerUrl || "https://hiepphucduc.vn/saler/api/traccar.php";
    }
    this.lastTraccarPing = (res && res.lastTraccarPing) || null;

    if (res && res.success && res.session) {
      this.activeSession = res.session;
      // Chuẩn hóa đồng nhất chữ hoa/thường cho SessionID
      if (!this.activeSession.SessionID && this.activeSession.sessionId) {
        this.activeSession.SessionID = this.activeSession.sessionId;
      }
      if (!this.activeSession.CheckInTime && this.activeSession.checkInTime) {
        this.activeSession.CheckInTime = this.activeSession.checkInTime;
      }

      // If working, resume GPS tracking
      if (!GeoService.isTracking) {
        this.startGpsTracking();
      }

      // Khôi phục lượt ghé thăm đang diễn ra trực tiếp từ MySQL API (chỉ đọc MockDatabase khi bật chế độ Demo)
      if (res.activeVisit) {
        this.activeVisit = res.activeVisit;
        if (!this.activeVisit.VisitID && this.activeVisit.visitId) {
          this.activeVisit.VisitID = this.activeVisit.visitId;
        }
        this.startVisitTimer(this.parseSafeDate(this.activeVisit.CheckInTime || this.activeVisit.checkInTime));
      } else if (ApiService.isMockMode()) {
        const db = MockDatabase.getDB();
        const visit = db.VISITS.find(v => v.SessionID === this.activeSession.SessionID && v.Status === "IN_PROGRESS");
        if (visit) {
          this.activeVisit = visit;
          this.startVisitTimer(this.parseSafeDate(visit.CheckInTime));
        }
      } else {
        this.activeVisit = null;
        this.stopVisitTimer();
      }
    } else if (res && res.success) {
      this.activeSession = null;
      this.activeVisit = null;
      GeoService.stopTracking();
      this.stopVisitTimer();
    }
  },

  renderOfflineBannerHtml() {
    const isOffline = (typeof navigator !== "undefined" && navigator.onLine === false);
    const pendingCount = (typeof ApiService.getOfflineQueueCount === "function") ? ApiService.getOfflineQueueCount() : 0;
    if (!isOffline && pendingCount === 0) return "";

    const bgColor = isOffline ? "#fffbeb" : "#eff6ff";
    const borderColor = isOffline ? "#f59e0b" : "#3b82f6";
    const textColor = isOffline ? "#92400e" : "#1e40af";
    const statusTitle = isOffline
      ? `Đang ngoại tuyến (Mất sóng 4G/WiFi)`
      : `Đã có sóng mạng trở lại`;
    const subText = pendingCount > 0
      ? `Có <strong>${pendingCount}</strong> thao tác đang chờ đồng bộ lên máy chủ.`
      : `Bạn vẫn có thể ghi nhận chăm sóc; dữ liệu sẽ tự lưu vào bộ nhớ máy.`;

    return `
      <div id="sales-offline-banner" style="background: ${bgColor}; border: 1px solid ${borderColor}; border-left: 4px solid ${borderColor}; border-radius: 10px; padding: 0.7rem 0.9rem; margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
        <div style="font-size: 0.8rem; color: ${textColor}; line-height: 1.35;">
          <div style="font-weight: 800; display: flex; align-items: center; gap: 0.35rem;">
            ${Icons.render('alert-triangle', { size: 14, color: textColor })} ${statusTitle}
          </div>
          <div>${subText}</div>
        </div>
        ${pendingCount > 0 ? `
          <button onclick="SalesApp.syncOfflineNow()" style="padding: 0.38rem 0.7rem; border-radius: 6px; border: none; background: ${borderColor}; color: #fff; font-size: 0.76rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem;">
            ${Icons.render('refresh-cw', { size: 12, color: '#fff' })} Đồng bộ (${pendingCount})
          </button>
        ` : ""}
      </div>
    `;
  },

  updateOfflineBanner() {
    const wrapper = document.getElementById("sales-offline-banner-slot");
    if (wrapper) {
      wrapper.innerHTML = this.renderOfflineBannerHtml();
    }
  },

  async syncOfflineNow() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return UI.showToast("Thiết bị chưa có kết nối mạng 4G/WiFi. Hệ thống sẽ tự gửi ngay khi có sóng!", "warning");
    }
    UI.showLoading("Đang đẩy dữ liệu ngoại tuyến lên máy chủ...");
    const res = await ApiService.flushOfflineQueue();
    UI.hideLoading();
    this.updateOfflineBanner();
    if (res.synced === 0 && res.remaining > 0) {
      UI.showToast("Chưa thể kết nối máy chủ, vui lòng thử lại khi sóng ổn định hơn.", "warning");
    }
  },

  async loadCustomers() {
    const res = await ApiService.getCustomers(this.currentUser.UserID, "SALES");
    if (res && res.success) {
      this.customers = res.customers || [];
    }
  },

  async switchSalesSubView(view) {
    if (typeof App !== "undefined" && typeof App.closeMobileNav === "function") {
      App.closeMobileNav();
    }
    this.salesSubView = view;
    if (view === "my_stats") {
      UI.showLoading("Đang tải kết quả cá nhân...");
      const res = await ApiService.getSalesMySummary(this.currentUser.UserID);
      UI.hideLoading();
      if (res && res.success) {
        this.mySummary = res;
      }
    }
    this.render();
  },

  renderSalesSidebarHtml() {
    const uName = (this.currentUser && this.currentUser.Name) || "Sales Rep";
    const isCollapsed = typeof App !== "undefined" && App.sidebarCollapsed;
    const dueCnt = (this.customers || []).filter(c => c.CareStatus === "OVERDUE" || c.CareStatus === "DUE_SOON").length;

    return `
      <aside class="app-vertical-sidebar sales-vertical-sidebar" aria-label="Menu điều hướng Sales">
        <div class="sidebar-mobile-header">
          <div style="display: flex; align-items: center; gap: 0.6rem; min-width: 0;">
            <div class="sidebar-avatar">${uName.charAt(0).toUpperCase()}</div>
            <div style="min-width: 0;">
              <div style="font-weight: 800; font-size: 0.92rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${uName}</div>
              <span class="role-pill role-sales" style="font-size: 0.66rem; padding: 0.12rem 0.45rem;">SALES</span>
            </div>
          </div>
          <button type="button" class="sidebar-mobile-close" onclick="App.closeMobileNav()" aria-label="Đóng menu">
            ${Icons.render('x', { size: 18 })}
          </button>
        </div>

        <nav class="sidebar-nav-scroll">
          <div class="sidebar-nav-group">
            <div class="sidebar-group-title">ĐI TUYẾN THỊ TRƯỜNG</div>
            <button type="button" class="sidebar-nav-item ${this.salesSubView === 'route' ? 'active' : ''}" onclick="SalesApp.switchSalesSubView('route')" title="Tuyến Đi Hôm Nay">
              <span class="sidebar-item-icon">${Icons.render('map-pin', { size: 19 })}</span>
              <span class="sidebar-item-label">Tuyến Đi Hôm Nay</span>
            </button>
            <button type="button" class="sidebar-nav-item ${this.salesSubView === 'my_stats' ? 'active' : ''}" onclick="SalesApp.switchSalesSubView('my_stats')" title="Kết Quả Của Tôi">
              <span class="sidebar-item-icon">${Icons.render('bar-chart-3', { size: 19 })}</span>
              <span class="sidebar-item-label">Kết Quả Của Tôi</span>
            </button>
          </div>

          <div class="sidebar-nav-group">
            <div class="sidebar-group-title">THAO TÁC NHANH</div>
            <button type="button" class="sidebar-nav-item" onclick="App.closeMobileNav(); SalesApp.showCareDueModal('ALL_DUE')" title="Khách Cần Chăm Sóc">
              <span class="sidebar-item-icon">${Icons.render('alert-circle', { size: 19 })}</span>
              <span class="sidebar-item-label">Khách Cần Chăm (${dueCnt})</span>
            </button>
            <button type="button" class="sidebar-nav-item" onclick="App.closeMobileNav(); SalesApp.showCreateProspectModal()" title="Thêm Điểm Bán Mới">
              <span class="sidebar-item-icon">${Icons.render('plus-circle', { size: 19 })}</span>
              <span class="sidebar-item-label">Thêm Điểm Bán Mới</span>
            </button>
            <button type="button" class="sidebar-nav-item" onclick="App.closeMobileNav(); App.showTraccarSetupModal(SalesApp.currentUser, SalesApp.lastTraccarPing)" title="Cài GPS chạy ngầm khi tắt màn hình">
              <span class="sidebar-item-icon">${Icons.render('navigation', { size: 19 })}</span>
              <span class="sidebar-item-label">GPS Ngầm (Tắt Máy)</span>
            </button>
          </div>
        </nav>

        <div class="sidebar-footer">
          <button type="button" class="sidebar-collapse-btn" onclick="App.toggleSidebarNav()" title="Thu gọn / Mở rộng thanh menu">
            <span class="sidebar-collapse-btn-inner">
              ${isCollapsed ? Icons.render('chevron-right', { size: 17 }) : `${Icons.render('chevron-left', { size: 16 })} <span class="sidebar-item-label">Thu gọn menu</span>`}
            </span>
          </button>
          <div class="sidebar-mobile-actions">
            <button type="button" class="sidebar-mobile-action-btn" onclick="App.closeMobileNav(); App.showChangePasswordModal();">
              🔑 Đổi mật khẩu
            </button>
            <button type="button" class="sidebar-mobile-action-btn danger" onclick="App.closeMobileNav(); App.logout();">
              🚪 Đăng xuất
            </button>
          </div>
        </div>
      </aside>
    `;
  },

  renderSalesTopTabsHtml() {
    const activeTitle = this.salesSubView === "my_stats" ? "Kết Quả Của Tôi" : "Tuyến Đi Hôm Nay";
    const activeIcon = this.salesSubView === "my_stats" ? "bar-chart-3" : "map-pin";
    return `
      <div class="mobile-current-tab-bar" onclick="App.toggleSidebarNav()">
        <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 700; color: var(--primary); font-size: 0.9rem;">
          ${Icons.render(activeIcon, { size: 17 })}
          <span>${activeTitle}</span>
        </div>
        <span class="mobile-tab-switch-hint">
          ${Icons.render('menu', { size: 14 })} Đổi mục
        </span>
      </div>
    `;
  },

  renderMyStatsBodyHtml() {
    const sum = this.mySummary || { dailyTarget: 8, today: { visits: 0, orderQty: 0, orderRevenue: 0, distributed: 0 }, month: { visits: 0, orderQty: 0, orderRevenue: 0, distributed: 0 }, recentVisits: [] };
    const t = sum.today || {};
    const m = sum.month || {};
    const dailyTarget = Math.max(1, Number(sum.dailyTarget || 8));
    const pctToday = Math.min(100, Math.round(((t.visits || 0) / dailyTarget) * 100));
    const recent = sum.recentVisits || [];

    const recentHtml = recent.map(v => {
      let geoPill = `<span style="font-size: 0.7rem; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 4px;">Không GPS</span>`;
      if (v.DistanceToCustomer !== null && v.DistanceToCustomer !== undefined) {
        const dTxt = v.DistanceToCustomer >= 1000 ? `${(v.DistanceToCustomer / 1000).toFixed(2)} km` : `${v.DistanceToCustomer}m`;
        geoPill = Number(v.IsWithinGeofence) === 1
          ? `<span style="font-size: 0.7rem; color: #15803d; background: #dcfce7; padding: 1px 6px; border-radius: 4px; font-weight: 700;">Đúng vị trí (${dTxt})</span>`
          : `<span style="font-size: 0.7rem; color: #c2410c; background: #ffedd5; padding: 1px 6px; border-radius: 4px; font-weight: 700;">Cách ${dTxt}</span>`;
      }
      return `
        <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem; margin-bottom: 0.6rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
            <strong style="font-size: 0.9rem; color: var(--text-main);">${v.CustomerName || v.CustomerID}</strong>
            ${geoPill}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
            ${String(v.CheckInTime || "").replace("T", " ").substring(0, 16)} • Thời lượng: <strong>${v.Duration || 1} phút</strong> • KQ: <strong style="color: #059669;">${v.Result || '--'}</strong>
          </div>
          <div style="font-size: 0.78rem; margin-top: 0.35rem; display: flex; gap: 0.65rem; flex-wrap: wrap; color: #1e40af;">
            <span>Đơn mới: <strong>+${v.NewOrderQty || 0} ${v.NewOrderUnit || 'Thùng'}</strong>${v.OrderTotalAmount > 0 ? ` (${Number(v.OrderTotalAmount).toLocaleString('vi-VN')}đ)` : ''}</span>
            <span>Giao: <strong>${v.DistributedQty || 0} ${v.DistributedUnit || 'Thùng'}</strong></span>
            ${v.PhotoUrl ? `<button type="button" onclick="UI.showPhotoLightbox('${v.PhotoUrl}', '${String(v.CustomerName || v.CustomerID || '').replace(/'/g, "\\'")}')" style="border: 1px solid #ddd6fe; background: #f5f3ff; color: #6d28d9; border-radius: 5px; padding: 1px 7px; font-size: 0.74rem; font-weight: 700; cursor: pointer;">📷 Xem ảnh chụp</button>` : ''}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="card-section" style="padding: 1rem; margin-bottom: 0.75rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <strong style="font-size: 0.9rem; color: var(--text-main);">🎯 Tiến Độ Tuyến Hôm Nay</strong>
          <strong style="font-size: 0.9rem; color: var(--primary);">${t.visits || 0} / ${dailyTarget} điểm (${pctToday}%)</strong>
        </div>
        <div style="height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-bottom: 0.75rem;">
          <div style="width: ${pctToday}%; height: 100%; background: ${pctToday >= 80 ? '#10b981' : '#2563eb'};"></div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;">
          <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 0.65rem; border-radius: 8px;">
            <div style="font-size: 0.72rem; color: #047857; font-weight: 700;">ĐƠN CHỐT HÔM NAY</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #047857;">+${t.orderQty || 0} SP</div>
            <div style="font-size: 0.75rem; color: #065f46;">${Number(t.orderRevenue || 0).toLocaleString('vi-VN')} đ</div>
          </div>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 0.65rem; border-radius: 8px;">
            <div style="font-size: 0.72rem; color: #1d4ed8; font-weight: 700;">LŨY KẾ THÁNG NÀY</div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #1d4ed8;">${m.visits || 0} lượt ghé</div>
            <div style="font-size: 0.75rem; color: #1e40af;">+${m.orderQty || 0} SP • ${Number(m.orderRevenue || 0).toLocaleString('vi-VN')} đ</div>
          </div>
        </div>
      </div>

      <div style="font-weight: 700; font-size: 0.9rem; margin: 0.75rem 0 0.5rem 0; color: var(--text-main);">
        🕒 Lịch Sử Chăm Sóc Gần Nhất Của Bạn (${recent.length})
      </div>
      ${recentHtml || '<div style="text-align: center; padding: 1.5rem; color: var(--text-muted); background: var(--bg-card); border-radius: 8px; border: 1px dashed var(--border);">Bạn chưa có lượt chăm sóc nào hoàn tất.</div>'}
    `;
  },

  render() {
    const container = document.getElementById("sales-view-container");
    if (!container) return;

    const todayStr = new Intl.DateTimeFormat("vi-VN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(new Date());

    if (this.salesSubView === "my_stats") {
      container.innerHTML = `
        <div class="app-shell-layout sales-shell-layout">
          ${this.renderSalesSidebarHtml()}
          <div class="app-main-content">
            <div class="sales-mobile-container">
              <div id="sales-offline-banner-slot">${this.renderOfflineBannerHtml()}</div>
              ${this.renderSalesTopTabsHtml()}
              ${this.renderMyStatsBodyHtml()}
            </div>
          </div>
        </div>
      `;
      if (typeof App !== "undefined" && typeof App.updateNavToggleIcon === "function") App.updateNavToggleIcon();
      return;
    }

    if (!this.activeSession) {
      // ----------------------------------------------------
      // STATE: CHƯA BẮT ĐẦU
      // ----------------------------------------------------
      const overdueList = this.customers.filter(c => c.CareStatus === "OVERDUE");
      const dueSoonList = this.customers.filter(c => c.CareStatus === "DUE_SOON");

      container.innerHTML = `
        <div class="app-shell-layout sales-shell-layout">
          ${this.renderSalesSidebarHtml()}
          <div class="app-main-content">
            <div class="sales-mobile-container">
              <div id="sales-offline-banner-slot">${this.renderOfflineBannerHtml()}</div>
              ${this.renderSalesTopTabsHtml()}
              <div class="greeting-card">
            <div class="greeting-text">
              <h2>Xin chào, ${this.currentUser.Name}</h2>
              <div class="date-text">Hôm nay: ${todayStr}</div>
            </div>
            <span class="role-pill role-sales">SALES</span>
          </div>

          <div class="status-hero-card status-not-started">
            <div class="status-hero-label">TRẠNG THÁI</div>
            <div class="status-hero-value" style="color: #64748b;">CHƯA BẮT ĐẦU</div>
            <p style="font-size: 0.9rem; color: var(--text-muted); max-width: 320px;">
              Bấm nút bên dưới để bắt đầu ca làm việc và bật định vị GPS.
            </p>
          </div>

          <button id="btn-start-work" class="btn-action-large btn-start-work">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            BẮT ĐẦU LÀM
          </button>

          <!-- Quick Access Cards for Customer Care Priorities -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.5rem;">
            <div class="card-section" style="padding: 1rem; cursor: pointer; border-left: 4px solid #ef4444;" onclick="SalesApp.showCareDueModal('OVERDUE')">
              <div style="font-size: 0.75rem; font-weight: 700; color: #ef4444; text-transform: uppercase; display: inline-flex; align-items: center; gap: 0.35rem;">
                ${Icons.render('alert-circle', { size: 14 })} Khách Quá Hạn
              </div>
              <div style="font-size: 1.5rem; font-weight: 800; color: #ef4444;">${overdueList.length}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Cần chăm sóc ngay</div>
            </div>

            <div class="card-section" style="padding: 1rem; cursor: pointer; border-left: 4px solid #f59e0b;" onclick="SalesApp.showCareDueModal('DUE_SOON')">
              <div style="font-size: 0.75rem; font-weight: 700; color: #d97706; text-transform: uppercase; display: inline-flex; align-items: center; gap: 0.35rem;">
                ${Icons.render('clock', { size: 14 })} Sắp Đến Hạn
              </div>
              <div style="font-size: 1.5rem; font-weight: 800; color: #d97706;">${dueSoonList.length}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Trong chu kỳ</div>
            </div>
          </div>
            </div>
          </div>
        </div>
      `;

      if (typeof App !== "undefined" && typeof App.updateNavToggleIcon === "function") App.updateNavToggleIcon();
      document.getElementById("btn-start-work").onclick = () => this.handleStartWork();
    } else {
      // ----------------------------------------------------
      // STATE: ĐANG LÀM VIỆC (WORKING SHIFT)
      // Bao gồm:
      // 1. Header ca làm việc (báo trạng thái Online / Đang tại điểm bán)
      // 2. Spotlight card: Nổi bật cửa hàng đang thăm (nếu có activeVisit)
      // 3. Mini summary stats (Quá hạn / Sắp đến hạn / Tổng tuyến)
      // 4. DANH SÁCH CỬA HÀNG TRỰC TIẾP TRÊN MÀN HÌNH (Search, Filter, Actions)
      // 5. Nút kết thúc ca làm việc
      // ----------------------------------------------------
      const startTimeStr = this.activeSession.CheckInTime ? this.activeSession.CheckInTime.substring(11, 16) : "08:00";
      const overdueCount = this.customers.filter(c => c.CareStatus === "OVERDUE").length;
      const dueSoonCount = this.customers.filter(c => c.CareStatus === "DUE_SOON").length;
      const onTrackCount = this.customers.filter(c => c.CareStatus === "ON_TRACK").length;
      const needCareCount = overdueCount + dueSoonCount;

      // Check active visit spotlight
      let activeVisitHtml = "";
      if (this.activeVisit) {
        const cust = this.customers.find(c => c.CustomerID === this.activeVisit.CustomerID);
        const custName = cust ? cust.CustomerName : (this.activeVisit.CustomerName || "Khách hàng");
        const custType = cust ? (cust.CustomerType || "NORMAL") : "NORMAL";
        const typeLabel = { VIP: "VIP", NORMAL: "Thường", SMALL: "Nhỏ" }[custType] || custType;
        const custAddress = cust ? cust.Address : "";

        activeVisitHtml = `
          <div class="visit-active-box" style="padding: 1.25rem 1.5rem; text-align: center; border: 2px solid #7c3aed; background: linear-gradient(180deg, #faf5ff 0%, #eff6ff 100%);">
            <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: #6d28d9; letter-spacing: 0.06em; margin-bottom: 0.35rem; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
              ${Icons.render('map-pin', { size: 14, color: '#6d28d9' })} Đang có mặt tại điểm bán (${typeLabel})
            </div>
            <div style="font-size: 1.45rem; font-weight: 800; color: var(--text-main); line-height: 1.25; margin-bottom: 0.25rem;">
              ${custName}
            </div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.85rem;">
              ${custAddress ? `<span>${custAddress}</span> · ` : ''}Chu kỳ: <strong>${cust ? cust.CareCycleDays : 7} ngày</strong>
            </div>

            <button id="btn-show-checkout" class="btn-action-large btn-checkout" style="padding: 0.95rem 1.25rem; font-size: 1rem;">
              ${Icons.render('file-edit', { size: 18 })} CẬP NHẬT NỘI DUNG
            </button>

            <div style="margin-top: 0.5rem;">
              <button id="btn-leave-visit" class="btn-text-subtle">
                ${Icons.render('x-circle', { size: 13 })} Bỏ qua / Rời điểm này
              </button>
            </div>
          </div>
        `;
      }

      // Filtered customers for the inline list
      let displayList = this.customers.filter(c => {
        if (this.activeFilter === "DUE") {
          if (c.CareStatus !== "OVERDUE" && c.CareStatus !== "DUE_SOON") return false;
        } else if (this.activeFilter === "ON_TRACK") {
          if (c.CareStatus !== "ON_TRACK") return false;
        }

        if (this.searchQuery && this.searchQuery.trim() !== "") {
          const q = this.searchQuery.trim().toLowerCase();
          const matchName = (c.CustomerName || "").toLowerCase().includes(q);
          const matchAddr = (c.Address || "").toLowerCase().includes(q);
          const matchPhone = (c.Phone || "").toLowerCase().includes(q);
          const matchContact = (c.ContactName || "").toLowerCase().includes(q);
          if (!matchName && !matchAddr && !matchPhone && !matchContact) return false;
        }

        return true;
      });

      // Customer Cards HTML
      const customerCardsHtml = displayList.length === 0 ? `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border);">
          ${Icons.render('search', { size: 28, color: 'var(--text-light)' })}
          <div style="margin-top: 0.5rem; font-weight: 600; font-size: 0.9rem;">Không tìm thấy cửa hàng nào</div>
          <div style="font-size: 0.8rem; margin-top: 0.2rem;">Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc</div>
        </div>
      ` : displayList.map(c => {
        const isCurrentActive = this.activeVisit && this.activeVisit.CustomerID === c.CustomerID;
        const typeKey = (c.CustomerType || "NORMAL").toLowerCase();
        const typeLabel = { VIP: "VIP", NORMAL: "Thường", SMALL: "Nhỏ" }[c.CustomerType] || c.CustomerType || "Thường";

        let statusBadge = "";
        if (c.CareStatus === "OVERDUE") {
          statusBadge = `<span class="status-pill-icon overdue">${Icons.render('alert-circle', { size: 11 })} Quá hạn ${c.DaysOverdue || ''} ngày</span>`;
        } else if (c.CareStatus === "DUE_SOON") {
          statusBadge = `<span class="status-pill-icon duesoon">${Icons.render('clock', { size: 11 })} Sắp đến hạn</span>`;
        } else if (c.CareStatus === "NEVER_VISITED") {
          statusBadge = `<span class="status-pill-icon never">${Icons.render('help-circle', { size: 11 })} Chưa chăm sóc</span>`;
        } else {
          statusBadge = `<span class="status-pill-icon ontrack">${Icons.render('check-circle', { size: 11 })} Đúng chu kỳ</span>`;
        }

        return `
          <div class="sales-customer-card ${isCurrentActive ? 'is-active-visit' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                  <span class="customer-name">${c.CustomerName}</span>
                  <span class="customer-type-tag ${typeKey}">${typeLabel}</span>
                  ${c.Status === 'PENDING_APPROVAL' ? `<span class="role-pill" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;font-size:0.68rem;padding:0.1rem 0.4rem;">Chờ QL duyệt</span>` : ''}
                  ${isCurrentActive ? `<span class="role-pill" style="background:#ede9fe;color:#6d28d9;border:1px solid #ddd6fe;font-size:0.7rem;padding:0.1rem 0.4rem;">Đang ghé</span>` : ''}
                </div>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.25rem; display: flex; align-items: flex-start; gap: 0.35rem;">
                  <span style="flex-shrink: 0; margin-top: 2px;">${Icons.render('map-pin', { size: 13, color: 'var(--text-muted)' })}</span>
                  <span style="line-height: 1.3;">${c.Address || 'Chưa cập nhật địa chỉ'}</span>
                </div>
                <div style="font-size: 0.78rem; color: var(--text-light); margin-top: 0.25rem; display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                  <span>${Icons.render('phone', { size: 12, color: 'var(--text-light)' })}</span>
                  <span>${c.ContactName ? `${c.ContactName} · ` : ''}</span>
                  <a href="tel:${c.Phone}" style="color: var(--primary); text-decoration: none; font-weight: 600;" onclick="event.stopPropagation();">${c.Phone || 'Chưa có SĐT'}</a>
                </div>
                <div style="font-size: 0.74rem; color: #475569; margin-top: 0.3rem; display: flex; gap: 0.65rem; flex-wrap: wrap;">
                  <span>📦 Tồn: <strong>${c.CurrentStock || 0} ${c.StockUnit || 'Thùng'}</strong></span>
                  <span>💰 Nợ: <strong style="color: ${(c.CurrentDebt || 0) > 0 ? '#b45309' : '#059669'};">${Number(c.CurrentDebt || 0).toLocaleString('vi-VN')}đ</strong></span>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem; flex-shrink: 0;">
                ${statusBadge}
                <span style="font-size: 0.72rem; color: var(--text-muted);">${c.CareCycleDays || 7} ngày/lần</span>
              </div>
            </div>

            <div style="border-top: 1px dashed var(--border); padding-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
              <div style="display: inline-flex; gap: 0.35rem; align-items: center;">
                <a href="${(c.Latitude && c.Longitude) ? `https://www.google.com/maps/dir/?api=1&destination=${c.Latitude},${c.Longitude}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.Address || c.CustomerName)}`}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="btn-card-action" style="text-decoration: none; font-size: 0.75rem; padding: 0.35rem 0.55rem; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;" title="Mở Google Maps dẫn đường tới đại lý">
                  ${Icons.render('navigation', { size: 12, color: '#15803d' })} Chỉ đường
                </a>
                <button class="btn-card-action" style="font-size: 0.75rem; padding: 0.35rem 0.55rem; background: var(--bg-subtle); color: var(--text-muted); border: 1px solid var(--border);" onclick="event.stopPropagation(); SalesApp.showRequestCustomerUpdateModal('${c.CustomerID}')" title="Đề xuất sửa SĐT, địa chỉ, người liên hệ">
                  ${Icons.render('pencil', { size: 12 })} Đề xuất sửa
                </button>
              </div>
              ${isCurrentActive ? `
                <button class="btn-card-action btn-card-action-primary" onclick="SalesApp.showCareCheckoutModal()">
                  ${Icons.render('file-edit', { size: 14 })} CẬP NHẬT NỘI DUNG
                </button>
              ` : `
                <button class="btn-card-action" onclick="SalesApp.openCareForCustomer('${c.CustomerID}')">
                  ${Icons.render('edit', { size: 14 })} Ghi nhận / Cập nhật
                </button>
              `}
            </div>
          </div>
        `;
      }).join("");

      container.innerHTML = `
        <div class="app-shell-layout sales-shell-layout">
          ${this.renderSalesSidebarHtml()}
          <div class="app-main-content">
            <div class="sales-mobile-container">
              <div id="sales-offline-banner-slot">${this.renderOfflineBannerHtml()}</div>
              ${this.renderSalesTopTabsHtml()}
              <!-- GREETING BAR -->
          <div class="greeting-card">
            <div class="greeting-text">
              <h2>${this.currentUser.Name}</h2>
              <div class="date-text">Hôm nay: ${todayStr}</div>
            </div>
            ${this.activeVisit
          ? `<span class="role-pill" style="background:#ede9fe;color:#6d28d9;border:1px solid #ddd6fe;">ĐANG THĂM</span>`
          : `<span class="role-pill role-sales">ONLINE</span>`
        }
          </div>

          <!-- ACTIVE VISIT SPOTLIGHT (Nếu đang tại điểm bán) -->
          ${activeVisitHtml}

          <!-- SESSION STATUS & MINI METRICS -->
          <div class="status-hero-card status-working" style="padding: 1.1rem 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div>
                <div class="status-hero-label" style="text-align: left;">CA LÀM VIỆC</div>
                <div style="font-size: 0.95rem; font-weight: 700; color: #059669; text-align: left;">
                  ĐANG HOẠT ĐỘNG (từ ${startTimeStr})
                </div>
              </div>
              <button type="button" onclick="App.showTraccarSetupModal(SalesApp.currentUser, SalesApp.lastTraccarPing)" style="border: 1px solid ${this.lastTraccarPing ? '#6ee7b7' : '#cbd5e1'}; background: ${this.lastTraccarPing ? '#ecfdf5' : '#ffffff'}; color: ${this.lastTraccarPing ? '#047857' : '#334155'}; border-radius: 999px; padding: 0.25rem 0.65rem; font-size: 0.74rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem;">
                ${Icons.render('navigation', { size: 12, color: this.lastTraccarPing ? '#059669' : '#2563eb' })}
                ${this.lastTraccarPing ? 'GPS ngầm: Đang bật' : 'Cài GPS tắt máy'}
              </button>
            </div>

            <!-- Clickable filter counters -->
            <div style="display: flex; gap: 0.75rem; margin-top: 0.65rem; width: 100%; justify-content: space-around;">
              <div style="text-align: center; cursor: pointer; flex: 1;" onclick="SalesApp.setRouteFilter('DUE')">
                <div style="font-size: 1.35rem; font-weight: 800; color: #ef4444;">${overdueCount}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Quá hạn</div>
              </div>
              <div style="width: 1px; background: var(--border);"></div>
              <div style="text-align: center; cursor: pointer; flex: 1;" onclick="SalesApp.setRouteFilter('DUE')">
                <div style="font-size: 1.35rem; font-weight: 800; color: #f59e0b;">${dueSoonCount}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Sắp hạn</div>
              </div>
              <div style="width: 1px; background: var(--border);"></div>
              <div style="text-align: center; cursor: pointer; flex: 1;" onclick="SalesApp.setRouteFilter('ALL')">
                <div style="font-size: 1.35rem; font-weight: 800; color: #10b981;">${this.customers.length}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Tổng tuyến</div>
              </div>
            </div>
          </div>

          <!-- DANH SÁCH CỬA HÀNG TRỰC TIẾP TRÊN MÀN HÌNH -->
          <div class="sales-route-section">
            <div class="sales-route-header">
              <div class="sales-route-title">
                ${Icons.render('store', { size: 19, color: 'var(--primary)' })}
                Danh Sách Cửa Hàng (${displayList.length})
              </div>
              <button class="btn-add-prospect-mini" onclick="SalesApp.showCreateProspectModal()">
                ${Icons.render('plus-circle', { size: 14 })} Thêm Điểm Mới
              </button>
            </div>

            <!-- Search box -->
            <div class="sales-search-box">
              <span class="sales-search-icon">
                ${Icons.render('search', { size: 16 })}
              </span>
              <input 
                type="text" 
                id="sales-route-search" 
                class="sales-search-input" 
                placeholder="Tìm tên cửa hàng, địa chỉ, SĐT..." 
                value="${this.searchQuery || ''}"
              />
            </div>

            <!-- Filter tabs -->
            <div class="sales-filter-tabs">
              <button 
                class="route-filter-pill ${this.activeFilter === 'ALL' ? 'active' : ''}" 
                onclick="SalesApp.setRouteFilter('ALL')">
                Tất cả (${this.customers.length})
              </button>
              <button 
                class="route-filter-pill ${this.activeFilter === 'DUE' ? 'active' : ''}" 
                onclick="SalesApp.setRouteFilter('DUE')">
                ${Icons.render('alert-circle', { size: 13 })} Cần chăm sóc (${needCareCount})
              </button>
              <button 
                class="route-filter-pill ${this.activeFilter === 'ON_TRACK' ? 'active' : ''}" 
                onclick="SalesApp.setRouteFilter('ON_TRACK')">
                ${Icons.render('check-circle', { size: 13 })} Đúng chu kỳ (${onTrackCount})
              </button>
            </div>

            <!-- Customer cards stream -->
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${customerCardsHtml}
            </div>
          </div>

          <!-- KẾT THÚC CA LÀM VIỆC -->
          <div style="margin-top: 0.75rem;">
            <button id="btn-end-work" class="btn-action-large btn-end-work" style="font-size: 0.88rem; padding: 0.85rem;">
              ${Icons.render('square', { size: 18 })} KẾT THÚC CA LÀM VIỆC
            </button>
          </div>
            </div>
          </div>
        </div>
      `;

      if (typeof App !== "undefined" && typeof App.updateNavToggleIcon === "function") App.updateNavToggleIcon();

      if (this.activeVisit) {
        const btnCheckout = document.getElementById("btn-show-checkout");
        if (btnCheckout) btnCheckout.onclick = () => this.showCareCheckoutModal();
        const btnLeave = document.getElementById("btn-leave-visit");
        if (btnLeave) btnLeave.onclick = () => this.handleLeaveVisit();
      }

      const searchInput = document.getElementById("sales-route-search");
      if (searchInput) {
        searchInput.oninput = (e) => {
          this.searchQuery = e.target.value;
          this.render();
          const updatedInput = document.getElementById("sales-route-search");
          if (updatedInput) {
            updatedInput.focus();
            const len = updatedInput.value.length;
            updatedInput.setSelectionRange(len, len);
          }
        };
      }

      const btnEndWork = document.getElementById("btn-end-work");
      if (btnEndWork) {
        btnEndWork.onclick = () => this.handleEndWork();
      }
    }
  },

  // ----------------------------------------------------
  // ACTION HANDLERS
  // ----------------------------------------------------
  async handleStartWork() {
    UI.showLoading("Đang lấy tọa độ GPS thực tế trên thiết bị...");
    try {
      let coords = null;
      try {
        coords = await GeoService.getReliablePosition(15000);
      } catch (gpsErr) {
        UI.hideLoading();
        UI.showToast(
          gpsErr.message || "Không lấy được GPS! Vui lòng bật Vị trí (Location) trên điện thoại và cho phép trình duyệt truy cập GPS trước khi Bắt đầu ca.",
          "error"
        );
        return;
      }

      const res = await ApiService.startWork(this.currentUser.UserID, coords.lat, coords.lng, coords.accuracy);
      UI.hideLoading();

      if (res && res.success) {
        this.activeSession = res.session || {
          SessionID: res.SessionID || res.sessionId,
          SalesID: this.currentUser.UserID,
          CheckInTime: res.checkInTime || new Date().toISOString(),
          Status: "WORKING"
        };
        if (!this.activeSession.SessionID && this.activeSession.sessionId) {
          this.activeSession.SessionID = this.activeSession.sessionId;
        }
        UI.showToast(
          res.queuedOffline
            ? "Đang yếu sóng 4G: Đã mở ca ngoại tuyến, sẽ tự đồng bộ khi có mạng!"
            : "Bắt đầu ca làm việc thành công! Đã bật theo dõi lộ trình & giữ sáng màn hình.",
          res.queuedOffline ? "warning" : "success"
        );
        this.startGpsTracking();
        this.render();
      } else {
        UI.showToast((res && res.message) || "Không thể bắt đầu ca.", "error");
      }
    } catch (err) {
      UI.hideLoading();
      UI.showToast(err.message, "error");
    }
  },

  startGpsTracking() {
    const intervalMinutes = Number(this.settings.GPS_INTERVAL || 5);
    const accLimit = Number(this.settings.GPS_ACCURACY_LIMIT || 80);
    GeoService.startTracking(
      intervalMinutes,
      async (updateData) => {
        if (this.activeSession) {
          const { coords, activity, isIntervalTick } = updateData;
          // Chỉ ghi lên Server khi tọa độ thực sự hợp lệ và sai số trong ngưỡng cho phép (#11)
          if (isIntervalTick && coords && (coords.lat !== 0 || coords.lng !== 0) && (!coords.accuracy || coords.accuracy <= accLimit * 1.5)) {
            await ApiService.recordGps(
              this.activeSession.SessionID,
              this.currentUser.UserID,
              coords.lat,
              coords.lng,
              coords.accuracy,
              coords.speed,
              activity
            );
          }
          this.updateActivityUI(activity, coords.accuracy);
        }
      },
      (err) => {
        console.warn("[SalesApp] GPS watch warning:", err.message);
      },
      this.settings
    );

    // Start Dwell Time engine after customers are loaded
    this.startDwellTracking();
  },

  /**
   * Activate Dwell Time engine for automatic silent check-in.
   * Calls GeoService.startDwellTracking with:
   *   - radius  : 30m (configurable via settings.DWELL_RADIUS)
   *   - threshold: 5 min (configurable via settings.DWELL_THRESHOLD_MINUTES)
   */
  startDwellTracking() {
    if (!this.activeSession || !this.customers.length) return;

    const radius = Number(this.settings.DWELL_RADIUS || 30);
    const threshold = Number(this.settings.DWELL_THRESHOLD_MINUTES || 5);

    GeoService.startDwellTracking(
      this.customers,
      { radiusMeters: radius, thresholdMinutes: threshold },

      // onDwellComplete: auto-checkin silently — no check-in button needed
      async (customer, dwellSeconds) => {
        // Skip if already in an active visit or no session
        if (this.activeVisit) return;
        if (!this.activeSession) return;

        console.log(`[SalesApp.Dwell] Auto-checkin at ${customer.CustomerName} after ${Math.round(dwellSeconds / 60)} min`);

        try {
          const visit = await this._autoCheckinCustomer(customer.CustomerID);
          if (visit) {
            // Render updated visit state
            this.render();
            // Immediately open content-update form so Sales can log notes while still on site
            setTimeout(() => {
              UI.showToast(
                `Đã ghi nhận chăm sóc tự động tại ${customer.CustomerName}. Vui lòng cập nhật nội dung!`,
                "success"
              );
              this.showCareCheckoutModal();
            }, 600);
          } else {
            console.warn("[SalesApp.Dwell] Auto-checkin returned no visit.");
          }
        } catch (e) {
          console.error("[SalesApp.Dwell] Auto-checkin error:", e);
        }
      },

      // onDwellEntered: entering geofence — silent (no UI indicator shown to Sales)
      (customer) => {
        if (this.activeVisit) return;
        console.log(`[SalesApp.Dwell] Entered geofence of ${customer.CustomerName}`);
        // Intentionally no UI shown — GPS logic is hidden from Sales view
      },

      // onDwellExited: left geofence — silent
      (customer) => {
        console.log(`[SalesApp.Dwell] Exited geofence of ${customer.CustomerName}`);
      }
    );
  },

  /**
   * Show a non-intrusive dwell countdown badge in the working UI.
   * If the working-screen element doesn't exist yet, silently skip.
   */
  showDwellIndicator(customer, thresholdMinutes) {
    const container = document.getElementById("dwell-indicator");
    if (!container) return;
    container.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 0.4rem 0.75rem; font-size: 0.82rem; color: #1d4ed8; font-weight: 600;">
        ${Icons.render('map-pin', { size: 13, color: '#1d4ed8' })}
        Đang ở ${customer.CustomerName} &mdash; Tự động ghi nhận sau ${thresholdMinutes} phút
      </div>
    `;
    container.style.display = "block";
  },

  hideDwellIndicator() {
    const container = document.getElementById("dwell-indicator");
    if (container) {
      container.style.display = "none";
      container.innerHTML = "";
    }
  },

  updateActivityUI(activity, accuracy) {
    const pill = document.getElementById("sales-activity-pill");
    if (!pill) return;

    let activityText = activity === "MOVING" ? "ĐANG DI CHUYỂN" : (activity === "STATIONARY" ? "ĐỨNG YÊN" : "KHÔNG XÁC ĐỊNH");
    if (GeoService.isMockGpsEnabled) {
      activityText = "ĐỨNG YÊN (MOCK GPS)";
    }
    pill.className = `activity-badge-pill ${activity.toLowerCase()}`;
    pill.innerHTML = `<span class="gps-indicator-dot active"></span> ${activityText}`;

    const accInfo = document.getElementById("gps-accuracy-info");
    if (accInfo && accuracy) {
      accInfo.innerText = GeoService.isMockGpsEnabled ? `Sai số: ~${Math.round(accuracy)}m (GPS giả lập)` : `Sai số: ~${Math.round(accuracy)}m`;
    }
  },

  async handleEndWork() {
    if (this.activeVisit) {
      const visitingCust = (this.customers || []).find(c => c.CustomerID === this.activeVisit.CustomerID);
      const visitingName = visitingCust ? visitingCust.CustomerName : (this.activeVisit.CustomerName || this.activeVisit.CustomerID || "điểm bán hiện tại");
      const confirmCloseOpenVisit = confirm(
        `⚠️ LƯU Ý: Bạn đang mở dở phiên ghé thăm tại "${visitingName}" và chưa bấm LƯU NỘI DUNG CHĂM SÓC!\n\n` +
        `• Bấm [Hủy / Cancel] để quay lại lưu đơn hàng & tồn kho trước.\n` +
        `• Bấm [OK] nếu bạn vẫn muốn đóng lượt ghé này và KẾT THÚC CA LÀM VIỆC ngay.`
      );
      if (!confirmCloseOpenVisit) {
        return;
      }
    } else if (!confirm("Bạn có chắc chắn muốn KẾT THÚC CA LÀM VIỆC hôm nay?")) {
      return;
    }

    UI.showLoading("Đang ghi nhận GPS kết thúc...");
    try {
      let coords = { lat: 0, lng: 0, accuracy: 0 };
      try {
        coords = await GeoService.getReliablePosition(20000);
      } catch (e) {
        // Tuyệt đối không chèn tọa độ giả Quận 1; dùng vị trí thật cuối cùng trong ca (nếu có) hoặc để rỗng (0, 0)
        coords = GeoService.lastPosition || { lat: 0, lng: 0, accuracy: 0 };
      }

      const res = await ApiService.endWork(this.activeSession.SessionID, this.currentUser.UserID, coords.lat, coords.lng, coords.accuracy);
      UI.hideLoading();

      if (res && res.success) {
        GeoService.stopTracking();
        GeoService.stopDwellTracking();
        this.hideDwellIndicator();
        this.stopVisitTimer();
        this.activeSession = null;
        this.activeVisit = null;
        const dur = res.duration !== undefined ? res.duration : (res.workDuration || 0);
        UI.showToast(
          res.queuedOffline
            ? "Đã kết thúc ca (lưu ngoại tuyến, tự gửi lên máy chủ khi có sóng)!"
            : `Đã hoàn thành ca! Tổng thời gian: ${dur} phút.`,
          res.queuedOffline ? "warning" : "success"
        );
        this.render();
      } else {
        UI.showToast(res.message || "Lỗi khi kết thúc ca.", "error");
      }
    } catch (err) {
      UI.hideLoading();
      UI.showToast(err.message, "error");
    }
  },

  setRouteFilter(filterKey) {
    this.activeFilter = filterKey;
    this.render();
  },

  async openCareForCustomer(customerId) {
    const cust = this.customers.find(c => c.CustomerID === customerId);
    if (!cust) return;

    // Bắt buộc mở ca làm việc hợp lệ trước khi ghi nhận chăm sóc điểm bán để đồng bộ trạng thái & bật GPS
    if (!this.activeSession) {
      const ok = confirm(`Bạn chưa BẮT ĐẦU CA LÀM VIỆC hôm nay.\nBấm OK để bật GPS mở ca và ghi nhận chăm sóc cho "${cust.CustomerName}" ngay!`);
      if (!ok) return;
      await this.handleStartWork();
      if (!this.activeSession) return;
    }

    if (!this.activeVisit || this.activeVisit.CustomerID !== customerId) {
      await this._autoCheckinCustomer(customerId);
    }

    this.showCareCheckoutModal(customerId);
  },

  async handleLeaveVisit() {
    if (!this.activeVisit) return;
    if (confirm("Bạn có chắc muốn rời khỏi điểm bán này mà không lưu ghi chú cập nhật?")) {
      const vid = this.activeVisit.VisitID || this.activeVisit.visitId || "";
      this.stopVisitTimer();
      this.activeVisit = null;
      ApiService.cancelVisit(vid, this.currentUser.UserID).catch(() => {});
      UI.showToast("Đã rời khỏi điểm bán", "info");
      this.render();
    }
  },

  // ----------------------------------------------------
  // CUSTOMER CHECK-IN / CHECK-OUT MODALS & WORKFLOW
  // ----------------------------------------------------
  async showCustomerPickerModal() {
    UI.showLoading("Đang tải danh sách khách hàng...");
    await this.loadCustomers();
    UI.hideLoading();

    // Build customer list — view-only, no check-in button, no distance badge
    // Tap a customer to open the content-update form if they're the active visit,
    // or simply see their contact info.
    const customerListHtml = this.customers.map(c => {
      const careStatusColors = {
        OVERDUE: { bg: '#fef2f2', border: '#ef4444', pill: 'overdue' },
        DUE_SOON: { bg: '#fffbeb', border: '#f59e0b', pill: 'duesoon' },
        NEVER_VISITED: { bg: '#f5f3ff', border: '#8b5cf6', pill: 'never' },
        ON_TRACK: { bg: 'var(--bg-card)', border: 'var(--border)', pill: 'ontrack' }
      };
      const theme = careStatusColors[c.CareStatus] || careStatusColors.ON_TRACK;

      let statusPill = '';
      if (c.CareStatus === 'OVERDUE') {
        statusPill = `<span class="status-pill-icon overdue">${Icons.render('alert-circle', { size: 11 })} Quá hạn ${c.DaysOverdue || ''}ngày</span>`;
      } else if (c.CareStatus === 'DUE_SOON') {
        statusPill = `<span class="status-pill-icon duesoon">${Icons.render('clock', { size: 11 })} Sắp đến hạn</span>`;
      } else if (c.CareStatus === 'NEVER_VISITED') {
        statusPill = `<span class="status-pill-icon never">${Icons.render('help-circle', { size: 11 })} Chưa chăm sóc</span>`;
      } else {
        statusPill = `<span class="status-pill-icon ontrack">${Icons.render('check-circle', { size: 11 })} Đúng chu kỳ</span>`;
      }

      // Tap a customer card to immediately open the content-update form
      const tapAction = `onclick="UI.closeModal(); SalesApp.openCareForCustomer('${c.CustomerID}');"`;
      const tapHint = `
        <div style="margin-top: 0.5rem; display: flex; justify-content: flex-end;">
          <button class="btn-card-action" style="font-size: 0.78rem; padding: 0.35rem 0.65rem;" onclick="event.stopPropagation(); UI.closeModal(); SalesApp.openCareForCustomer('${c.CustomerID}');">
            ${Icons.render('edit', { size: 12, color: 'var(--primary)' })} Ghi nhận / Cập nhật
          </button>
        </div>
      `;

      return `
        <div class="customer-card" style="margin-bottom: 0.75rem; background: ${theme.bg}; border-left: 4px solid ${theme.border};" ${tapAction}>
          <div class="customer-card-header">
            <div style="flex: 1; min-width: 0;">
              <div class="customer-name">${c.CustomerName}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 1px;">${c.Address}</div>
              <div style="font-size: 0.77rem; color: var(--text-light); margin-top: 2px;">LH: ${c.ContactName} · ${c.Phone}</div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem;">
              ${statusPill}
              <span style="font-size: 0.72rem; color: var(--text-muted);">${c.CareCycleDays}ngày/lần</span>
            </div>
          </div>
          ${tapHint}
        </div>
      `;
    }).join("");

    const modalContent = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <h3 style="font-weight: 700; font-size: 1.1rem; display: inline-flex; align-items: center; gap: 0.4rem;">
          ${Icons.render('map', { size: 18, color: 'var(--primary)' })} Toàn Bộ Tuyến Đường
        </h3>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-bottom: 0.75rem;">
        <button class="btn-gps-detect" onclick="SalesApp.showCreateProspectModal()">
          ${Icons.render('plus', { size: 14 })} Thêm Khách Mới
        </button>
      </div>

      <div style="max-height: 65vh; overflow-y: auto;">
        ${customerListHtml || '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Chưa có khách hàng nào được gán cho bạn.</div>'}
      </div>
    `;

    UI.showModal(modalContent);
  },

  showCreateProspectModal() {
    let coords = GeoService.lastPosition || { lat: 0, lng: 0, accuracy: 0 };

    // Truy vấn GPS thật ngầm để ghim đúng vị trí cửa hàng mới đang đứng
    GeoService.getReliablePosition(20000)
      .then(pos => {
        coords = pos;
        const latInp = document.getElementById("prospect-lat");
        const lngInp = document.getElementById("prospect-lng");
        if (latInp) latInp.value = coords.lat.toFixed(6);
        if (lngInp) lngInp.value = coords.lng.toFixed(6);
        GeoService.setMiniMapPosition(coords.lat, coords.lng, 17);
      })
      .catch(() => {});

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="font-weight: 700; font-size: 1.15rem; display: inline-flex; align-items: center; gap: 0.4rem;">
          ${Icons.render('plus-circle', { size: 18, color: 'var(--primary)' })} Thêm Khách Hàng Mới
        </h3>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div class="form-group">
        <label class="form-label">Tên Đại Lý / Cửa Hàng (*)</label>
        <input type="text" id="prospect-name" class="form-control" placeholder="Đại Lý Nhớt / Tiệm Sửa Xe..." />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;">
        <div class="form-group">
          <label class="form-label">Người Liên Hệ</label>
          <input type="text" id="prospect-contact" class="form-control" placeholder="Tên chủ tiệm" />
        </div>
        <div class="form-group">
          <label class="form-label">Số Điện Thoại (*)</label>
          <input type="text" id="prospect-phone" class="form-control" placeholder="09xxxxxxxx" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Địa Chỉ (*) — Gõ địa chỉ để tìm hoặc ghim bên dưới</label>
        <div style="display: flex; gap: 0.4rem;">
          <input
            type="text"
            id="prospect-address"
            class="form-control"
            style="flex: 1;"
            placeholder="Số nhà, tên đường, quận/huyện..."
            onkeydown="if(event.key==='Enter'){event.preventDefault(); GeoService.searchAddressForPicker({addressInputId:'prospect-address',latInputId:'prospect-lat',lngInputId:'prospect-lng',resultsBoxId:'prospect-geo-results'});}"
          />
          <button
            type="button"
            class="btn-action-inline"
            style="background: #0284c7; color: #fff; border: none; padding: 0.45rem 0.7rem; font-weight: 700; white-space: nowrap; border-radius: 6px;"
            onclick="GeoService.searchAddressForPicker({addressInputId:'prospect-address',latInputId:'prospect-lat',lngInputId:'prospect-lng',resultsBoxId:'prospect-geo-results'})"
          >
            🔍 Tìm
          </button>
        </div>
        <div id="prospect-geo-results" style="display: none; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; margin-top: 0.35rem; max-height: 140px; overflow-y: auto;"></div>
      </div>

      <div style="background: var(--bg-subtle); padding: 0.6rem; border-radius: 8px; margin-bottom: 0.85rem; border: 1px solid var(--border);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
          <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-main);">📍 Bấm / Kéo ghim vị trí điểm bán:</span>
          <button type="button" class="btn-action-inline" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;" onclick="GeoService.fillAddressFromPin('prospect-address','prospect-lat','prospect-lng')">
            📝 Lấy tên đường
          </button>
        </div>
        <div id="prospect-minimap" style="width: 100%; height: 185px; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 0.45rem; z-index: 1;"></div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;">
          <input type="number" step="any" id="prospect-lat" class="form-control" style="font-size: 0.8rem; padding: 0.35rem 0.5rem;" value="${coords.lat.toFixed(6)}" />
          <input type="number" step="any" id="prospect-lng" class="form-control" style="font-size: 0.8rem; padding: 0.35rem 0.5rem;" value="${coords.lng.toFixed(6)}" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Ghi Chú Ban Đầu</label>
        <textarea id="prospect-note" class="form-control" rows="2" placeholder="Quy mô điểm bán, nhu cầu nhập hàng..."></textarea>
      </div>

      <button id="btn-submit-prospect" class="btn-action-large btn-meet-customer" style="margin-top: 0.5rem;">
        ${Icons.render('save', { size: 16 })} LƯU ĐIỂM BÁN MỚI
      </button>
    `;

    UI.showModal(content);
    GeoService.initMiniMapPicker({
      containerId: "prospect-minimap",
      latInputId: "prospect-lat",
      lngInputId: "prospect-lng",
      addressInputId: "prospect-address",
      initialLat: coords.lat,
      initialLng: coords.lng
    });

    document.getElementById("btn-submit-prospect").onclick = async () => {
      const name = document.getElementById("prospect-name").value;
      if (!name || !name.trim()) {
        UI.showToast("Vui lòng nhập tên đại lý / cửa hàng", "warning");
        return;
      }

      const finalLat = parseFloat(document.getElementById("prospect-lat")?.value) || coords.lat;
      const finalLng = parseFloat(document.getElementById("prospect-lng")?.value) || coords.lng;

      const data = {
        CustomerName: name.trim(),
        ContactName: document.getElementById("prospect-contact").value,
        Phone: document.getElementById("prospect-phone").value,
        Address: document.getElementById("prospect-address").value,
        Latitude: finalLat,
        Longitude: finalLng,
        Note: document.getElementById("prospect-note").value
      };

      UI.showLoading("Đang gửi thông tin khách hàng...");
      const res = await ApiService.createCustomer(data, "SALES", this.currentUser.UserID);
      UI.hideLoading();

      if (res && res.success) {
        UI.closeModal();
        UI.showToast(
          res.message || "Đã gửi thông tin điểm mới!",
          res.queuedOffline ? "warning" : "success"
        );
        await this.loadCustomers();
        this.render();
      } else {
        UI.showToast(res.message || "Lỗi tạo khách hàng", "error");
      }
    };
  },

  /**
   * [INTERNAL] Check-in điểm bán với tọa độ GPS THẬT của thiết bị (không chặn khoảng cách nhưng ghi nhận trung thực 100%).
   * Tuyệt đối KHÔNG lấy tọa độ đại lý gán giả làm tọa độ Sales!
   */
  async _autoCheckinCustomer(customerId) {
    let realPos = null;
    try {
      realPos = await GeoService.getReliablePosition(20000);
    } catch (e) {
      realPos = GeoService.lastPosition || { lat: 0, lng: 0, accuracy: 0 };
    }

    if (!this.activeSession) {
      if (realPos.lat !== 0 || realPos.lng !== 0) {
        const sessRes = await ApiService.startWork(this.currentUser.UserID, realPos.lat, realPos.lng, realPos.accuracy);
        if (sessRes && sessRes.session) {
          this.activeSession = sessRes.session;
          this.startGpsTracking();
        }
      }
    }

    const arrivedIso = GeoService.getCustomerArrivalIso(customerId);
    const res = await ApiService.checkinVisit(
      this.currentUser.UserID,
      customerId,
      this.activeSession ? this.activeSession.SessionID : "",
      realPos.lat,
      realPos.lng,
      realPos.accuracy,
      arrivedIso
    );

    if (res && res.success) {
      const visitObj = res.visit || {
        VisitID: res.VisitID || res.visitId,
        SalesID: this.currentUser.UserID,
        CustomerID: customerId,
        SessionID: this.activeSession ? this.activeSession.SessionID : "",
        CheckInTime: res.checkInTime || new Date().toISOString(),
        Status: "IN_PROGRESS"
      };
      if (!visitObj.VisitID && visitObj.visitId) {
        visitObj.VisitID = visitObj.visitId;
      }
      this.activeVisit = visitObj;
      this.startVisitTimer(this.parseSafeDate(visitObj.CheckInTime || visitObj.checkInTime));
      return visitObj;
    }
    return null;
  },

  startVisitTimer(startTime) {
    this.stopVisitTimer();
    const update = () => {
      const now = new Date();
      this.visitSeconds = Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 1000));
      this.updateTimerDisplay();
    };
    update();
    this.visitTimerInterval = setInterval(update, 1000);
  },

  stopVisitTimer() {
    if (this.visitTimerInterval) {
      clearInterval(this.visitTimerInterval);
      this.visitTimerInterval = null;
    }
  },

  updateTimerDisplay() {
    const el = document.getElementById("live-visit-timer");
    if (!el) return;
    const mins = Math.floor(this.visitSeconds / 60);
    const secs = this.visitSeconds % 60;
    el.innerText = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  },

  showCareDueModal(filterType = "ALL_DUE") {
    let list = this.customers;
    if (filterType === "OVERDUE") {
      list = list.filter(c => c.CareStatus === "OVERDUE");
    } else if (filterType === "DUE_SOON") {
      list = list.filter(c => c.CareStatus === "DUE_SOON");
    } else {
      list = list.filter(c => c.CareStatus === "OVERDUE" || c.CareStatus === "DUE_SOON" || c.CareStatus === "NEVER_VISITED");
    }

    // Sort: OVERDUE first, then DUE_SOON, then NEVER_VISITED
    list.sort((a, b) => {
      const order = { "OVERDUE": 1, "DUE_SOON": 2, "NEVER_VISITED": 3, "ON_TRACK": 4 };
      return (order[a.CareStatus] || 99) - (order[b.CareStatus] || 99);
    });

    const itemsHtml = list.map(c => {
      let statusPill = `<span class="status-pill-icon overdue">${Icons.render('alert-circle', { size: 12 })} Quá hạn ${c.DaysOverdue} ngày</span>`;
      if (c.CareStatus === "DUE_SOON") {
        statusPill = `<span class="status-pill-icon duesoon">${Icons.render('clock', { size: 12 })} Sắp đến hạn (${c.DaysRemaining} ngày)</span>`;
      } else if (c.CareStatus === "NEVER_VISITED") {
        statusPill = `<span class="status-pill-icon never">${Icons.render('help-circle', { size: 12 })} Chưa từng chăm sóc</span>`;
      }


      return `
        <div class="customer-card" style="margin-bottom: 0.75rem; border-left: 4px solid ${c.BadgeColor || '#2563eb'}; cursor: pointer;" onclick="UI.closeModal(); SalesApp.openCareForCustomer('${c.CustomerID}')">
          <div class="customer-card-header">
            <div style="flex: 1; min-width: 0;">
              <div class="customer-name">${c.CustomerName}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${c.Address}</div>
              <div style="font-size: 0.78rem; color: var(--text-light); margin-top: 2px;">
                LH: ${c.ContactName} · ${c.Phone}
              </div>
              <div style="font-size: 0.77rem; color: var(--text-light); margin-top: 2px;">
                Chu kỳ: <strong>${c.CareCycleDays} ngày</strong> &nbsp;|&nbsp; Lần cuối: <strong>${c.LastCareDate ? c.LastCareDate.substring(0, 10) : 'Chưa có'}</strong>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem;">
              ${statusPill}
              <button class="btn-card-action" style="font-size: 0.75rem; padding: 0.3rem 0.6rem;" onclick="event.stopPropagation(); UI.closeModal(); SalesApp.openCareForCustomer('${c.CustomerID}')">
                ${Icons.render('edit', { size: 12 })} Ghi nhận
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #b45309; display: inline-flex; align-items: center; gap: 0.4rem;">
          ${Icons.render('alert-circle', { size: 18, color: '#b45309' })} Khách Cần Chăm Sóc (${list.length})
        </h3>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>
      <div style="font-size: 0.81rem; color: var(--text-muted); margin-bottom: 0.75rem; background: #fffbeb; padding: 0.5rem 0.65rem; border-radius: 6px; border: 1px solid #fde68a; display: flex; align-items: center; gap: 0.35rem;">
        ${Icons.render('info', { size: 14, color: '#d97706' })} <div>Bấm vào bất kỳ cửa hàng nào để mở form ghi nhận nội dung chăm sóc ngay lập tức.</div>
      </div>
      <div style="max-height: 60vh; overflow-y: auto;">
        ${itemsHtml || '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">' + Icons.render('check-circle', { size: 32, color: '#10b981' }) + '<br><br>Tuyệt vời! Không có khách nào bị quá hạn.</div>'}
      </div>
    `;

    UI.showModal(content);
  },

  handleProductSelectChange(selectEl) {
    const selOption = selectEl.options[selectEl.selectedIndex];
    const unit = selOption.getAttribute("data-unit");
    if (unit) {
      const distUnit = document.getElementById("care-dist-unit");
      const stockUnit = document.getElementById("care-stock-unit");
      const orderUnit = document.getElementById("care-order-unit");
      const reorderUnit = document.getElementById("care-reorder-unit");
      if (distUnit) distUnit.value = unit;
      if (stockUnit) stockUnit.value = unit;
      if (orderUnit) orderUnit.value = unit;
      if (reorderUnit) reorderUnit.value = unit;
      this.updateUnitConversionHint('dist');
      this.updateUnitConversionHint('stock');
      this.updateUnitConversionHint('order');
    }
  },

  updateUnitConversionHint(type) {
    let qtyInputId = "";
    let unitSelectId = "";
    let hintElId = "";

    if (type === 'dist') {
      qtyInputId = "care-dist-qty";
      unitSelectId = "care-dist-unit";
      hintElId = "care-dist-convert-hint";
    } else if (type === 'stock') {
      qtyInputId = "care-stock-qty";
      unitSelectId = "care-stock-unit";
      hintElId = "care-stock-convert-hint";
    } else if (type === 'order') {
      qtyInputId = "care-new-order";
      unitSelectId = "care-order-unit";
      hintElId = "care-order-convert-hint";
    }

    const qtyEl = document.getElementById(qtyInputId);
    const unitEl = document.getElementById(unitSelectId);
    const hintEl = document.getElementById(hintElId);
    if (!qtyEl || !unitEl || !hintEl) return;

    const qty = Number(qtyEl.value);
    const unit = unitEl.value;
    if (!qty || qty <= 0) {
      hintEl.innerHTML = "";
      return;
    }

    const conv = ProductService.calculateConversion(qty, unit);
    if (conv && conv.hint) {
      hintEl.innerHTML = `<span>${conv.hint}</span>`;
    } else {
      hintEl.innerHTML = "";
    }
  },

  // ----------------------------------------------------
  // MULTI-PRODUCT ORDER CART & SITE PHOTO HELPERS (#12, #16)
  // ----------------------------------------------------
  renderOrderCartRowsHtml() {
    if (!Array.isArray(this.careOrderItems) || this.careOrderItems.length === 0) {
      this.careOrderItems = [{ productName: "", qty: "", unit: "Thùng", unitPrice: 0, subtotal: 0 }];
    }
    const rowsHtml = this.careOrderItems.map((item, idx) => `
      <div style="background: #ffffff; border: 1px solid #a7f3d0; border-radius: 6px; padding: 0.45rem; margin-bottom: 0.45rem;">
        <div style="display: flex; gap: 0.35rem; align-items: center; margin-bottom: 0.35rem;">
          <select class="form-control" style="flex: 1; font-size: 0.78rem; padding: 0.38rem;" onchange="SalesApp.onOrderCartProductChange(${idx}, this.value)">
            ${ProductService.renderProductOptions(item.productName)}
          </select>
          ${this.careOrderItems.length > 1 ? `
            <button type="button" onclick="SalesApp.removeOrderCartRow(${idx})" style="border: none; background: #fee2e2; color: #b91c1c; border-radius: 5px; padding: 0.35rem 0.5rem; cursor: pointer; font-weight: 700;" title="Xóa dòng">&times;</button>
          ` : ''}
        </div>
        <div style="display: flex; gap: 0.35rem; align-items: center;">
          <input type="number" min="0" class="form-control" style="flex: 1; font-size: 0.8rem; padding: 0.35rem 0.5rem;" placeholder="Số lượng" value="${item.qty}" oninput="SalesApp.onOrderCartQtyOrUnitChange(${idx}, this.value, null)" />
          <select class="form-control" style="flex: 1; font-size: 0.8rem; padding: 0.35rem;" onchange="SalesApp.onOrderCartQtyOrUnitChange(${idx}, null, this.value)">
            ${ProductService.renderUnitOptions(item.unit || "Thùng")}
          </select>
          <div id="order-row-sub-${idx}" style="flex: 1.1; text-align: right; font-size: 0.78rem; font-weight: 700; color: #047857;">
            ${item.subtotal > 0 ? item.subtotal.toLocaleString("vi-VN") + "đ" : "--"}
          </div>
        </div>
      </div>
    `).join("");

    const totalAmt = this.careOrderItems.reduce((acc, it) => acc + Number(it.subtotal || 0), 0);
    const totalQty = this.careOrderItems.reduce((acc, it) => acc + (Number(it.qty) > 0 ? Number(it.qty) : 0), 0);

    return `
      ${rowsHtml}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.35rem;">
        <button type="button" onclick="SalesApp.addOrderCartRow()" style="border: 1px dashed #059669; background: #ffffff; color: #047857; border-radius: 6px; padding: 0.32rem 0.65rem; font-size: 0.76rem; font-weight: 700; cursor: pointer;">
          + Thêm mặt hàng khác
        </button>
        <div id="care-order-cart-total" style="font-size: 0.8rem; font-weight: 800; color: #065f46;">
          Tổng: ${totalQty} SP${totalAmt > 0 ? ` • ${totalAmt.toLocaleString("vi-VN")} đ` : ""}
        </div>
      </div>
    `;
  },

  refreshOrderCartUi() {
    const box = document.getElementById("care-order-cart-container");
    if (box) {
      box.innerHTML = this.renderOrderCartRowsHtml();
    }
  },

  addOrderCartRow() {
    this.careOrderItems.push({ productName: "", qty: "", unit: "Thùng", unitPrice: 0, subtotal: 0 });
    this.refreshOrderCartUi();
  },

  removeOrderCartRow(idx) {
    this.careOrderItems.splice(idx, 1);
    this.refreshOrderCartUi();
  },

  onOrderCartProductChange(idx, prodName) {
    const row = this.careOrderItems[idx];
    if (!row) return;
    row.productName = prodName;
    const prod = ProductService.getCatalog().find(p => p.name === prodName);
    if (prod && prod.defaultUnit) {
      row.unit = prod.defaultUnit;
    }
    row.unitPrice = ProductService.estimateUnitPrice(prodName, row.unit);
    row.subtotal = (Number(row.qty) > 0 ? Number(row.qty) : 0) * row.unitPrice;
    this.refreshOrderCartUi();
  },

  onOrderCartQtyOrUnitChange(idx, newQty, newUnit) {
    const row = this.careOrderItems[idx];
    if (!row) return;
    if (newQty !== null) row.qty = newQty;
    if (newUnit !== null) row.unit = newUnit;
    row.unitPrice = ProductService.estimateUnitPrice(row.productName, row.unit);
    row.subtotal = (Number(row.qty) > 0 ? Number(row.qty) : 0) * row.unitPrice;
    const subEl = document.getElementById(`order-row-sub-${idx}`);
    if (subEl) {
      subEl.innerText = row.subtotal > 0 ? row.subtotal.toLocaleString("vi-VN") + "đ" : "--";
    }
    const totalEl = document.getElementById("care-order-cart-total");
    if (totalEl) {
      const totalAmt = this.careOrderItems.reduce((acc, it) => acc + Number(it.subtotal || 0), 0);
      const totalQty = this.careOrderItems.reduce((acc, it) => acc + (Number(it.qty) > 0 ? Number(it.qty) : 0), 0);
      totalEl.innerText = `Tổng: ${totalQty} SP${totalAmt > 0 ? ` • ${totalAmt.toLocaleString("vi-VN")} đ` : ""}`;
    }
  },

  handleCarePhotoSelected(inputEl) {
    const file = inputEl && inputEl.files && inputEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        this.carePhotoBase64 = canvas.toDataURL("image/jpeg", 0.68);
        const previewBox = document.getElementById("care-photo-preview-box");
        if (previewBox) {
          previewBox.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-top: 0.45rem; background: #f8fafc; padding: 0.4rem; border-radius: 8px; border: 1px solid var(--border);">
              <img src="${this.carePhotoBase64}" alt="Preview" style="width: 68px; height: 52px; object-fit: cover; border-radius: 6px;" />
              <div style="flex: 1; font-size: 0.75rem; color: #059669; font-weight: 700;">Đã đính kèm ảnh điểm bán (đã nén tối ưu 4G)</div>
              <button type="button" onclick="SalesApp.clearCarePhoto()" style="border: none; background: #fee2e2; color: #b91c1c; border-radius: 5px; padding: 0.3rem 0.55rem; font-size: 0.72rem; cursor: pointer; font-weight: 700;">Xóa</button>
            </div>
          `;
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  },

  clearCarePhoto() {
    this.carePhotoBase64 = "";
    const inp = document.getElementById("care-photo-input");
    if (inp) inp.value = "";
    const previewBox = document.getElementById("care-photo-preview-box");
    if (previewBox) previewBox.innerHTML = "";
  },

  showCareCheckoutModal(targetCustomerId = null) {
    const custId = targetCustomerId || (this.activeVisit && this.activeVisit.CustomerID);
    const cust = this.customers.find(c => c.CustomerID === custId) || (this.customers.length > 0 ? this.customers[0] : null);
    const custName = cust ? cust.CustomerName : "Khách hàng";
    const custStockUnit = (cust && cust.StockUnit) ? cust.StockUnit : "Thùng";
    this.careOrderItems = [{ productName: "", qty: "", unit: "Thùng", unitPrice: 0, subtotal: 0 }];
    this.carePhotoBase64 = "";

    const modalContent = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: var(--text-main); display: inline-flex; align-items: center; gap: 0.4rem;">
          ${Icons.render('file-edit', { size: 18, color: 'var(--primary)' })} Cập Nhật Nội Dung Chăm Sóc
        </h3>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div style="margin-bottom: 1rem; padding: 0.6rem 0.85rem; background: var(--bg-subtle); border-radius: 8px; display: flex; align-items: center; gap: 0.5rem;">
        ${Icons.render('building-2', { size: 16, color: 'var(--primary)' })}
        <div>
          <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">Khách hàng</div>
          <div style="font-weight: 800; font-size: 1.05rem; color: var(--primary);">${custName}</div>
        </div>
      </div>

      <!-- 4-BLOCK REPORT FORM -->
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        
        <!-- BLOCK A: HÀNG HÓA & TỒN KHO -->
        <div style="border: 1px solid #bfdbfe; background: #eff6ff; padding: 0.85rem; border-radius: 8px;">
          <div style="font-weight: 700; font-size: 0.9rem; color: #1e40af; margin-bottom: 0.65rem; display: inline-flex; align-items: center; gap: 0.35rem;">
            ${Icons.render('package', { size: 16, color: '#1e40af' })} A. HÀNG HÓA & TỒN KHO
          </div>

          <!-- Product Selector -->
          <div class="form-group" style="margin-bottom: 0.65rem;">
            <label class="form-label" style="font-size: 0.78rem; font-weight: 700;">Mặt hàng chính</label>
            <select id="care-product-select" class="form-control" onchange="SalesApp.handleProductSelectChange(this)">
              ${ProductService.renderProductOptions()}
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <!-- Distribution Qty & Unit -->
            <div class="form-group" style="margin-bottom: 0.4rem;">
              <label class="form-label" style="font-size: 0.78rem;">Phân phối hôm nay</label>
              <div style="display: flex; gap: 0.35rem;">
                <input type="number" id="care-dist-qty" class="form-control" style="flex: 1.2; min-width: 0;" placeholder="SL giao" oninput="SalesApp.updateUnitConversionHint('dist')" />
                <select id="care-dist-unit" class="form-control" style="flex: 1.1; min-width: 0; padding: 0.4rem;" onchange="SalesApp.updateUnitConversionHint('dist')">
                  ${ProductService.renderUnitOptions("Thùng")}
                </select>
              </div>
              <div id="care-dist-convert-hint" style="font-size: 0.72rem; color: #1e40af; margin-top: 2px; min-height: 14px;"></div>
            </div>

            <!-- Inventory Qty & Unit -->
            <div class="form-group" style="margin-bottom: 0.4rem;">
              <label class="form-label" style="font-size: 0.78rem;">Tồn kho thực tế (*)</label>
              <div style="display: flex; gap: 0.35rem;">
                <input type="number" id="care-stock-qty" class="form-control" style="flex: 1.2; min-width: 0;" placeholder="SL còn" value="${cust ? cust.CurrentStock : ''}" oninput="SalesApp.updateUnitConversionHint('stock')" />
                <select id="care-stock-unit" class="form-control" style="flex: 1.1; min-width: 0; padding: 0.4rem;" onchange="SalesApp.updateUnitConversionHint('stock')">
                  ${ProductService.renderUnitOptions(custStockUnit)}
                </select>
              </div>
              <div id="care-stock-convert-hint" style="font-size: 0.72rem; color: #1e40af; margin-top: 2px; min-height: 14px;"></div>
            </div>
          </div>

          <!-- Reorder Need -->
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-size: 0.78rem;">Nhu cầu nhập thêm</label>
            <div style="display: flex; gap: 0.35rem;">
              <input type="text" id="care-reorder" class="form-control" style="flex: 1.6;" placeholder="Mặt hàng cần thêm..." />
              <select id="care-reorder-unit" class="form-control" style="flex: 1; padding: 0.4rem;">
                ${ProductService.renderUnitOptions("Thùng")}
              </select>
            </div>
          </div>
        </div>

        <!-- BLOCK B: CÔNG NỢ -->
        <div style="border: 1px solid #fde68a; background: #fffbeb; padding: 0.85rem; border-radius: 8px;">
          <div style="font-weight: 700; font-size: 0.9rem; color: #b45309; margin-bottom: 0.5rem; display: inline-flex; align-items: center; gap: 0.35rem;">
            ${Icons.render('wallet', { size: 16, color: '#b45309' })} B. CÔNG NỢ & THANH TOÁN
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <div class="form-group" style="margin-bottom: 0.4rem;">
              <label class="form-label" style="font-size: 0.78rem;">Công nợ hiện tại (VNĐ)</label>
              <input type="number" id="care-debt" class="form-control" placeholder="VD: 15000000" value="${cust ? cust.CurrentDebt : ''}" />
            </div>
            <div class="form-group" style="margin-bottom: 0.4rem;">
              <label class="form-label" style="font-size: 0.78rem;">Tình trạng thanh toán</label>
              <select id="care-payment-status" class="form-control">
                <option value="Chưa thanh toán">Chưa thanh toán</option>
                <option value="Đã thanh toán đủ">Đã thanh toán đủ</option>
                <option value="Thanh toán một phần">Thanh toán một phần</option>
                <option value="Gối đầu theo thỏa thuận">Gối đầu theo thỏa thuận</option>
              </select>
            </div>
          </div>
        </div>

        <!-- BLOCK C: KINH DOANH & GIỎ ĐƠN NHIỀU MẶT HÀNG -->
        <div style="border: 1px solid #a7f3d0; background: #ecfdf5; padding: 0.85rem; border-radius: 8px;">
          <div style="font-weight: 700; font-size: 0.9rem; color: #047857; margin-bottom: 0.5rem; display: inline-flex; align-items: center; gap: 0.35rem;">
            ${Icons.render('shopping-cart', { size: 16, color: '#047857' })} C. ĐƠN HÀNG MỚI CHỐT (NHIỀU MẶT HÀNG)
          </div>
          <div id="care-order-cart-container" style="margin-bottom: 0.55rem;">
            ${this.renderOrderCartRowsHtml()}
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-size: 0.78rem;">Tình hình tiêu thụ tại đại lý</label>
            <select id="care-consumption" class="form-control">
              <option value="Bình thường">Bình thường</option>
              <option value="Bán rất chạy">Bán rất chạy</option>
              <option value="Chậm">Chậm</option>
              <option value="Mùa cao điểm">Mùa cao điểm</option>
            </select>
          </div>
        </div>

        <!-- BLOCK D: CHĂM SÓC, ẢNH MINH CHỨNG & TRAO ĐỔI -->
        <div style="border: 1px solid var(--border); background: var(--bg-card); padding: 0.85rem; border-radius: 8px;">
          <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main); margin-bottom: 0.5rem; display: inline-flex; align-items: center; gap: 0.35rem;">
            ${Icons.render('message-square', { size: 16, color: '#334155' })} D. ẢNH ĐIỂM BÁN & NỘI DUNG TRAO ĐỔI
          </div>

          <div class="form-group" style="margin-bottom: 0.65rem;">
            <input type="file" id="care-photo-input" accept="image/*" capture="environment" style="display: none;" onchange="SalesApp.handleCarePhotoSelected(this)" />
            <button type="button" onclick="document.getElementById('care-photo-input').click()" style="width: 100%; padding: 0.55rem; border: 1px dashed #2563eb; background: #eff6ff; color: #1d4ed8; border-radius: 8px; font-weight: 700; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.4rem;">
              ${Icons.render('camera', { size: 16, color: '#1d4ed8' })} Chụp ảnh cửa hàng / kệ hàng thực tế
            </button>
            <div id="care-photo-preview-box"></div>
          </div>

          <div class="form-group">
            <label class="form-label" style="font-size: 0.78rem;">Kết quả chung (*)</label>
            <select id="care-result" class="form-control">
              <option value="Có nhu cầu">Có nhu cầu</option>
              <option value="Đang trao đổi">Đang trao đổi</option>
              <option value="Chờ phản hồi">Chờ phản hồi</option>
              <option value="Không có nhu cầu">Không có nhu cầu</option>
              <option value="Đã chăm sóc tốt">Đã chăm sóc tốt</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" style="font-size: 0.78rem;">Chi tiết trao đổi & Vấn đề khách phản ánh</label>
            <textarea id="care-discussion" class="form-control" rows="2" placeholder="Nội dung thảo luận, vấn đề hàng hóa, chiết khấu, đối thủ..."></textarea>
          </div>
        </div>

      </div>

      <button id="btn-submit-care" class="btn-action-large btn-checkout" style="margin-top: 1.25rem;">
        ${Icons.render('save', { size: 18 })} LƯU NỘI DUNG & HOÀN TẤT
      </button>
    `;

    UI.showModal(modalContent);

    // Initial conversion calculation for existing stock if present
    this.updateUnitConversionHint('stock');

    document.getElementById("btn-submit-care").onclick = async () => {
      const validOrderItems = (this.careOrderItems || [])
        .filter(it => it.productName && Number(it.qty) > 0)
        .map(it => ({
          productName: it.productName,
          qty: Number(it.qty),
          unit: it.unit || "Thùng",
          unitPrice: Number(it.unitPrice || 0),
          subtotal: Number(it.subtotal || 0)
        }));
      const totalOrderQty = validOrderItems.reduce((a, it) => a + it.qty, 0);
      const totalOrderAmt = validOrderItems.reduce((a, it) => a + it.subtotal, 0);
      const mainSelectedProd = document.getElementById("care-product-select") ? document.getElementById("care-product-select").value : "";
      const posNow = GeoService.lastPosition || { lat: 0, lng: 0, accuracy: 0 };

      const careData = {
        CustomerID: cust ? cust.CustomerID : "",
        Latitude: posNow.lat || 0,
        Longitude: posNow.lng || 0,
        Accuracy: posNow.accuracy || 0,
        ArrivedAt: cust ? (GeoService.getCustomerArrivalIso(cust.CustomerID) || "") : "",
        SelectedProduct: mainSelectedProd || validOrderItems.map(i => `${i.productName} (${i.qty} ${i.unit})`).join(", "),
        DistributedQty: document.getElementById("care-dist-qty").value,
        DistributedUnit: document.getElementById("care-dist-unit") ? document.getElementById("care-dist-unit").value : "Thùng",
        InventoryQty: document.getElementById("care-stock-qty").value,
        InventoryUnit: document.getElementById("care-stock-unit") ? document.getElementById("care-stock-unit").value : "Thùng",
        ReorderDemand: document.getElementById("care-reorder").value,
        ReorderUnit: document.getElementById("care-reorder-unit") ? document.getElementById("care-reorder-unit").value : "Thùng",
        RecordedDebt: document.getElementById("care-debt").value,
        PaymentStatus: document.getElementById("care-payment-status").value,
        NewOrderQty: totalOrderQty,
        NewOrderUnit: validOrderItems.length === 1 ? validOrderItems[0].unit : "SP",
        OrderItems: validOrderItems,
        OrderTotalAmount: totalOrderAmt,
        PhotoBase64: this.carePhotoBase64 || "",
        ConsumptionRate: document.getElementById("care-consumption").value,
        Result: document.getElementById("care-result").value,
        DiscussionDetails: document.getElementById("care-discussion").value,
        Note: document.getElementById("care-discussion").value
      };

      UI.showLoading("Đang lưu lịch sử chăm sóc và cập nhật chu kỳ...");
      let visitId = this.activeVisit ? (this.activeVisit.VisitID || this.activeVisit.visitId) : null;
      if (!visitId && cust) {
        const visit = await this._autoCheckinCustomer(cust.CustomerID);
        if (visit) visitId = visit.VisitID || visit.visitId;
      }
      const res = await ApiService.checkoutCareVisit(visitId || ("VIS-" + Date.now()), this.currentUser.UserID, careData);
      UI.hideLoading();

      if (res && res.success) {
        if (cust) GeoService.clearCustomerArrival(cust.CustomerID);
        this.carePhotoBase64 = "";
        UI.closeModal();
        this.stopVisitTimer();
        this.activeVisit = null;
        UI.showToast(
          res.queuedOffline
            ? "Mất sóng 4G: Nội dung chăm sóc 4 khối đã lưu vào máy và sẽ tự đồng bộ khi có mạng!"
            : "Hoàn tất chăm sóc! Lần hẹn tiếp theo đã được tự động tính.",
          res.queuedOffline ? "warning" : "success"
        );
        await this.loadCustomers();
        this.render();
      } else {
        UI.showToast((res && res.message) || "Lỗi lưu chăm sóc", "error");
      }
    };
  },

  showCheckoutModal() {
    this.showCareCheckoutModal();
  },

  // ----------------------------------------------------
  // REQUEST CUSTOMER UPDATE (APPROVAL FLOW)
  // ----------------------------------------------------
  showRequestCustomerUpdateModal(customerId) {
    const cust = (this.customers || []).find(c => c.CustomerID === customerId);
    if (!cust) return UI.showToast("Không tìm thấy khách hàng", "danger");

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div>
          <h3 style="font-weight: 800; font-size: 1.15rem; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 0.4rem;">
            ${Icons.render('file-edit', { size: 18, color: '#2563eb' })} Đề Xuất Cập Nhật Khách Hàng
          </h3>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
            Điểm bán: <strong>${cust.CustomerName}</strong> (${cust.CustomerID})
          </div>
        </div>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 0.65rem 0.85rem; margin-bottom: 1rem; font-size: 0.78rem; color: #1e40af; display: flex; align-items: flex-start; gap: 0.4rem;">
        ${Icons.render('info', { size: 16, color: '#2563eb' })}
        <div><strong>Quy trình phê duyệt (Approval Flow):</strong> Thông tin do bạn đề xuất sẽ được chuyển lên Quản lý (Manager) xem xét và phê duyệt trước khi cập nhật chính thức vào hệ thống.</div>
      </div>

      <form onsubmit="event.preventDefault(); SalesApp.submitCustomerUpdateRequest('${cust.CustomerID}');">
        <div class="form-group" style="margin-bottom: 0.65rem;">
          <label class="form-label" style="font-size: 0.78rem;">Tên điểm bán / đại lý</label>
          <input type="text" class="form-control" value="${cust.CustomerName || ''}" disabled style="background: #f1f5f9; color: #64748b;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; margin-bottom: 0.65rem;">
          <div class="form-group">
            <label class="form-label" style="font-size: 0.78rem;">Người liên hệ (*)</label>
            <input type="text" id="req-cust-contact" class="form-control" value="${cust.ContactName || ''}" required placeholder="Anh Minh / Chị Lan" />
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size: 0.78rem;">Số điện thoại (*)</label>
            <input type="tel" id="req-cust-phone" class="form-control" value="${cust.Phone || ''}" required placeholder="0912345678" />
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 0.65rem;">
          <label class="form-label" style="font-size: 0.78rem;">Địa chỉ cửa hàng (*)</label>
          <input type="text" id="req-cust-address" class="form-control" value="${cust.Address || ''}" required placeholder="Số nhà, đường, quận/huyện..." />
        </div>

        <div class="form-group" style="margin-bottom: 0.65rem;">
          <label class="form-label" style="font-size: 0.78rem;">Phân loại khách hàng</label>
          <select id="req-cust-type" class="form-control">
            <option value="VIP" ${cust.CustomerType === 'VIP' ? 'selected' : ''}>Khách Lớn / VIP (Chu kỳ 3 ngày)</option>
            <option value="NORMAL" ${cust.CustomerType === 'NORMAL' || !cust.CustomerType ? 'selected' : ''}>Khách Thường (Chu kỳ 7 ngày)</option>
            <option value="SMALL" ${cust.CustomerType === 'SMALL' ? 'selected' : ''}>Khách Nhỏ (Chu kỳ 14 ngày)</option>
          </select>
        </div>

        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label" style="font-size: 0.78rem;">Lý do / Ghi chú đề xuất thay đổi (*)</label>
          <textarea id="req-cust-reason" class="form-control" rows="2" placeholder="Ví dụ: Đại lý mới đổi số hotline, mở rộng thêm gian hàng..." required></textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button type="button" class="btn-action-inline" onclick="UI.closeModal()" style="padding: 0.5rem 1rem;">Hủy</button>
          <button type="submit" class="btn-action-large btn-meet-customer" style="padding: 0.5rem 1.25rem; font-size: 0.9rem;">
            ${Icons.render('send', { size: 14 })} GỬI YÊU CẦU DUYỆT
          </button>
        </div>
      </form>
    `;

    UI.showModal(content);
  },

  async submitCustomerUpdateRequest(customerId) {
    const cust = (this.customers || []).find(c => c.CustomerID === customerId);
    if (!cust) return;

    const contact = (document.getElementById("req-cust-contact")?.value || "").trim();
    const phone = (document.getElementById("req-cust-phone")?.value || "").trim();
    const address = (document.getElementById("req-cust-address")?.value || "").trim();
    const customerType = document.getElementById("req-cust-type")?.value || "NORMAL";
    const reason = (document.getElementById("req-cust-reason")?.value || "").trim();

    if (!contact || !phone || !address || !reason) {
      return UI.showToast("Vui lòng điền đầy đủ các thông tin và lý do thay đổi!", "danger");
    }

    const oldData = {
      ContactName: cust.ContactName || "",
      Phone: cust.Phone || "",
      Address: cust.Address || "",
      CustomerType: cust.CustomerType || "NORMAL",
      Note: cust.Note || ""
    };

    const newData = {
      ContactName: contact,
      Phone: phone,
      Address: address,
      CustomerType: customerType,
      Note: cust.Note || ""
    };

    UI.showLoading("Đang gửi yêu cầu phê duyệt...");
    const res = await ApiService.requestCustomerUpdate(
      this.currentUser.UserID,
      cust.CustomerID,
      cust.CustomerName,
      oldData,
      newData,
      reason
    );
    UI.hideLoading();

    if (res && res.success) {
      UI.closeModal();
      UI.showToast(
        res.queuedOffline
          ? "Mất sóng 4G: Đề xuất sửa đổi đã lưu vào máy và sẽ tự gửi Quản lý khi có mạng!"
          : "Đã gửi yêu cầu cập nhật thông tin khách hàng lên Quản lý phê duyệt!",
        res.queuedOffline ? "warning" : "success"
      );
    } else {
      UI.showToast((res && res.message) || "Lỗi gửi yêu cầu", "danger");
    }
  }
};

