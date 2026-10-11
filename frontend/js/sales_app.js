1/**
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

    // Check if user already has an active working session
    await this.refreshSessionState();
    // Load assigned customers
    await this.loadCustomers();
    // Render the initial UI
    this.render();
  },

  async refreshSessionState() {
    const res = await ApiService.getActiveSession(this.currentUser.UserID);
    if (res && res.success && res.session) {
      this.activeSession = res.session;

      // If working, resume GPS tracking
      if (!GeoService.isTracking) {
        this.startGpsTracking();
      }

      // Check if there is an ongoing visit in local storage or DB
      const db = MockDatabase.getDB();
      const visit = db.VISITS.find(v => v.SessionID === this.activeSession.SessionID && v.Status === "IN_PROGRESS");
      if (visit) {
        this.activeVisit = visit;
        this.startVisitTimer(new Date(visit.CheckInTime));
      }
    } else {
      this.activeSession = null;
      this.activeVisit = null;
      GeoService.stopTracking();
      this.stopVisitTimer();
    }
  },

  async loadCustomers() {
    const res = await ApiService.getCustomers(this.currentUser.UserID, "SALES");
    if (res && res.success) {
      this.customers = res.customers || [];
    }
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

    if (!this.activeSession) {
      // ----------------------------------------------------
      // STATE: CHƯA BẮT ĐẦU
      // ----------------------------------------------------
      const overdueList = this.customers.filter(c => c.CareStatus === "OVERDUE");
      const dueSoonList = this.customers.filter(c => c.CareStatus === "DUE_SOON");

      container.innerHTML = `
        <div class="sales-mobile-container">
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
      `;

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
                  ${isCurrentActive ? `<span class="role-pill" style="background:#ede9fe;color:#6d28d9;border:1px solid #ddd6fe;font-size:0.7rem;padding:0.1rem 0.4rem;">Đang ghé</span>` : ''}
                </div>
                <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.25rem; display: flex; align-items: flex-start; gap: 0.35rem;">
                  <span style="flex-shrink: 0; margin-top: 2px;">${Icons.render('map-pin', { size: 13, color: 'var(--text-muted)' })}</span>
                  <span style="line-height: 1.3;">${c.Address || 'Chưa cập nhật địa chỉ'}</span>
                </div>
                <div style="font-size: 0.78rem; color: var(--text-light); margin-top: 0.25rem; display: flex; align-items: center; gap: 0.35rem;">
                  <span>${Icons.render('phone', { size: 12, color: 'var(--text-light)' })}</span>
                  <span>${c.ContactName ? `${c.ContactName} · ` : ''}</span>
                  <a href="tel:${c.Phone}" style="color: var(--primary); text-decoration: none; font-weight: 600;" onclick="event.stopPropagation();">${c.Phone || 'Chưa có SĐT'}</a>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem; flex-shrink: 0;">
                ${statusBadge}
                <span style="font-size: 0.72rem; color: var(--text-muted);">${c.CareCycleDays || 7} ngày/lần</span>
              </div>
            </div>

            <div style="border-top: 1px dashed var(--border); padding-top: 0.5rem; display: flex; justify-content: flex-end; align-items: center; gap: 0.5rem;">
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
        <div class="sales-mobile-container">
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
              <div style="font-size: 0.8rem; color: var(--text-muted); display: inline-flex; align-items: center; gap: 0.3rem;">
                ${Icons.render('navigation', { size: 12, color: '#059669' })} Tuyến tự động
              </div>
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
      `;

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
    UI.showLoading("Đang lấy tọa độ GPS khởi đầu...");
    try {
      let coords = null;
      try {
        coords = await GeoService.getCurrentPosition();
      } catch (gpsErr) {
        console.warn("[SalesApp] Real GPS error, using device fallback coords:", gpsErr.message);
        // Provide standard fallback coordinates if testing in browser with blocked GPS
        coords = { lat: 10.7760, lng: 106.6950, accuracy: 15, speed: 0 };
      }

      const res = await ApiService.startWork(this.currentUser.UserID, coords.lat, coords.lng, coords.accuracy);
      UI.hideLoading();

      if (res && res.success) {
        this.activeSession = res.session;
        UI.showToast("Bắt đầu ca làm việc thành công!", "success");
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
    GeoService.startTracking(
      intervalMinutes,
      async (updateData) => {
        // Location updated
        if (this.activeSession) {
          const { coords, activity, isIntervalTick } = updateData;
          if (isIntervalTick) {
            // Send periodic GPS point to server
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
          // Update UI badge if active
          this.updateActivityUI(activity, coords.accuracy);
        }
      },
      (err) => {
        console.warn("[SalesApp] GPS watch warning:", err.message);
      }
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
    if (!confirm("Bạn có chắc chắn muốn KẾT THÚC CA LÀM VIỆC hôm nay?")) {
      return;
    }

    UI.showLoading("Đang ghi nhận GPS kết thúc...");
    try {
      let coords = { lat: 0, lng: 0, accuracy: 0 };
      try {
        coords = await GeoService.getCurrentPosition();
      } catch (e) {
        coords = GeoService.lastPosition || { lat: 10.7760, lng: 106.6950, accuracy: 20 };
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
        UI.showToast(`Đã hoàn thành ca! Tổng thời gian: ${res.duration} phút.`, "success");
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

    // Immediately prepare active visit without distance blocking
    if (!this.activeVisit || this.activeVisit.CustomerID !== customerId) {
      await this._autoCheckinCustomer(customerId);
    }

    // Immediately display the care update modal
    this.showCareCheckoutModal(customerId);
  },

  handleLeaveVisit() {
    if (!this.activeVisit) return;
    if (confirm("Bạn có chắc muốn rời khỏi điểm bán này mà không lưu ghi chú cập nhật?")) {
      this.stopVisitTimer();
      this.activeVisit = null;
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
    let coords = GeoService.lastPosition || { lat: 10.7760, lng: 106.6950, accuracy: 10 };

    // Silently query GPS in background without freezing UI modal
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          const badge = document.getElementById("prospect-gps-badge");
          if (badge) badge.innerText = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
        },
        () => { },
        { timeout: 2000, maximumAge: 60000 }
      );
    }

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="font-weight: 700; font-size: 1.15rem; display: inline-flex; align-items: center; gap: 0.4rem;">
          ${Icons.render('plus-circle', { size: 18, color: 'var(--primary)' })} Thêm Khách Hàng Mới
        </h3>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div class="form-group">
        <label class="form-label">Tên Đại Lý / Cửa Hàng (*)</label>
        <input type="text" id="prospect-name" class="form-control" placeholder="Tạp Hóa / Tiệm Cà Phê..." />
      </div>

      <div class="form-group">
        <label class="form-label">Người Liên Hệ</label>
        <input type="text" id="prospect-contact" class="form-control" placeholder="Tên chủ tiệm / quản lý" />
      </div>

      <div class="form-group">
        <label class="form-label">Số Điện Thoại (* Chống trùng)</label>
        <input type="text" id="prospect-phone" class="form-control" placeholder="09xxxxxxxx" />
      </div>

      <div class="form-group">
        <label class="form-label">Địa Chỉ (*)</label>
        <input type="text" id="prospect-address" class="form-control" placeholder="Số nhà, tên đường..." />
      </div>

      <div style="background: var(--bg-subtle); padding: 0.55rem 0.75rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.78rem; display: flex; align-items: center; gap: 0.4rem; color: var(--text-muted);">
        ${Icons.render('map-pin', { size: 13, color: '#2563eb' })} 
        <div>Tọa độ tham chiếu: <strong id="prospect-gps-badge" style="color: var(--text-main);">${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}</strong></div>
      </div>

      <div class="form-group">
        <label class="form-label">Ghi Chú Ban Đầu</label>
        <textarea id="prospect-note" class="form-control" rows="2" placeholder="Quy mô điểm bán, nhu cầu nhập hàng..."></textarea>
      </div>

      <button id="btn-submit-prospect" class="btn-action-large btn-meet-customer" style="margin-top: 0.5rem;">
        ${Icons.render('save', { size: 16 })} GỬI DUYỆT KHÁCH HÀNG
      </button>
    `;

    UI.showModal(content);

    document.getElementById("btn-submit-prospect").onclick = async () => {
      const name = document.getElementById("prospect-name").value;
      if (!name || !name.trim()) {
        UI.showToast("Vui lòng nhập tên đại lý / cửa hàng", "warning");
        return;
      }

      const data = {
        CustomerName: name.trim(),
        ContactName: document.getElementById("prospect-contact").value,
        Phone: document.getElementById("prospect-phone").value,
        Address: document.getElementById("prospect-address").value,
        Latitude: coords.lat,
        Longitude: coords.lng,
        Note: document.getElementById("prospect-note").value
      };

      UI.showLoading("Đang gửi thông tin khách hàng...");
      const res = await ApiService.createCustomer(data, "SALES", this.currentUser.UserID);
      UI.hideLoading();

      if (res && res.success) {
        UI.closeModal();
        UI.showToast(res.message || "Đã gửi thông tin điểm mới!", "success");
        await this.loadCustomers();
        this.render();
      } else {
        UI.showToast(res.message || "Lỗi tạo khách hàng", "error");
      }
    };
  },

  /**
   * [INTERNAL] Trigger manual checkin programmatically — no distance geofence block
   * @param {string} customerId
   */
  async _autoCheckinCustomer(customerId) {
    if (!this.activeSession) {
      const fallbackPos = GeoService.lastPosition || { lat: 10.7760, lng: 106.6950, accuracy: 10 };
      const sessRes = await ApiService.startWork(this.currentUser.UserID, fallbackPos.lat, fallbackPos.lng, fallbackPos.accuracy);
      if (sessRes && sessRes.session) {
        this.activeSession = sessRes.session;
      }
    }
    const cust = this.customers.find(c => c.CustomerID === customerId);
    const coords = GeoService.lastPosition || {
      lat: cust && cust.Latitude ? Number(cust.Latitude) : 10.7760,
      lng: cust && cust.Longitude ? Number(cust.Longitude) : 106.6950,
      accuracy: 10
    };

    const res = await ApiService.checkinVisit(
      this.currentUser.UserID,
      customerId,
      this.activeSession ? this.activeSession.SessionID : ("SESS-" + Date.now()),
      coords.lat,
      coords.lng,
      coords.accuracy
    );

    if (res && res.success) {
      this.activeVisit = res.visit;
      this.startVisitTimer(new Date(res.visit.CheckInTime));
      return res.visit;
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

  showCareCheckoutModal(targetCustomerId = null) {
    const custId = targetCustomerId || (this.activeVisit && this.activeVisit.CustomerID);
    const cust = this.customers.find(c => c.CustomerID === custId) || (this.customers.length > 0 ? this.customers[0] : null);
    const custName = cust ? cust.CustomerName : "Khách hàng";
    const custStockUnit = (cust && cust.StockUnit) ? cust.StockUnit : "Thùng";

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

        <!-- BLOCK C: KINH DOANH -->
        <div style="border: 1px solid #a7f3d0; background: #ecfdf5; padding: 0.85rem; border-radius: 8px;">
          <div style="font-weight: 700; font-size: 0.9rem; color: #047857; margin-bottom: 0.5rem; display: inline-flex; align-items: center; gap: 0.35rem;">
            ${Icons.render('trending-up', { size: 16, color: '#047857' })} C. KINH DOANH & ĐƠN HÀNG
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <!-- New Order Qty & Unit -->
            <div class="form-group" style="margin-bottom: 0.4rem;">
              <label class="form-label" style="font-size: 0.78rem;">Đơn hàng mới chốt</label>
              <div style="display: flex; gap: 0.35rem;">
                <input type="number" id="care-new-order" class="form-control" style="flex: 1.2; min-width: 0;" placeholder="SL đặt" oninput="SalesApp.updateUnitConversionHint('order')" />
                <select id="care-order-unit" class="form-control" style="flex: 1.1; min-width: 0; padding: 0.4rem;" onchange="SalesApp.updateUnitConversionHint('order')">
                  ${ProductService.renderUnitOptions("Thùng")}
                </select>
              </div>
              <div id="care-order-convert-hint" style="font-size: 0.72rem; color: #047857; margin-top: 2px; min-height: 14px;"></div>
            </div>
            <div class="form-group" style="margin-bottom: 0.4rem;">
              <label class="form-label" style="font-size: 0.78rem;">Tình hình tiêu thụ</label>
              <select id="care-consumption" class="form-control">
                <option value="Bình thường">Bình thường</option>
                <option value="Bán rất chạy">Bán rất chạy</option>
                <option value="Chậm">Chậm</option>
                <option value="Mùa cao điểm">Mùa cao điểm</option>
              </select>
            </div>
          </div>
        </div>

        <!-- BLOCK D: CHĂM SÓC & TRAO ĐỔI -->
        <div style="border: 1px solid var(--border); background: var(--bg-card); padding: 0.85rem; border-radius: 8px;">
          <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main); margin-bottom: 0.5rem; display: inline-flex; align-items: center; gap: 0.35rem;">
            ${Icons.render('message-square', { size: 16, color: '#334155' })} D. NỘI DUNG CHĂM SÓC & Ý KIẾN KHÁCH
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
      const careData = {
        SelectedProduct: document.getElementById("care-product-select") ? document.getElementById("care-product-select").value : "",
        DistributedQty: document.getElementById("care-dist-qty").value,
        DistributedUnit: document.getElementById("care-dist-unit") ? document.getElementById("care-dist-unit").value : "Thùng",
        InventoryQty: document.getElementById("care-stock-qty").value,
        InventoryUnit: document.getElementById("care-stock-unit") ? document.getElementById("care-stock-unit").value : "Thùng",
        ReorderDemand: document.getElementById("care-reorder").value,
        ReorderUnit: document.getElementById("care-reorder-unit") ? document.getElementById("care-reorder-unit").value : "Thùng",
        RecordedDebt: document.getElementById("care-debt").value,
        PaymentStatus: document.getElementById("care-payment-status").value,
        NewOrderQty: document.getElementById("care-new-order").value,
        NewOrderUnit: document.getElementById("care-order-unit") ? document.getElementById("care-order-unit").value : "Thùng",
        ConsumptionRate: document.getElementById("care-consumption").value,
        Result: document.getElementById("care-result").value,
        DiscussionDetails: document.getElementById("care-discussion").value,
        Note: document.getElementById("care-discussion").value
      };

      UI.showLoading("Đang lưu lịch sử chăm sóc và cập nhật chu kỳ...");
      let visitId = this.activeVisit ? this.activeVisit.VisitID : null;
      if (!visitId && cust) {
        const visit = await this._autoCheckinCustomer(cust.CustomerID);
        if (visit) visitId = visit.VisitID;
      }
      const res = await ApiService.checkoutCareVisit(visitId || ("VIS-" + Date.now()), this.currentUser.UserID, careData);
      UI.hideLoading();

      if (res && res.success) {
        UI.closeModal();
        this.stopVisitTimer();
        this.activeVisit = null;
        UI.showToast(`Hoàn tất chăm sóc! Lần hẹn tiếp theo đã được tự động tính.`, "success");
        await this.loadCustomers();
        this.render();
      } else {
        UI.showToast(res.message || "Lỗi lưu chăm sóc", "error");
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
      UI.showToast("Đã gửi yêu cầu cập nhật thông tin khách hàng lên Quản lý phê duyệt!", "success");
    } else {
      UI.showToast((res && res.message) || "Lỗi gửi yêu cầu", "danger");
    }
  }
};

