/**
 * MANAGER DESKTOP APP CONTROLLER
 * Comprehensive supervisory suite for monitoring field reps, GPS routes,
 * customer visits, chronological timeline, anomalies, and reports.
 */

const ManagerApp = {
  currentUser: null,
  activeTab: "dashboard",
  selectedSalesId: null,
  selectedDate: new Date().toISOString().split("T")[0],
  mapInstance: null,
  mapMarkers: [],
  mapRouteLayer: null,
  dashboardData: null,
  reportsPeriod: "today",
  reportsSalesId: "ALL",

  async init(user) {
    this.currentUser = user;
    console.log("[ManagerApp] Initializing for manager:", user.Name);
    this.renderLayout();
    await this.loadDashboardData();
  },

  renderLayout() {
    const container = document.getElementById("manager-view-container");
    if (!container) return;

    const currentRole = (this.currentUser && this.currentUser.Role) || "MANAGER";
    const allTabs = [
      { id: "dashboard", label: "Tổng Quan Dashboard", icon: "layout-dashboard" },
      { id: "map", label: "Bản Đồ & Tuyến Đường", icon: "map" },
      { id: "timeline", label: "Chi Tiết & Timeline", icon: "clock" },
      { id: "customers", label: "Khách Hàng", icon: "users" },
      { id: "approvals", label: "Phê Duyệt Thay Đổi", icon: "file-check" },
      { id: "products", label: "Quản Lý Hàng Hóa", icon: "package" },
      { id: "reports", label: "Báo Cáo & Thống Kê", icon: "bar-chart-3" },
      { id: "users", label: "Quản Lý Nhân Sự & Tuyến", icon: "shield-check" }
    ];

    const accessibleTabs = allTabs.filter(t => {
      return typeof PermissionService !== "undefined" ? PermissionService.canAccessTab(currentRole, t.id) : true;
    });

    if (!accessibleTabs.find(t => t.id === this.activeTab)) {
      this.activeTab = accessibleTabs[0] ? accessibleTabs[0].id : "dashboard";
    }

    container.innerHTML = `
      <div class="manager-dashboard-container">
        <!-- Tab Navigation -->
        <div class="manager-nav-tabs">
          ${accessibleTabs.map(t => `
            <button class="tab-btn ${this.activeTab === t.id ? 'active' : ''}" onclick="ManagerApp.switchTab('${t.id}')">
              ${Icons.render(t.icon, { size: 18 })} ${t.label}
            </button>
          `).join("")}
        </div>

        <!-- Tab Content Viewport -->
        <div id="manager-tab-content">
          <!-- Dynamic Content Loads Here -->
        </div>
      </div>
    `;
  },

  async switchTab(tabName) {
    const currentRole = (this.currentUser && this.currentUser.Role) || "MANAGER";
    if (typeof PermissionService !== "undefined" && !PermissionService.canAccessTab(currentRole, tabName)) {
      UI.showToast("Bạn không có quyền truy cập chức năng này!", "danger");
      return;
    }

    this.activeTab = tabName;
    this.renderLayout();

    if (tabName === "dashboard") {
      await this.loadDashboardData();
    } else if (tabName === "map") {
      await this.renderMapTab();
    } else if (tabName === "timeline") {
      await this.renderTimelineTab();
    } else if (tabName === "customers") {
      await this.renderCustomersTab();
    } else if (tabName === "approvals") {
      await this.renderApprovalsTab();
    } else if (tabName === "products") {
      await this.renderProductsTab();
    } else if (tabName === "reports") {
      await this.renderReportsTab();
    } else if (tabName === "users") {
      await this.renderUsersTab();
    }
  },

  // ----------------------------------------------------
  // TAB 1: DASHBOARD OVERVIEW
  // ----------------------------------------------------
  async loadDashboardData() {
    const content = document.getElementById("manager-tab-content");
    if (!content) return;

    content.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-muted);">Đang tải dữ liệu thực tế hôm nay...</div>`;

    const res = await ApiService.getManagerDashboard(this.selectedDate);
    if (!res || !res.success) {
      content.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Lỗi tải dữ liệu: ${(res && res.message) || 'Unknown'}</div>`;
      return;
    }

    this.dashboardData = res;
    const stats = res.stats || {};
    const salesList = res.sales || [];
    const careAlerts = res.careAlerts || {};
    const overdueList = careAlerts.overdue || [];
    const dueSoonList = careAlerts.dueSoon || [];

    const salesRowsHtml = salesList.map(s => {
      let statusBadge = `<span class="status-badge badge-notstarted">Chưa làm</span>`;
      if (s.status === "ĐANG LÀM") {
        statusBadge = `<span class="status-badge badge-working"><span class="gps-indicator-dot active"></span> Đang làm</span>`;
      } else if (s.status === "ĐÃ KẾT THÚC") {
        statusBadge = `<span class="status-badge badge-completed">Đã kết thúc</span>`;
      }

      let activityColor = "#64748b";
      if (s.currentActivity === "MOVING") activityColor = "#2563eb";
      if (s.currentActivity === "STATIONARY") activityColor = "#d97706";
      if (s.currentActivity && s.currentActivity.startsWith("GẶP KHÁCH")) activityColor = "#7c3aed";

      return `
        <tr>
          <td><strong>${s.name}</strong><br><span style="font-size: 0.8rem; color: var(--text-muted);">${s.team || 'Sales Rep'} - ${s.phone || ''}</span></td>
          <td>${statusBadge}</td>
          <td><strong style="color: ${activityColor};">${s.currentActivity}</strong></td>
          <td>${s.checkInTime}</td>
          <td>${s.checkOutTime}</td>
          <td><span style="font-weight: 700; color: var(--primary);">${s.visitCount}</span> điểm</td>
          <td>
            <span style="font-size: 0.82rem; font-weight: 600;">${s.totalAssignedCustomers || 0} KH</span>
            ${s.overdueCount > 0 ? `<br><span class="status-pill-icon overdue" style="font-size: 0.72rem; padding: 0.15rem 0.45rem; margin-top: 2px;">${Icons.render('alert-circle', { size: 12 })} ${s.overdueCount} Quá hạn</span>` : ''}
          </td>
          <td>
            <button class="btn-action-inline btn-view" onclick="ManagerApp.viewSalesDetail('${s.salesId}')" title="Xem chi tiết nhân sự">
              ${Icons.render('eye', { size: 13 })} Chi tiết
            </button>
          </td>
        </tr>
      `;
    }).join("");

    content.innerHTML = `
      <!-- TOP KPI CARDS: OPERATION & CARE RETENTION -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-blue">
          <div class="kpi-card-header">
            <div class="kpi-title">Đội Ngũ Sales</div>
            <div class="kpi-icon-box blue">${Icons.render('users', { size: 20 })}</div>
          </div>
          <div class="kpi-value">${stats.workingCount || 0} / ${stats.totalSales || 0}</div>
          <div class="kpi-sub">Đang hoạt động trên thị trường</div>
        </div>

        <div class="kpi-card kpi-rose">
          <div class="kpi-card-header">
            <div class="kpi-title" style="color: #b91c1c;">Khách Quá Hạn Chăm Sóc</div>
            <div class="kpi-icon-box rose">${Icons.render('alert-circle', { size: 20 })}</div>
          </div>
          <div class="kpi-value" style="color: #dc2626;">${stats.overdueCount || 0}</div>
          <div class="kpi-sub">Cần Sales can thiệp ngay</div>
        </div>

        <div class="kpi-card kpi-amber">
          <div class="kpi-card-header">
            <div class="kpi-title" style="color: #b45309;">Khách Sắp Đến Hạn</div>
            <div class="kpi-icon-box amber">${Icons.render('clock', { size: 20 })}</div>
          </div>
          <div class="kpi-value" style="color: #d97706;">${stats.dueSoonCount || 0}</div>
          <div class="kpi-sub">Trong chu kỳ chăm sóc</div>
        </div>

        <div class="kpi-card kpi-green">
          <div class="kpi-card-header">
            <div class="kpi-title">Tổng Khách Hàng</div>
            <div class="kpi-icon-box green">${Icons.render('building-2', { size: 20 })}</div>
          </div>
          <div class="kpi-value" style="color: #059669;">${stats.totalCustomers || 0}</div>
          <div class="kpi-sub">${stats.onTrackCount || 0} đúng hạn | ${stats.neverVisitedCount || 0} chưa ghé</div>
        </div>
      </div>

      <!-- SECOND ROW: FINANCIAL & INVENTORY STATS -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 1rem;">
        <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 0.85rem;">
            <div class="kpi-icon-box amber">${Icons.render('wallet', { size: 20 })}</div>
            <div>
              <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Tổng Công Nợ Khách Hàng</div>
              <div style="font-size: 1.4rem; font-weight: 800; color: #b45309;">${(stats.totalDebt || 0).toLocaleString('vi-VN')} đ</div>
            </div>
          </div>
          <span class="status-badge" style="background: #fef3c7; color: #b45309;">Theo dõi công nợ</span>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 0.85rem;">
            <div class="kpi-icon-box blue">${Icons.render('package', { size: 20 })}</div>
            <div>
              <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Tổng Tồn Kho Điểm Bán</div>
              <div style="font-size: 1.4rem; font-weight: 800; color: #1e40af;">${(stats.totalStock || 0).toLocaleString('vi-VN')} SP</div>
            </div>
          </div>
          <span class="status-badge" style="background: #eff6ff; color: #1e40af;">Kiểm đếm định kỳ</span>
        </div>
      </div>

      <!-- CRITICAL ALERT: OVERDUE CUSTOMERS PANEL -->
      ${overdueList.length > 0 ? `
        <div class="card-section" style="margin-top: 1rem; border-left: 4px solid #ef4444; background: #fff5f5;">
          <div class="section-header">
            <div class="section-title" style="color: #991b1b; display: inline-flex; align-items: center; gap: 0.5rem;">
              ${Icons.render('alert-triangle', { size: 20, color: '#dc2626' })} CẢNH BÁO: KHÁCH HÀNG QUÁ HẠN CHĂM SÓC (${overdueList.length})
            </div>
            <span style="font-size: 0.8rem; color: #b91c1c; font-weight: 600;">Tuyệt đối không để bỏ quên khách hàng cũ</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.75rem;">
            ${overdueList.map(c => `
              <div style="background: white; border: 1px solid #fecaca; border-radius: 8px; padding: 0.85rem; cursor: pointer;" onclick="ManagerApp.showCustomerDetailModal('${c.CustomerID}')">
                <div style="display: flex; justify-content: space-between; font-weight: 700;">
                  <span style="color: var(--text-main);">${c.CustomerName}</span>
                  <span class="status-pill-icon overdue" style="font-size: 0.75rem; padding: 0.15rem 0.45rem;">
                    ${Icons.render('alert-circle', { size: 12 })} Quá ${c.DaysOverdue}d
                  </span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                  Sales: <strong>${c.AssignedSalesID}</strong> | Chu kỳ: <strong>${c.CareCycleDays} ngày</strong>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-light); margin-top: 2px;">
                  Lần ghé cuối: ${c.LastCareDate ? c.LastCareDate.substring(0, 10) : 'Chưa có'} (${c.DaysSinceLast} ngày trước)
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ''}

      <!-- Realtime Sales Table -->
      <div class="card-section" style="margin-top: 1.5rem;">
        <div class="section-header">
          <div class="section-title">Trạng Thái Đội Ngũ & Trách Nhiệm Chăm Sóc (Ngày: ${this.selectedDate})</div>
          <button class="tab-btn" style="background: var(--bg-subtle); display: inline-flex; align-items: center; gap: 0.4rem;" onclick="ManagerApp.loadDashboardData()">
            ${Icons.render('refresh-cw', { size: 14 })} Làm mới
          </button>
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Sales Rep</th>
                <th>Trạng Thái</th>
                <th>Hoạt Động</th>
                <th>Bắt Đầu</th>
                <th>Kết Thúc</th>
                <th>Lượt Ghé</th>
                <th>Phụ Trách</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${salesRowsHtml || '<tr><td colspan="8" style="text-align: center;">Chưa có dữ liệu</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ----------------------------------------------------
  // TAB 2: INTERACTIVE MAP & ROUTE
  // ----------------------------------------------------
  async renderMapTab() {
    const content = document.getElementById("manager-tab-content");
    if (!content) return;

    const usersRes = await ApiService.getUsers("MANAGER");
    const salesList = (usersRes && usersRes.users) ? usersRes.users.filter(u => u.Role === "SALES") : [];

    content.innerHTML = `
      <div class="card-section">
        <div class="section-header" style="flex-wrap: wrap; gap: 1rem;">
          <div class="section-title">Bản Đồ Định Vị & Lộ Trình Tuyến Đi</div>
          <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
            <select id="map-sales-select" class="form-control" style="width: auto;" onchange="ManagerApp.onMapFilterChange()">
              <option value="ALL">-- Tất cả Sales (Vị trí mới nhất) --</option>
              ${salesList.map(s => `<option value="${s.UserID}" ${s.UserID === this.selectedSalesId ? 'selected' : ''}>${s.Name}</option>`).join("")}
            </select>
            <input type="date" id="map-date-select" class="form-control" style="width: auto;" value="${this.selectedDate}" onchange="ManagerApp.onMapFilterChange()" />
            <button class="tab-btn" style="background: var(--primary); color: white;" onclick="ManagerApp.onMapFilterChange()">
              ${Icons.render('navigation', { size: 16 })} Xem Tuyến Đường
            </button>
          </div>
        </div>

        <div id="leaflet-map-canvas" class="map-container"></div>
        <div style="display: flex; gap: 1.5rem; margin-top: 0.75rem; font-size: 0.82rem; color: var(--text-muted); flex-wrap: wrap; align-items: center;">
          <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
            <strong>Vị trí Sales hiện tại</strong>
          </span>
          <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
            ${Icons.render('building-2', { size: 14, color: '#3b82f6' })} <strong>Khách hàng</strong>
          </span>
          <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: #9333ea; display: inline-block;"></span>
            <strong>Điểm Check-in gặp khách</strong>
          </span>
          <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
            <span style="width: 16px; height: 3px; background: #2563eb; border-radius: 2px; display: inline-block;"></span>
            <strong>Lộ trình di chuyển trong ngày</strong>
          </span>
        </div>
      </div>
    `;

    setTimeout(() => {
      this.initLeafletMap();
    }, 100);
  },

  initLeafletMap() {
    const mapEl = document.getElementById("leaflet-map-canvas");
    if (!mapEl) return;

    if (this.mapInstance) {
      this.mapInstance.remove();
      this.mapInstance = null;
    }

    // Default center on Ho Chi Minh City
    this.mapInstance = L.map("leaflet-map-canvas").setView([10.7760, 106.6950], 13);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(this.mapInstance);

    this.refreshMapData();
  },

  async refreshMapData() {
    if (!this.mapInstance) return;

    // Clear existing markers & route
    this.mapMarkers.forEach(m => this.mapInstance.removeLayer(m));
    this.mapMarkers = [];
    if (this.mapRouteLayer) {
      this.mapInstance.removeLayer(this.mapRouteLayer);
      this.mapRouteLayer = null;
    }

    const salesSelect = document.getElementById("map-sales-select");
    const dateSelect = document.getElementById("map-date-select");
    const targetSalesId = salesSelect ? salesSelect.value : (this.selectedSalesId || "ALL");
    const targetDate = dateSelect ? dateSelect.value : this.selectedDate;

    // 1. Plot Customers
    const custRes = await ApiService.getCustomers(null, "MANAGER");
    const customers = (custRes && custRes.customers) || [];
    customers.forEach(c => {
      if (c.Latitude && c.Longitude) {
        const marker = L.circleMarker([Number(c.Latitude), Number(c.Longitude)], {
          radius: 8,
          fillColor: "#3b82f6",
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9
        }).addTo(this.mapInstance);

        marker.bindPopup(`
          <div style="font-size: 0.9rem;">
            <strong style="display: inline-flex; align-items: center; gap: 0.35rem;">
              ${Icons.render('building-2', { size: 14, color: '#2563eb' })} ${c.CustomerName}
            </strong><br>
            <span>${c.Address}</span><br>
            <span style="color: #64748b; font-size: 0.8rem;">LH: ${c.ContactName} - ${c.Phone}</span>
          </div>
        `);
        this.mapMarkers.push(marker);
      }
    });

    // 2. If single sales selected, show full route polyline & timeline points
    if (targetSalesId !== "ALL") {
      const detailRes = await ApiService.getSalesTimeline(targetSalesId, targetDate);
      if (detailRes && detailRes.success && detailRes.hasData) {
        const route = detailRes.gpsRoute || [];
        const validRoute = route.filter(pt => !pt.Accuracy || Number(pt.Accuracy) <= 80);
        const rawLatLngs = [];

        validRoute.forEach((pt, idx) => {
          if (pt.Latitude && pt.Longitude) {
            const pos = [Number(pt.Latitude), Number(pt.Longitude)];
            rawLatLngs.push(pos);

            // Small waypoint dots
            const color = pt.ActivityStatus === "MOVING" ? "#2563eb" : "#f59e0b";
            const dot = L.circleMarker(pos, {
              radius: 5,
              fillColor: color,
              color: "#fff",
              weight: 1,
              fillOpacity: 0.85
            }).addTo(this.mapInstance);

            dot.bindPopup(`
              <div style="font-size: 0.85rem;">
                <strong>Mốc #${idx + 1} (${pt.Timestamp ? pt.Timestamp.substring(11, 16) : ''})</strong><br>
                Trạng thái: <strong>${pt.ActivityStatus}</strong><br>
                Tốc độ: ${pt.Speed ? Number(pt.Speed).toFixed(1) : 0} m/s | Sai số: ${Math.round(pt.Accuracy || 0)}m
              </div>
            `);
            this.mapMarkers.push(dot);
          }
        });

        if (rawLatLngs.length > 0) {
          // Snap route to road network using OSRM
          const snappedLatLngs = await this.fetchRoadRoute(rawLatLngs);

          this.mapRouteLayer = L.polyline(snappedLatLngs, {
            color: "#2563eb",
            weight: 5,
            opacity: 0.85,
            lineJoin: "round",
            lineCap: "round",
            smoothFactor: 1
          }).addTo(this.mapInstance);

          this.mapInstance.fitBounds(this.mapRouteLayer.getBounds(), { padding: [50, 50] });
        }
      }
    } else {
      // Show latest position of all active sales
      const dashRes = await ApiService.getManagerDashboard(targetDate);
      if (dashRes && dashRes.sales) {
        dashRes.sales.forEach(s => {
          if (s.lastGps && s.lastGps.Latitude && s.lastGps.Longitude) {
            const marker = L.circleMarker([Number(s.lastGps.Latitude), Number(s.lastGps.Longitude)], {
              radius: 10,
              fillColor: "#10b981",
              color: "#ffffff",
              weight: 3,
              opacity: 1,
              fillOpacity: 1
            }).addTo(this.mapInstance);

            marker.bindPopup(`
              <div style="font-size: 0.9rem;">
                <strong style="display: inline-flex; align-items: center; gap: 0.35rem;">
                  ${Icons.render('user', { size: 14, color: '#10b981' })} ${s.name}
                </strong><br>
                Trạng thái: <strong>${s.currentActivity}</strong><br>
                Cập nhật lúc: ${s.lastGps.Timestamp ? s.lastGps.Timestamp.substring(11, 16) : '--'}
              </div>
            `);
            this.mapMarkers.push(marker);
          }
        });
      }
    }
  },

  async fetchRoadRoute(coordinates) {
    if (!coordinates || coordinates.length < 2) return coordinates;
    try {
      let sampled = coordinates;
      if (coordinates.length > 25) {
        sampled = [coordinates[0]];
        const step = Math.ceil(coordinates.length / 25);
        for (let i = 1; i < coordinates.length - 1; i += step) {
          sampled.push(coordinates[i]);
        }
        sampled.push(coordinates[coordinates.length - 1]);
      }
      const coordStr = sampled.map(pt => `${pt[1]},${pt[0]}`).join(";");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        if (json.code === "Ok" && json.routes && json.routes[0] && json.routes[0].geometry) {
          const coords = json.routes[0].geometry.coordinates;
          return coords.map(c => [c[1], c[0]]);
        }
      }
    } catch (e) {
      console.log("[ManagerApp] Road routing fallback to straight points:", e.message);
    }
    return coordinates;
  },

  onMapFilterChange() {
    this.refreshMapData();
  },

  // ----------------------------------------------------
  // TAB 3: TIMELINE & SALES DETAILS
  // ----------------------------------------------------
  async renderTimelineTab(targetSalesId) {
    const salesId = targetSalesId || this.selectedSalesId || "USR-002";
    this.selectedSalesId = salesId;
    const content = document.getElementById("manager-tab-content");
    if (!content) return;

    content.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-muted);">Đang tải chi tiết dòng thời gian...</div>`;

    const usersRes = await ApiService.getUsers("MANAGER");
    const salesList = (usersRes && usersRes.users) ? usersRes.users.filter(u => u.Role === "SALES") : [];
    const res = await ApiService.getSalesTimeline(salesId, this.selectedDate);

    const user = (res && res.user) || {};
    const summary = (res && res.summary) || {};
    const timeline = (res && res.timeline) || [];
    const anomalies = (res && res.anomalies) || [];

    // Filter timeline events to standard work hours: 07:00 - 18:00
    const workingHourTimeline = timeline.filter(item => {
      if (!item.displayTime) return true;
      const parts = item.displayTime.split(":");
      if (parts.length >= 2) {
        const hour = parseInt(parts[0], 10);
        const minute = parseInt(parts[1], 10);
        if (hour < 7 || hour > 18 || (hour === 18 && minute > 0)) {
          return false;
        }
      }
      return true;
    });

    const anomaliesHtml = anomalies.map(a => `
      <div class="anomaly-card" style="display: flex; align-items: flex-start; gap: 0.75rem;">
        <div class="kpi-icon-box amber" style="width: 32px; height: 32px;">
          ${Icons.render('alert-triangle', { size: 16 })}
        </div>
        <div>
          <strong style="color: #92400e;">Ghi nhận chú ý:</strong>
          <div style="font-size: 0.85rem; color: #78350f;">${a.message}</div>
        </div>
      </div>
    `).join("");

    const timelineItemsHtml = workingHourTimeline.map(item => {
      let dotClass = "dot-moving";
      if (item.type === "START_WORK") dotClass = "dot-start";
      if (item.type === "END_WORK") dotClass = "dot-end";
      if (item.type === "VISIT_CHECKIN") dotClass = "dot-visit";
      if (item.type === "STATIONARY") dotClass = "dot-stationary";

      return `
        <div class="timeline-item">
          <div class="timeline-dot ${dotClass}"></div>
          <div class="timeline-content">
            <div class="timeline-time">${item.displayTime}</div>
            <div class="timeline-title">${item.title}</div>
            <div class="timeline-desc">${item.description}</div>
          </div>
        </div>
      `;
    }).join("");

    content.innerHTML = `
      <div class="card-section">
        <div class="section-header" style="flex-wrap: wrap; gap: 1rem;">
          <div class="section-title">Nhật Ký & Dòng Thời Gian Chi Tiết</div>
          <div style="display: flex; gap: 0.75rem; align-items: center;">
            <select id="timeline-sales-select" class="form-control" style="width: auto;" onchange="ManagerApp.renderTimelineTab(this.value)">
              ${salesList.map(s => `<option value="${s.UserID}" ${s.UserID === salesId ? 'selected' : ''}>${s.Name}</option>`).join("")}
            </select>
          </div>
        </div>

        <!-- Summary Metric Row -->
        <div class="kpi-grid" style="margin-bottom: 1.5rem;">
          <div class="kpi-card kpi-blue">
            <div class="kpi-card-header">
              <div class="kpi-title">Bắt Đầu / Kết Thúc</div>
              <div class="kpi-icon-box blue">${Icons.render('clock', { size: 20 })}</div>
            </div>
            <div class="kpi-value" style="font-size: 1.4rem;">${summary.checkIn || '--'} → ${summary.checkOut || '--'}</div>
            <div class="kpi-sub">Tổng thời gian: ${summary.workDuration || 0} phút</div>
          </div>

          <div class="kpi-card kpi-green">
            <div class="kpi-card-header">
              <div class="kpi-title">Khách Hàng Đã Gặp</div>
              <div class="kpi-icon-box green">${Icons.render('user-check', { size: 20 })}</div>
            </div>
            <div class="kpi-value" style="font-size: 1.4rem; color: #059669;">${summary.visitCount || 0} lượt</div>
            <div class="kpi-sub">Đã xác thực tọa độ Check-in</div>
          </div>

          <div class="kpi-card kpi-amber">
            <div class="kpi-card-header">
              <div class="kpi-title">Thời Gian Di Chuyển</div>
              <div class="kpi-icon-box amber">${Icons.render('navigation', { size: 20 })}</div>
            </div>
            <div class="kpi-value" style="font-size: 1.4rem; color: #d97706;">${summary.movingTime || 0} phút</div>
            <div class="kpi-sub">Đứng yên: ${summary.stationaryTime || 0} phút</div>
          </div>

          <div class="kpi-card kpi-purple">
            <div class="kpi-card-header">
              <div class="kpi-title">Bản Ghi GPS</div>
              <div class="kpi-icon-box purple">${Icons.render('map-pin', { size: 20 })}</div>
            </div>
            <div class="kpi-value" style="font-size: 1.4rem; color: #7c3aed;">${summary.gpsRecordCount || 0} điểm</div>
            <div class="kpi-sub">Độ tin cậy cao</div>
          </div>
        </div>

        ${anomaliesHtml}

        <div style="font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.5rem;">Lịch trình theo thứ tự thời gian:</div>
        <div class="timeline-list">
          ${timelineItemsHtml || '<div style="color: var(--text-muted); padding: 1rem;">Chưa có sự kiện nào được ghi nhận.</div>'}
        </div>
      </div>
    `;
  },

  viewSalesDetail(salesId) {
    this.selectedSalesId = salesId;
    this.switchTab("timeline");
  },

  // ----------------------------------------------------
  // TAB 4: COMPREHENSIVE CUSTOMER MANAGEMENT (13 FEATURES)
  // ----------------------------------------------------
  customerSearchQuery: "",
  customerStatusFilter: "ALL",
  customerSalesFilter: "ALL",
  customerViewMode: "list", // 'list' or 'map'
  customerMapInstance: null,
  customerMapMarkers: [],

  async renderCustomersTab() {
    const content = document.getElementById("manager-tab-content");
    if (!content) return;

    const res = await ApiService.getCustomers(null, "MANAGER");
    const allCustomers = (res && res.customers) || [];
    const usersRes = await ApiService.getUsers("MANAGER");
    const salesList = (usersRes && usersRes.users) ? usersRes.users.filter(u => u.Role === "SALES") : [];

    // Filter Logic
    const q = (this.customerSearchQuery || "").toLowerCase().trim();
    const filtered = allCustomers.filter(c => {
      const matchSearch = !q ||
        (c.CustomerName || "").toLowerCase().includes(q) ||
        (c.ContactName || "").toLowerCase().includes(q) ||
        (c.Phone || "").includes(q) ||
        (c.Address || "").toLowerCase().includes(q);

      const matchStatus = this.customerStatusFilter === "ALL" || c.Status === this.customerStatusFilter;
      const matchSales = this.customerSalesFilter === "ALL" || c.AssignedSalesID === this.customerSalesFilter || (this.customerSalesFilter === "UNASSIGNED" && !c.AssignedSalesID);

      return matchSearch && matchStatus && matchSales;
    });

    const pendingCount = allCustomers.filter(c => c.Status === "PENDING_APPROVAL").length;

    // Header & Filter toolbar
    let html = `
      <div class="card-section">
        <div class="section-header" style="flex-wrap: wrap; gap: 1rem;">
          <div>
            <div class="section-title">Quản Lý Khách Hàng (${filtered.length}/${allCustomers.length})</div>
            ${pendingCount > 0 ? `<div style="font-size: 0.85rem; color: #b45309; font-weight: 600; margin-top: 2px; display: inline-flex; align-items: center; gap: 0.35rem;">${Icons.render('alert-triangle', { size: 14, color: '#d97706' })} Có ${pendingCount} khách hàng mới đang chờ duyệt</div>` : ''}
          </div>

          <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
            <div class="view-switcher-group">
              <button class="view-btn ${this.customerViewMode === 'list' ? 'active' : ''}" style="display: inline-flex; align-items: center; gap: 0.35rem;" onclick="ManagerApp.setCustomerViewMode('list')">
                ${Icons.render('list', { size: 14 })} Danh Sách
              </button>
              <button class="view-btn ${this.customerViewMode === 'map' ? 'active' : ''}" style="display: inline-flex; align-items: center; gap: 0.35rem;" onclick="ManagerApp.setCustomerViewMode('map')">
                ${Icons.render('map', { size: 14 })} Bản Đồ
              </button>
            </div>
            <button class="btn-add-primary" onclick="ManagerApp.showAddCustomerModal()">
              ${Icons.render('plus', { size: 16 })} Thêm Khách Hàng Mới
            </button>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="filter-search-bar">
          <div style="position: relative; flex: 1; min-width: 250px;">
            <input type="text" class="form-control search-input" style="padding-left: 2.2rem;" placeholder="Tìm theo tên đại lý, người liên hệ, SĐT, địa chỉ..." value="${this.customerSearchQuery}" oninput="ManagerApp.onCustomerSearch(this.value)" />
            <span style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none;">
              ${Icons.render('search', { size: 15 })}
            </span>
          </div>

          <select class="form-control" style="width: auto;" onchange="ManagerApp.onCustomerStatusFilter(this.value)">
            <option value="ALL" ${this.customerStatusFilter === 'ALL' ? 'selected' : ''}>Tất cả trạng thái</option>
            <option value="ACTIVE" ${this.customerStatusFilter === 'ACTIVE' ? 'selected' : ''}>Đang hoạt động (ACTIVE)</option>
            <option value="PENDING_APPROVAL" ${this.customerStatusFilter === 'PENDING_APPROVAL' ? 'selected' : ''}>Chờ phê duyệt (PENDING)</option>
            <option value="INACTIVE" ${this.customerStatusFilter === 'INACTIVE' ? 'selected' : ''}>Tạm dừng (INACTIVE)</option>
          </select>

          <select class="form-control" style="width: auto;" onchange="ManagerApp.onCustomerSalesFilter(this.value)">
            <option value="ALL" ${this.customerSalesFilter === 'ALL' ? 'selected' : ''}>Tất cả Sales phụ trách</option>
            ${salesList.map(s => `<option value="${s.UserID}" ${this.customerSalesFilter === s.UserID ? 'selected' : ''}>${s.Name}</option>`).join("")}
          </select>
        </div>
    `;

    if (this.customerViewMode === "list") {
      // ----------------------------------------------------
      // LIST TABLE VIEW
      // ----------------------------------------------------
      const rowsHtml = filtered.map(c => {
        let careBadge = `<span class="status-pill-icon overdue">${Icons.render('alert-circle', { size: 12 })} Quá ${c.DaysOverdue}d</span>`;
        if (c.CareStatus === "DUE_SOON") {
          careBadge = `<span class="status-pill-icon duesoon">${Icons.render('clock', { size: 12 })} Sắp hạn (${c.DaysRemaining}d)</span>`;
        } else if (c.CareStatus === "ON_TRACK") {
          careBadge = `<span class="status-pill-icon ontrack">${Icons.render('check-circle', { size: 12 })} Đúng hạn (${c.DaysRemaining}d)</span>`;
        } else if (c.CareStatus === "NEVER_VISITED") {
          careBadge = `<span class="status-pill-icon never">${Icons.render('help-circle', { size: 12 })} Chưa ghé</span>`;
        }

        const assignedUser = salesList.find(s => s.UserID === c.AssignedSalesID);
        const assignedName = assignedUser ? assignedUser.Name : (c.AssignedSalesID || "Chưa gán");

        return `
          <tr>
            <td>
              <strong style="font-size: 0.95rem; color: var(--text-main); cursor: pointer;" onclick="ManagerApp.showCustomerDetailModal('${c.CustomerID}')">${c.CustomerName}</strong>
              <div style="font-size: 0.78rem; color: var(--text-muted);">${c.CustomerID} • <span class="role-pill" style="font-size: 0.7rem; padding: 1px 6px;">${c.CustomerType || 'NORMAL'} (${c.CareCycleDays}d)</span></div>
            </td>
            <td>${c.ContactName || '--'}<br><span style="font-size: 0.8rem; color: var(--text-muted);">${c.Phone || '--'}</span></td>
            <td>${careBadge}<br><span style="font-size: 0.75rem; color: var(--text-light);">Hẹn: ${c.NextCareDate ? c.NextCareDate.substring(0, 10) : 'Chưa có'}</span></td>
            <td><strong style="color: #b45309;">${(c.CurrentDebt || 0).toLocaleString('vi-VN')} đ</strong></td>
            <td><strong style="color: #1e40af;">${c.CurrentStock || 0} ${c.StockUnit || 'Thùng'}</strong></td>
            <td><span class="status-badge badge-working" style="background: #e0f2fe; color: #0369a1;">${assignedName}</span></td>
            <td>
              <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                <button class="btn-action-inline btn-view" onclick="ManagerApp.showCustomerDetailModal('${c.CustomerID}')" title="Xem chi tiết & lịch sử gặp">
                  ${Icons.render('eye', { size: 13 })} Xem
                </button>
                <button class="btn-action-inline btn-edit" onclick="ManagerApp.showEditCustomerModal('${c.CustomerID}')" title="Chỉnh sửa">
                  ${Icons.render('pencil', { size: 13 })} Sửa
                </button>
                ${c.Status === 'PENDING_APPROVAL' ? `
                  <button class="btn-action-inline btn-approve" onclick="ManagerApp.handleApproveCustomer('${c.CustomerID}', true)" title="Duyệt khách hàng">
                    ${Icons.render('check', { size: 13 })} Duyệt
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join("");

      html += `
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Khách Hàng & Loại</th>
                <th>Người Liên Hệ</th>
                <th>Hạn Chăm Sóc</th>
                <th>Công Nợ</th>
                <th>Tồn Kho</th>
                <th>Sales Phụ Trách</th>
                <th>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">Không tìm thấy khách hàng nào phù hợp với bộ lọc.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
      content.innerHTML = html;
    } else {
      // ----------------------------------------------------
      // MAP VIEW
      // ----------------------------------------------------
      html += `
        <div id="customer-map-canvas" class="map-container"></div>
        <div style="display: flex; gap: 1.5rem; margin-top: 0.75rem; font-size: 0.82rem; color: var(--text-muted); flex-wrap: wrap; align-items: center;">
          <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
            <strong>Đang hoạt động (ACTIVE)</strong>
          </span>
          <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: #f59e0b; display: inline-block;"></span>
            <strong>Chờ duyệt (PENDING)</strong>
          </span>
          <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: #94a3b8; display: inline-block;"></span>
            <strong>Tạm dừng (INACTIVE)</strong>
          </span>
        </div>
      </div>`;
      content.innerHTML = html;

      setTimeout(() => {
        this.initCustomerMap(filtered);
      }, 100);
    }
  },

  setCustomerViewMode(mode) {
    this.customerViewMode = mode;
    this.renderCustomersTab();
  },

  onCustomerSearch(query) {
    this.customerSearchQuery = query;
    this.renderCustomersTab();
  },

  onCustomerStatusFilter(status) {
    this.customerStatusFilter = status;
    this.renderCustomersTab();
  },

  onCustomerSalesFilter(salesId) {
    this.customerSalesFilter = salesId;
    this.renderCustomersTab();
  },

  initCustomerMap(customers) {
    const mapEl = document.getElementById("customer-map-canvas");
    if (!mapEl) return;

    if (this.customerMapInstance) {
      this.customerMapInstance.remove();
      this.customerMapInstance = null;
    }

    this.customerMapInstance = L.map("customer-map-canvas").setView([10.7760, 106.6950], 13);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(this.customerMapInstance);

    const bounds = [];
    customers.forEach(c => {
      if (c.Latitude && c.Longitude) {
        const lat = Number(c.Latitude);
        const lng = Number(c.Longitude);
        bounds.push([lat, lng]);

        let color = "#10b981"; // Active
        if (c.Status === "PENDING_APPROVAL") color = "#f59e0b";
        if (c.Status === "INACTIVE") color = "#94a3b8";

        const marker = L.circleMarker([lat, lng], {
          radius: 9,
          fillColor: color,
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.95
        }).addTo(this.customerMapInstance);

        marker.bindPopup(`
          <div style="font-size: 0.9rem; min-width: 180px;">
            <strong style="font-size: 1rem; color: #1e293b; display: inline-flex; align-items: center; gap: 0.35rem;">
              ${Icons.render('building-2', { size: 15, color: '#2563eb' })} ${c.CustomerName}
            </strong><br>
            <span style="color: #64748b;">${c.Address}</span><br>
            <div style="margin-top: 4px; font-size: 0.8rem;">
              LH: <strong>${c.ContactName || '--'}</strong> (${c.Phone || '--'})<br>
              Trạng thái: <strong>${c.Status}</strong>
            </div>
            <button style="margin-top: 6px; width: 100%; padding: 6px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;" onclick="ManagerApp.showCustomerDetailModal('${c.CustomerID}')">
              ${Icons.render('eye', { size: 13 })} Xem Lịch Sử & Chi Tiết
            </button>
          </div>
        `);
      }
    });

    if (bounds.length > 0) {
      this.customerMapInstance.fitBounds(bounds, { padding: [40, 40] });
    }
  },

  // ----------------------------------------------------
  // ADD / EDIT CUSTOMER MODALS WITH GPS AUTO-DETECT
  // ----------------------------------------------------
  async showAddCustomerModal() {
    const usersRes = await ApiService.getUsers("MANAGER");
    const salesList = (usersRes && usersRes.users) ? usersRes.users.filter(u => u.Role === "SALES") : [];

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="font-weight: 700; font-size: 1.15rem;">+ Thêm Khách Hàng Mới</h3>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div class="form-group">
        <label class="form-label">Tên Khách Hàng / Đại Lý (*)</label>
        <input type="text" id="cust-name" class="form-control" placeholder="Ví dụ: Đại Lý Tạp Hóa Minh Phát" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Người Liên Hệ</label>
          <input type="text" id="cust-contact" class="form-control" placeholder="Anh Minh / Chị Lan" />
        </div>
        <div class="form-group">
          <label class="form-label">Số Điện Thoại (* Chống trùng)</label>
          <input type="text" id="cust-phone" class="form-control" placeholder="0912345678" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Địa Chỉ Khách Hàng (*)</label>
        <input type="text" id="cust-address" class="form-control" placeholder="128 Nguyễn Trãi, Q.1, TP.HCM" />
      </div>

      <div style="background: var(--bg-subtle); padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <label class="form-label" style="margin-bottom: 0;">Tọa Độ GPS Vị Trí (*)</label>
          <button type="button" class="btn-gps-detect" onclick="ManagerApp.autoDetectGpsForForm()">
            ${Icons.render('crosshair', { size: 14 })} Lấy GPS Hiện Tại
          </button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
          <input type="number" step="any" id="cust-lat" class="form-control" placeholder="Latitude (Vĩ độ)" value="10.7760" />
          <input type="number" step="any" id="cust-lng" class="form-control" placeholder="Longitude (Kinh độ)" value="106.6950" />
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
          Tọa độ chuẩn được dùng để đối soát bán kính Check-in khi Sales ghé thăm.
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Gán Sales Phụ Trách</label>
          <select id="cust-sales" class="form-control">
            <option value="ALL">Tất cả Sales</option>
            ${salesList.map(s => `<option value="${s.UserID}">${s.Name}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Loại Khách Hàng</label>
          <select id="cust-type" class="form-control" onchange="document.getElementById('cust-cycle').value = (this.value === 'VIP' ? 3 : (this.value === 'SMALL' ? 14 : 7))">
            <option value="VIP">Khách Lớn / VIP (3 ngày)</option>
            <option value="NORMAL" selected>Khách Thường (7 ngày)</option>
            <option value="SMALL">Khách Nhỏ (14 ngày)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Chu Kỳ Chăm Sóc (Ngày)</label>
          <input type="number" id="cust-cycle" class="form-control" value="7" />
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Công Nợ Ban Đầu (VNĐ)</label>
          <input type="number" id="cust-debt" class="form-control" placeholder="0" value="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Tồn Kho Ban Đầu</label>
          <div style="display: flex; gap: 0.5rem;">
            <input type="number" id="cust-stock" class="form-control" placeholder="0" value="0" style="flex: 1.2;" />
            <select id="cust-stock-unit" class="form-control" style="flex: 1;">
              ${typeof ProductService !== 'undefined' ? ProductService.renderUnitOptions('Thùng') : `
                <option value="Thùng" selected>Thùng</option>
                <option value="Xô">Xô</option>
                <option value="Chai">Chai</option>
                <option value="Bình">Bình</option>
                <option value="Phuy">Phuy</option>
              `}
            </select>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Ghi Chú</label>
        <textarea id="cust-note" class="form-control" rows="2" placeholder="Ghi chú đặc điểm khách hàng, tiềm năng, giờ mở cửa..."></textarea>
      </div>

      <button id="btn-save-customer" class="btn-action-large btn-meet-customer" style="margin-top: 1rem;">
        LƯU KHÁCH HÀNG
      </button>
    `;

    UI.showModal(content);

    document.getElementById("btn-save-customer").onclick = async () => {
      const data = {
        CustomerName: document.getElementById("cust-name").value,
        ContactName: document.getElementById("cust-contact").value,
        Phone: document.getElementById("cust-phone").value,
        Address: document.getElementById("cust-address").value,
        Latitude: document.getElementById("cust-lat").value,
        Longitude: document.getElementById("cust-lng").value,
        AssignedSalesID: document.getElementById("cust-sales").value,
        CustomerType: document.getElementById("cust-type").value,
        CareCycleDays: document.getElementById("cust-cycle").value,
        CurrentDebt: document.getElementById("cust-debt").value,
        CurrentStock: document.getElementById("cust-stock").value,
        StockUnit: document.getElementById("cust-stock-unit") ? document.getElementById("cust-stock-unit").value : "Thùng",
        Status: "ACTIVE",
        Note: document.getElementById("cust-note").value
      };

      UI.showLoading("Đang kiểm tra trùng lặp và lưu...");
      const res = await ApiService.createCustomer(data, "MANAGER", this.currentUser.UserID);
      UI.hideLoading();

      if (res && res.success) {
        UI.closeModal();
        if (res.nearbyWarning) {
          alert(res.nearbyWarning);
        }
        UI.showToast(res.message, "success");
        this.renderCustomersTab();
      } else {
        UI.showToast(res.message || "Không thể thêm khách hàng", "error");
      }
    };
  },

  async showEditCustomerModal(customerId) {
    const res = await ApiService.getCustomers(null, "MANAGER");
    const cust = (res && res.customers) ? res.customers.find(c => c.CustomerID === customerId) : null;
    if (!cust) return UI.showToast("Không tìm thấy thông tin khách hàng", "error");

    const usersRes = await ApiService.getUsers("MANAGER");
    const salesList = (usersRes && usersRes.users) ? usersRes.users.filter(u => u.Role === "SALES") : [];

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="font-weight: 700; font-size: 1.15rem;">Chỉnh Sửa Khách Hàng</h3>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div class="form-group">
        <label class="form-label">Tên Khách Hàng / Đại Lý (*)</label>
        <input type="text" id="cust-name-edit" class="form-control" value="${cust.CustomerName || ''}" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Người Liên Hệ</label>
          <input type="text" id="cust-contact-edit" class="form-control" value="${cust.ContactName || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Số Điện Thoại</label>
          <input type="text" id="cust-phone-edit" class="form-control" value="${cust.Phone || ''}" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Địa Chỉ Khách Hàng (*)</label>
        <input type="text" id="cust-address-edit" class="form-control" value="${cust.Address || ''}" />
      </div>

      <div style="background: var(--bg-subtle); padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <label class="form-label" style="margin-bottom: 0;">Tọa Độ GPS Vị Trí (*)</label>
          <button type="button" class="btn-gps-detect" onclick="ManagerApp.autoDetectGpsForEditForm()">
            ${Icons.render('crosshair', { size: 14 })} Lấy GPS Hiện Tại
          </button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
          <input type="number" step="any" id="cust-lat-edit" class="form-control" value="${cust.Latitude || 0}" />
          <input type="number" step="any" id="cust-lng-edit" class="form-control" value="${cust.Longitude || 0}" />
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Gán Sales</label>
          <select id="cust-sales-edit" class="form-control">
            <option value="ALL" ${cust.AssignedSalesID === 'ALL' ? 'selected' : ''}>Tất cả Sales</option>
            ${salesList.map(s => `<option value="${s.UserID}" ${cust.AssignedSalesID === s.UserID ? 'selected' : ''}>${s.Name}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Loại Khách</label>
          <select id="cust-type-edit" class="form-control" onchange="document.getElementById('cust-cycle-edit').value = (this.value === 'VIP' ? 3 : (this.value === 'SMALL' ? 14 : 7))">
            <option value="VIP" ${cust.CustomerType === 'VIP' ? 'selected' : ''}>VIP (3 ngày)</option>
            <option value="NORMAL" ${cust.CustomerType === 'NORMAL' || !cust.CustomerType ? 'selected' : ''}>Thường (7 ngày)</option>
            <option value="SMALL" ${cust.CustomerType === 'SMALL' ? 'selected' : ''}>Nhỏ (14 ngày)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Chu Kỳ (Ngày)</label>
          <input type="number" id="cust-cycle-edit" class="form-control" value="${cust.CareCycleDays || 7}" />
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Công Nợ (VNĐ)</label>
          <input type="number" id="cust-debt-edit" class="form-control" value="${cust.CurrentDebt || 0}" />
        </div>
        <div class="form-group">
          <label class="form-label">Tồn Kho</label>
          <div style="display: flex; gap: 0.5rem;">
            <input type="number" id="cust-stock-edit" class="form-control" value="${cust.CurrentStock || 0}" style="flex: 1.2;" />
            <select id="cust-stock-unit-edit" class="form-control" style="flex: 1;">
              ${typeof ProductService !== 'undefined' ? ProductService.renderUnitOptions(cust.StockUnit || 'Thùng') : `
                <option value="Thùng" ${cust.StockUnit === 'Thùng' ? 'selected' : ''}>Thùng</option>
                <option value="Xô" ${cust.StockUnit === 'Xô' ? 'selected' : ''}>Xô</option>
                <option value="Chai" ${cust.StockUnit === 'Chai' ? 'selected' : ''}>Chai</option>
                <option value="Bình" ${cust.StockUnit === 'Bình' ? 'selected' : ''}>Bình</option>
                <option value="Phuy" ${cust.StockUnit === 'Phuy' ? 'selected' : ''}>Phuy</option>
              `}
            </select>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Ghi Chú</label>
        <textarea id="cust-note-edit" class="form-control" rows="2">${cust.Note || ''}</textarea>
      </div>

      <button id="btn-update-customer" class="btn-action-large btn-meet-customer" style="margin-top: 1rem;">
        CẬP NHẬT THÔNG TIN
      </button>
    `;

    UI.showModal(content);

    document.getElementById("btn-update-customer").onclick = async () => {
      const data = {
        CustomerName: document.getElementById("cust-name-edit").value,
        ContactName: document.getElementById("cust-contact-edit").value,
        Phone: document.getElementById("cust-phone-edit").value,
        Address: document.getElementById("cust-address-edit").value,
        Latitude: document.getElementById("cust-lat-edit").value,
        Longitude: document.getElementById("cust-lng-edit").value,
        AssignedSalesID: document.getElementById("cust-sales-edit").value,
        CustomerType: document.getElementById("cust-type-edit").value,
        CareCycleDays: document.getElementById("cust-cycle-edit").value,
        CurrentDebt: document.getElementById("cust-debt-edit").value,
        CurrentStock: document.getElementById("cust-stock-edit").value,
        StockUnit: document.getElementById("cust-stock-unit-edit") ? document.getElementById("cust-stock-unit-edit").value : "Thùng",
        Note: document.getElementById("cust-note-edit").value
      };

      UI.showLoading("Đang cập nhật...");
      const updateRes = await ApiService.updateCustomer(customerId, data, "MANAGER");
      UI.hideLoading();

      if (updateRes && updateRes.success) {
        UI.closeModal();
        UI.showToast("Đã cập nhật thông tin khách hàng!", "success");
        this.renderCustomersTab();
      } else {
        UI.showToast(updateRes.message || "Lỗi cập nhật", "error");
      }
    };
  },

  async autoDetectGpsForForm() {
    try {
      const pos = await GeoService.getCurrentPosition();
      document.getElementById("cust-lat").value = pos.lat.toFixed(6);
      document.getElementById("cust-lng").value = pos.lng.toFixed(6);
      UI.showToast(`Đã lấy GPS thành công! Sai số ~${Math.round(pos.accuracy)}m`, "success");
    } catch (e) {
      document.getElementById("cust-lat").value = "10.776000";
      document.getElementById("cust-lng").value = "106.695000";
      UI.showToast("Đã dùng tọa độ mặc định (do GPS bị chặn)", "warning");
    }
  },

  async autoDetectGpsForEditForm() {
    try {
      const pos = await GeoService.getCurrentPosition();
      document.getElementById("cust-lat-edit").value = pos.lat.toFixed(6);
      document.getElementById("cust-lng-edit").value = pos.lng.toFixed(6);
      UI.showToast(`Đã lấy GPS thành công! Sai số ~${Math.round(pos.accuracy)}m`, "success");
    } catch (e) {
      UI.showToast("Không thể lấy GPS: " + e.message, "error");
    }
  },

  // ----------------------------------------------------
  // APPROVE / REJECT CUSTOMER
  // ----------------------------------------------------
  async handleApproveCustomer(customerId, approved) {
    if (typeof PermissionService !== "undefined" && !PermissionService.guard(this.currentUser, "APPROVE_CUSTOMER", "Chỉ Quản lý hoặc Quản trị viên mới có quyền phê duyệt điểm bán!")) {
      return;
    }
    const actionText = approved ? "PHÊ DUYỆT" : "TỪ CHỐI";
    if (!confirm(`Bạn có chắc muốn ${actionText} khách hàng này?`)) return;

    UI.showLoading("Đang xử lý phê duyệt...");
    const res = await ApiService.approveCustomer(customerId, approved, this.currentUser.UserID);
    UI.hideLoading();

    if (res && res.success) {
      UI.showToast(res.message, "success");
      this.renderCustomersTab();
    } else {
      UI.showToast(res.message || "Lỗi xử lý", "error");
    }
  },

  // ----------------------------------------------------
  // CUSTOMER DETAIL & VISIT HISTORY MODAL
  // ----------------------------------------------------
  async showCustomerDetailModal(customerId) {
    UI.showLoading("Đang tải chi tiết & lịch sử gặp...");
    const res = await ApiService.getCustomers(null, "MANAGER");
    const cust = (res && res.customers) ? res.customers.find(c => c.CustomerID === customerId) : null;
    if (!cust) {
      UI.hideLoading();
      return UI.showToast("Không tìm thấy khách hàng", "error");
    }

    const visitsRes = await ApiService.getCustomerVisits(customerId);
    const visits = (visitsRes && visitsRes.visits) || [];
    const usersRes = await ApiService.getUsers("MANAGER");
    const salesList = (usersRes && usersRes.users) ? usersRes.users : [];
    const assignedUser = salesList.find(s => s.UserID === cust.AssignedSalesID);
    UI.hideLoading();

    const visitHistoryRows = visits.map(v => `
      <div style="border-left: 3px solid #2563eb; padding-left: 0.75rem; margin-bottom: 1rem; background: var(--bg-subtle); padding: 0.75rem; border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--primary); font-weight: 700;">
          <span style="display: inline-flex; align-items: center; gap: 0.35rem;">${Icons.render('user', { size: 14 })} ${v.salesName}</span>
          <span>${v.checkInTime ? v.checkInTime.replace("T", " ").substring(0, 16) : '--'}</span>
        </div>
        <div style="font-size: 0.85rem; margin-top: 4px; font-weight: 600;">
          Thời lượng: ${v.duration || 'Đang gặp'} phút | Kết quả: <span style="color: #059669;">${v.result || '--'}</span>
        </div>

        <!-- 4-BLOCK HIGHLIGHTS -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; font-size: 0.8rem;">
          <div style="background: #eff6ff; padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid #bfdbfe;">
            <span style="display: inline-flex; align-items: center; gap: 0.3rem;">${Icons.render('package', { size: 13, color: '#2563eb' })} <strong>Phân phối:</strong> ${v.DistributedQty || 0} ${v.DistributedUnit || 'Thùng'}</span><br>
            <span style="display: inline-flex; align-items: center; gap: 0.3rem; margin-top: 2px;">${Icons.render('boxes', { size: 13, color: '#2563eb' })} <strong>Tồn kho:</strong> ${v.InventoryQty || 0} ${v.InventoryUnit || 'Thùng'}</span>
          </div>
          <div style="background: #fffbeb; padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid #fde68a;">
            <span style="display: inline-flex; align-items: center; gap: 0.3rem;">${Icons.render('wallet', { size: 13, color: '#d97706' })} <strong>Công nợ:</strong> ${(v.RecordedDebt || 0).toLocaleString('vi-VN')} đ</span><br>
            <span style="display: inline-flex; align-items: center; gap: 0.3rem; margin-top: 2px;">${Icons.render('trending-up', { size: 13, color: '#d97706' })} <strong>Đơn mới:</strong> ${v.NewOrderQty || 0} ${v.NewOrderUnit || 'Thùng'}</span>
          </div>
        </div>
        ${v.SelectedProduct ? `
          <div style="font-size: 0.78rem; color: #1e40af; margin-top: 0.35rem; background: #f0f9ff; padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.3rem;">
            ${Icons.render('package', { size: 12 })} Mặt hàng: <strong>${v.SelectedProduct}</strong>
          </div>
        ` : ''}

        ${v.DiscussionDetails || v.note ? `
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.4rem; background: white; padding: 0.4rem; border-radius: 4px; border: 1px dashed var(--border); display: flex; align-items: flex-start; gap: 0.35rem;">
            ${Icons.render('message-square', { size: 13 })} <div><strong>Trao đổi:</strong> ${v.DiscussionDetails || v.note}</div>
          </div>
        ` : ''}
      </div>
    `).join("");

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div>
          <h3 style="font-weight: 800; font-size: 1.2rem; color: var(--text-main);">${cust.CustomerName}</h3>
          <div style="font-size: 0.8rem; color: var(--text-muted);">
            Mã: ${cust.CustomerID} • Loại: <strong>${cust.CustomerType || 'NORMAL'}</strong> (Chu kỳ: ${cust.CareCycleDays || 7} ngày)
          </div>
        </div>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div class="modal-subtabs">
        <button class="modal-tab-btn active" id="modal-tab-info" style="display: inline-flex; align-items: center; gap: 0.35rem;" onclick="ManagerApp.switchDetailSubTab('info')">
          ${Icons.render('file-text', { size: 14 })} Thông Tin Chung
        </button>
        <button class="modal-tab-btn" id="modal-tab-visits" style="display: inline-flex; align-items: center; gap: 0.35rem;" onclick="ManagerApp.switchDetailSubTab('visits')">
          ${Icons.render('clock', { size: 14 })} Lịch Sử Chăm Sóc (${visits.length})
        </button>
      </div>

      <!-- SubTab 1: Info -->
      <div id="subtab-info-content">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
          <div style="background: var(--bg-subtle); padding: 0.75rem; border-radius: 8px;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Người Liên Hệ</div>
            <div style="font-weight: 700;">${cust.ContactName || '--'}</div>
            <div style="font-size: 0.85rem; color: var(--primary);">${cust.Phone || '--'}</div>
          </div>
          <div style="background: var(--bg-subtle); padding: 0.75rem; border-radius: 8px;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Trạng Thái Chăm Sóc</div>
            <div style="font-weight: 700; color: ${cust.BadgeColor || '#10b981'};">${cust.CareStatusLabel || 'Đúng hạn'}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
              Lần cuối: ${cust.LastCareDate ? cust.LastCareDate.substring(0, 10) : 'Chưa có'} (${cust.DaysSinceLast} ngày trước)
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
          <div style="background: #fffbeb; padding: 0.75rem; border-radius: 8px; border: 1px solid #fde68a;">
            <div style="font-size: 0.75rem; color: #b45309; font-weight: 700;">CÔNG NỢ HIỆN TẠI</div>
            <div style="font-size: 1.2rem; font-weight: 800; color: #b45309;">${(cust.CurrentDebt || 0).toLocaleString('vi-VN')} đ</div>
          </div>
          <div style="background: #eff6ff; padding: 0.75rem; border-radius: 8px; border: 1px solid #bfdbfe;">
            <div style="font-size: 0.75rem; color: #1e40af; font-weight: 700;">TỒN KHO GẦN NHẤT</div>
            <div style="font-size: 1.2rem; font-weight: 800; color: #1e40af;">${cust.CurrentStock || 0} ${cust.StockUnit || 'Thùng'}</div>
          </div>
        </div>

        <div style="margin-bottom: 1rem;">
          <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">Địa Chỉ:</div>
          <div style="font-size: 0.95rem; font-weight: 500;">${cust.Address || '--'}</div>
        </div>

        <div style="margin-bottom: 1rem;">
          <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">Tọa Độ GPS Chuẩn:</div>
          <div><code>Latitude: ${cust.Latitude} | Longitude: ${cust.Longitude}</code></div>
        </div>

        ${cust.Note ? `
          <div style="background: #fffbeb; padding: 0.75rem; border-radius: 8px; border: 1px solid #fde68a;">
            <div style="font-size: 0.75rem; color: #b45309; font-weight: 700;">GHI CHÚ:</div>
            <div style="font-size: 0.88rem; color: #78350f;">${cust.Note}</div>
          </div>
        ` : ''}

        <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
          <button class="btn-action-inline btn-edit" style="flex: 1; justify-content: center; padding: 0.6rem;" onclick="ManagerApp.showEditCustomerModal('${cust.CustomerID}')">
            ${Icons.render('pencil', { size: 14 })} Chỉnh Sửa Thông Tin
          </button>
        </div>
      </div>

      <!-- SubTab 2: Visits History -->
      <div id="subtab-visits-content" style="display: none; max-height: 50vh; overflow-y: auto;">
        ${visitHistoryRows || '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Chưa có lượt chăm sóc nào được ghi nhận cho khách hàng này.</div>'}
      </div>
    `;

    UI.showModal(content);
  },

  switchDetailSubTab(tab) {
    const tabInfo = document.getElementById("modal-tab-info");
    const tabVisits = document.getElementById("modal-tab-visits");
    const infoContent = document.getElementById("subtab-info-content");
    const visitsContent = document.getElementById("subtab-visits-content");

    if (tab === "info") {
      tabInfo.classList.add("active");
      tabVisits.classList.remove("active");
      infoContent.style.display = "block";
      visitsContent.style.display = "none";
    } else {
      tabInfo.classList.remove("active");
      tabVisits.classList.add("active");
      infoContent.style.display = "none";
      visitsContent.style.display = "block";
    }
  },

  // ----------------------------------------------------
  // TAB 5: COMPREHENSIVE PERFORMANCE REPORTS & ANALYTICS
  // ----------------------------------------------------
  async renderReportsTab() {
    const content = document.getElementById("manager-tab-content");
    if (!content) return;

    content.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-muted);">Đang tổng hợp báo cáo & thống kê hiệu suất...</div>`;

    const res = await ApiService.getPerformanceReports(this.reportsSalesId, this.reportsPeriod, this.selectedDate);
    const usersRes = await ApiService.getUsers("MANAGER");
    const salesList = (usersRes && usersRes.users) ? usersRes.users.filter(u => u.Role === "SALES") : [];

    if (!res || !res.success) {
      content.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Lỗi tải báo cáo: ${(res && res.message) || 'Unknown'}</div>`;
      return;
    }

    const summary = res.summary || {};
    const repReports = res.reports || [];

    const rowsHtml = repReports.map((r, idx) => {
      let ratingClass = "badge-working";
      if (r.performanceRating.includes("XUẤT SẮC")) ratingClass = "badge-completed";
      if (r.performanceRating.includes("CẦN CẢI THIỆN")) ratingClass = "badge-notstarted";

      return `
        <tr>
          <td>
            <strong>#${idx + 1}. ${r.name}</strong><br>
            <span style="font-size: 0.78rem; color: var(--text-muted);">${r.team || 'Field Rep'} • ${r.phone || ''}</span>
          </td>
          <td>
            <strong style="color: var(--primary); font-size: 1rem;">${r.completedVisits}</strong> / ${r.targetVisits} điểm
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Ghé TB: ${r.avgTimePerVisit} phút/điểm</div>
          </td>
          <td>
            <strong style="color: #059669;">+${r.totalNewOrders} Đơn mới</strong><br>
            <span style="font-size: 0.78rem; color: var(--text-muted);">Đã giao: ${r.totalDistributed} SP</span>
          </td>
          <td>
            <strong>${r.totalFieldHours}h</strong> ngoài thị trường<br>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${r.totalWorkMinutes} phút</span>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div style="flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                <div style="width: ${r.routeCompletionRate}%; height: 100%; background: ${r.routeCompletionRate >= 80 ? '#10b981' : (r.routeCompletionRate >= 50 ? '#f59e0b' : '#ef4444')};"></div>
              </div>
              <strong style="font-size: 0.85rem; width: 38px;">${r.routeCompletionRate}%</strong>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Đạt mục tiêu tuyến</div>
          </td>
          <td>
            ${r.overdueCount > 0 
              ? `<span class="status-pill-icon overdue" style="font-size: 0.75rem; padding: 0.15rem 0.45rem;">${Icons.render('alert-circle', { size: 12 })} ${r.overdueCount} Quá hạn</span>` 
              : `<span class="status-pill-icon ontrack" style="font-size: 0.75rem; padding: 0.15rem 0.45rem;">${Icons.render('check-circle', { size: 12 })} Chu kỳ 100%</span>`}
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
              ${r.dueSoonCount > 0 ? `<span style="color: #b45309;">${Icons.render('clock', { size: 11, color: '#d97706' })} ${r.dueSoonCount} Sắp đến hạn</span>` : 'Không có trễ hạn'}
            </div>
          </td>
          <td>
            <span class="status-badge ${ratingClass}" style="display: inline-flex; align-items: center; gap: 0.35rem;">
              ${r.performanceRating.includes("XUẤT SẮC") ? Icons.render('award', { size: 13 }) : (r.performanceRating.includes("CẦN CẢI THIỆN") ? Icons.render('alert-triangle', { size: 13 }) : Icons.render('check-circle', { size: 13 }))}
              ${r.performanceRating.replace(/[⭐⚠️]/g, '').trim()}
            </span>
          </td>
        </tr>
      `;
    }).join("");

    content.innerHTML = `
      <div class="card-section">
        <!-- Header & Filters -->
        <div class="section-header" style="flex-wrap: wrap; gap: 1rem;">
          <div>
            <div class="section-title">Báo Cáo & Thống Kê Hiệu Suất Sales Thị Trường</div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">Đánh giá tiến độ hoàn thành tuyến đường, doanh số và thời gian bám sát thị trường.</div>
          </div>
          <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
            <!-- Period Filter -->
            <div style="display: flex; background: var(--bg-subtle); padding: 3px; border-radius: 8px;">
              <button class="tab-btn ${this.reportsPeriod === 'today' ? 'active' : ''}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="ManagerApp.setReportsFilter('today')">Hôm Nay</button>
              <button class="tab-btn ${this.reportsPeriod === 'week' ? 'active' : ''}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="ManagerApp.setReportsFilter('week')">Tuần Này</button>
              <button class="tab-btn ${this.reportsPeriod === 'month' ? 'active' : ''}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="ManagerApp.setReportsFilter('month')">Tháng Này</button>
              <button class="tab-btn ${this.reportsPeriod === 'all' ? 'active' : ''}" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="ManagerApp.setReportsFilter('all')">Toàn Bộ</button>
            </div>

            <!-- Sales Rep Filter -->
            <select id="report-sales-select" class="form-control" style="width: auto; font-size: 0.85rem;" onchange="ManagerApp.setReportsSales(this.value)">
              <option value="ALL" ${this.reportsSalesId === 'ALL' ? 'selected' : ''}>Tất Cả Sales Rep</option>
              ${salesList.map(s => `<option value="${s.UserID}" ${s.UserID === this.reportsSalesId ? 'selected' : ''}>${s.Name}</option>`).join("")}
            </select>

            <!-- Export Button -->
            <button class="tab-btn" style="background: #059669; color: white; padding: 0.45rem 0.85rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem;" onclick="ManagerApp.exportReportsCSV()">
              ${Icons.render('download', { size: 15 })} Xuất File CSV
            </button>
          </div>
        </div>

        <!-- Metric KPI Cards -->
        <div class="kpi-grid" style="margin-top: 1.25rem; margin-bottom: 1.5rem;">
          <div class="kpi-card kpi-blue">
            <div class="kpi-card-header">
              <div class="kpi-title">Tổng Điểm Bán Đã Ghé</div>
              <div class="kpi-icon-box blue">${Icons.render('calendar-check', { size: 20 })}</div>
            </div>
            <div class="kpi-value">${summary.totalVisits || 0} <span style="font-size: 1rem; font-weight: 500;">lượt</span></div>
            <div class="kpi-sub">Đã check-in hợp lệ qua GPS</div>
          </div>

          <div class="kpi-card kpi-green">
            <div class="kpi-card-header">
              <div class="kpi-title">Đơn Hàng / Phân Phối</div>
              <div class="kpi-icon-box green">${Icons.render('shopping-cart', { size: 20 })}</div>
            </div>
            <div class="kpi-value" style="color: #059669;">+${summary.totalOrders || 0} <span style="font-size: 1rem; font-weight: 500;">đơn</span></div>
            <div class="kpi-sub">Đã giao ${summary.totalDistributed || 0} sản phẩm</div>
          </div>

          <div class="kpi-card kpi-amber">
            <div class="kpi-card-header">
              <div class="kpi-title">Tỷ Lệ Hoàn Thành Tuyến</div>
              <div class="kpi-icon-box amber">${Icons.render('milestone', { size: 20 })}</div>
            </div>
            <div class="kpi-value" style="color: #d97706;">${summary.avgRouteCompletionRate || 0}%</div>
            <div class="kpi-sub">Mục tiêu trung bình đội ngũ</div>
          </div>

          <div class="kpi-card kpi-purple">
            <div class="kpi-card-header">
              <div class="kpi-title">Thời Gian Bám Thị Trường</div>
              <div class="kpi-icon-box purple">${Icons.render('timer', { size: 20 })}</div>
            </div>
            <div class="kpi-value" style="color: #7c3aed;">${summary.totalFieldHours || 0} <span style="font-size: 1rem; font-weight: 500;">giờ</span></div>
            <div class="kpi-sub">${summary.totalSalesCount || 0} nhân sự field sales</div>
          </div>
        </div>

        <!-- Performance Details Table -->
        <div style="margin-top: 1.5rem;">
          <h4 style="font-weight: 700; margin-bottom: 0.75rem; color: var(--text-main); display: inline-flex; align-items: center; gap: 0.5rem;">
            ${Icons.render('trophy', { size: 18, color: '#d97706' })} Bảng Đánh Giá Hiệu Suất Chi Tiết Từng Sales Rep
          </h4>
          <div class="table-responsive">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Nhân Viên Sales</th>
                  <th>Lượt Ghé Thăm</th>
                  <th>Kinh Doanh & Phân Phối</th>
                  <th>Thời Lượng Thị Trường</th>
                  <th>Tỷ Lệ Hoàn Thành Tuyến</th>
                  <th>Quản Lý Chu Kỳ Khách</th>
                  <th>Xếp Loại Hiệu Suất</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Không có dữ liệu trong kỳ báo cáo đã chọn.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  setReportsFilter(period) {
    this.reportsPeriod = period;
    this.renderReportsTab();
  },

  setReportsSales(salesId) {
    this.reportsSalesId = salesId;
    this.renderReportsTab();
  },

  async exportReportsCSV() {
    const res = await ApiService.getPerformanceReports(this.reportsSalesId, this.reportsPeriod, this.selectedDate);
    const reports = (res && res.reports) || [];

    const rows = [
      ["SalesID", "Name", "Team", "CompletedVisits", "TargetVisits", "RouteCompletionRatePercent", "TotalFieldHours", "NewOrders", "DistributedQty", "OverdueCustomers", "Rating"]
    ];

    reports.forEach(r => {
      rows.push([
        r.salesId,
        `"${r.name}"`,
        `"${r.team || ''}"`,
        r.completedVisits,
        r.targetVisits,
        r.routeCompletionRate,
        r.totalFieldHours,
        r.totalNewOrders,
        r.totalDistributed,
        r.overdueCount,
        `"${r.performanceRating}"`
      ]);
    });

    let csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_performance_report_${this.reportsPeriod}_${this.selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    UI.showToast("Đã xuất báo cáo hiệu suất ra file CSV!", "success");
  },

  // ----------------------------------------------------
  // TAB 6: USERS MANAGEMENT & ROUTE ALLOCATION (ADMIN ONLY)
  // ----------------------------------------------------
  async renderUsersTab() {
    const content = document.getElementById("manager-tab-content");
    if (!content) return;

    if (typeof PermissionService !== "undefined" && !PermissionService.guard(this.currentUser, "MANAGE_USERS", "Chỉ ADMIN mới có quyền quản lý nhân sự và phân bổ tuyến!")) {
      return;
    }

    content.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-muted);">Đang tải danh sách nhân sự & phân bổ tuyến...</div>`;

    const usersRes = await ApiService.getUsers("ADMIN");
    const users = (usersRes && usersRes.users) || (typeof App !== "undefined" ? App.users : []);
    const custRes = await ApiService.getCustomers(null, "ADMIN");
    const allCustomers = (custRes && custRes.customers) || [];

    const totalUsers = users.length;
    const adminCount = users.filter(u => u.Role === "ADMIN").length;
    const managerCount = users.filter(u => u.Role === "MANAGER").length;
    const salesCount = users.filter(u => u.Role === "SALES").length;
    const assignedCustCount = allCustomers.filter(c => c.AssignedSalesID && c.AssignedSalesID !== "ALL").length;
    const unassignedCustCount = allCustomers.length - assignedCustCount;

    let rowsHtml = users.map(u => {
      const assignedCustomers = allCustomers.filter(c => c.AssignedSalesID === u.UserID);
      const roleMeta = typeof PermissionService !== "undefined" ? PermissionService.getMeta(u.Role) : { badgeClass: "role-pill", icon: "user", color: "#64748b", bg: "#f1f5f9" };

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div style="width: 34px; height: 34px; border-radius: 50%; background: ${roleMeta.bg}; color: ${roleMeta.color}; display: flex; align-items: center; justify-content: center; font-weight: 700;">
                ${u.Name ? u.Name.charAt(0) : 'U'}
              </div>
              <div>
                <strong style="font-size: 0.95rem; color: var(--text-main);">${u.Name}</strong>
                <div style="font-size: 0.78rem; color: var(--text-muted);">${u.UserID} • ${u.Email}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="role-pill ${roleMeta.badgeClass}" style="font-size: 0.75rem;">
              ${Icons.render(roleMeta.icon, { size: 12 })} ${u.Role}
            </span>
          </td>
          <td>
            <span style="font-size: 0.88rem; font-weight: 500;">${u.Team || 'Toàn hệ thống'}</span>
          </td>
          <td>
            <span style="font-size: 0.85rem; color: var(--text-muted);">${u.Phone || '--'}</span>
          </td>
          <td>
            ${u.Role === 'SALES' ? `
              <span class="status-badge badge-working" style="background: #e0f2fe; color: #0369a1; font-weight: 700;">
                ${assignedCustomers.length} điểm bán
              </span>
            ` : `
              <span style="color: var(--text-muted); font-size: 0.82rem;">Giám sát toàn tuyến</span>
            `}
          </td>
          <td>
            <span class="status-badge ${u.Status === 'ACTIVE' || !u.Status ? 'badge-working' : 'badge-completed'}" style="font-size: 0.72rem;">
              ${u.Status || 'ACTIVE'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
              <button class="btn-action-inline" onclick="App.onUserSelectChange('${u.UserID}')" title="Chuyển ngay sang tài khoản này để kiểm tra" style="padding: 0.35rem 0.65rem; font-size: 0.78rem;">
                ${Icons.render('user-check', { size: 13 })} Đăng nhập thử
              </button>
              ${u.Role === 'SALES' ? `
                <button class="btn-action-inline btn-edit" onclick="ManagerApp.showReassignRouteModal('${u.UserID}')" title="Gán hoặc phân bổ lại tuyến khách hàng" style="padding: 0.35rem 0.65rem; font-size: 0.78rem;">
                  ${Icons.render('map-pin', { size: 13 })} Phân tuyến
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    content.innerHTML = `
      <div class="manager-sub-header" style="margin-bottom: 1.25rem;">
        <div>
          <h2 style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            ${Icons.render('shield-check', { size: 22, color: '#7e22ce' })} Quản Lý Danh Sách Nhân Sự & Phân Bổ Tuyến
          </h2>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
            Đặc quyền ADMIN: Quản lý phân quyền tài khoản (RBAC), tạo nhân sự mới và phân bổ tuyến đường cho Sales.
          </div>
        </div>
        <button class="btn-action-inline" onclick="ManagerApp.showAddUserModal()" style="background: var(--primary); color: white; border: none; padding: 0.6rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem;">
          ${Icons.render('user-plus', { size: 16 })} + Thêm Nhân Sự Mới
        </button>
      </div>

      <!-- KPI Summary Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 1rem; border-radius: 8px;">
          <div style="font-size: 0.78rem; font-weight: 600; color: var(--text-muted);">TỔNG NHÂN SỰ</div>
          <div style="font-size: 1.6rem; font-weight: 800; color: var(--text-main); margin-top: 4px;">${totalUsers}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${adminCount} Admin • ${managerCount} Quản lý</div>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 1rem; border-radius: 8px;">
          <div style="font-size: 0.78rem; font-weight: 600; color: #0369a1;">SALES ĐI THỊ TRƯỜNG</div>
          <div style="font-size: 1.6rem; font-weight: 800; color: #0369a1; margin-top: 4px;">${salesCount}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">Nhân viên tác nghiệp thực tế</div>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 1rem; border-radius: 8px;">
          <div style="font-size: 0.78rem; font-weight: 600; color: #059669;">ĐÃ PHÂN BỔ TUYẾN</div>
          <div style="font-size: 1.6rem; font-weight: 800; color: #059669; margin-top: 4px;">${assignedCustCount}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">Điểm bán đã có Sales phụ trách</div>
        </div>

        <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 1rem; border-radius: 8px;">
          <div style="font-size: 0.78rem; font-weight: 600; color: #d97706;">CHƯA PHÂN TUYẾN</div>
          <div style="font-size: 1.6rem; font-weight: 800; color: #d97706; margin-top: 4px;">${unassignedCustCount}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">Cần gán cho nhân sự phụ trách</div>
        </div>
      </div>

      <!-- Users Table -->
      <div class="table-responsive" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Nhân Sự</th>
              <th>Vai Trò (Role)</th>
              <th>Đội Nhóm (Team)</th>
              <th>Số Điện Thoại</th>
              <th>Tuyến Bán Hàng</th>
              <th>Trạng Thái</th>
              <th>Hành Động</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  },

  showAddUserModal() {
    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
        <h3 style="font-weight: 800; font-size: 1.2rem; color: var(--text-main); margin: 0;">+ Thêm Nhân Sự Mới</h3>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div class="form-group" style="margin-bottom: 0.75rem;">
        <label class="form-label">Họ và Tên (*)</label>
        <input type="text" id="new-user-name" class="form-control" placeholder="Ví dụ: Hoàng Văn D" required />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
        <div class="form-group">
          <label class="form-label">Email (*)</label>
          <input type="email" id="new-user-email" class="form-control" placeholder="sales.d@company.com" required />
        </div>
        <div class="form-group">
          <label class="form-label">Số Điện Thoại</label>
          <input type="text" id="new-user-phone" class="form-control" placeholder="0901234571" />
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
        <div class="form-group">
          <label class="form-label">Vai Trò Phân Quyền (*)</label>
          <select id="new-user-role" class="form-control">
            <option value="SALES" selected>SALES (Nhân viên thị trường)</option>
            <option value="MANAGER">MANAGER (Quản lý vùng)</option>
            <option value="ADMIN">ADMIN (Quản trị viên hệ thống)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Đội Nhóm (Team)</label>
          <input type="text" id="new-user-team" class="form-control" placeholder="North Team / South Team" value="North Team" />
        </div>
      </div>

      <button class="btn-action-large btn-meet-customer" style="width: 100%;" onclick="ManagerApp.saveNewUser()">
        LƯU NHÂN SỰ
      </button>
    `;

    UI.showModal(content);
  },

  async saveNewUser() {
    const name = (document.getElementById("new-user-name")?.value || "").trim();
    const email = (document.getElementById("new-user-email")?.value || "").trim();
    const phone = (document.getElementById("new-user-phone")?.value || "").trim();
    const role = document.getElementById("new-user-role")?.value || "SALES";
    const team = (document.getElementById("new-user-team")?.value || "North Team").trim();

    if (!name || !email) {
      return UI.showToast("Vui lòng nhập tên và email nhân sự!", "danger");
    }

    const newUser = {
      UserID: "USR-" + String(Date.now()).substring(8),
      Name: name,
      Email: email,
      Phone: phone,
      Role: role,
      Team: team,
      Status: "ACTIVE"
    };

    if (typeof App !== "undefined" && App.users) {
      App.users.push(newUser);
    }

    if (typeof MockDatabase !== "undefined") {
      const db = MockDatabase.getDB();
      if (db.USERS) {
        db.USERS.push(newUser);
        MockDatabase.saveDB(db);
      }
    }

    UI.closeModal();
    UI.showToast(`Đã thêm nhân sự ${name} (${role}) thành công!`, "success");
    if (typeof App !== "undefined" && typeof App.renderRoleSwitcher === "function") {
      App.renderRoleSwitcher();
    }
    this.renderUsersTab();
  },

  async showReassignRouteModal(salesId) {
    const targetUser = (typeof App !== "undefined" && App.users) ? App.users.find(u => u.UserID === salesId) : null;
    if (!targetUser) return UI.showToast("Không tìm thấy nhân sự", "danger");

    UI.showLoading("Đang tải danh sách điểm bán...");
    const custRes = await ApiService.getCustomers(null, "ADMIN");
    const allCustomers = (custRes && custRes.customers) || [];
    UI.hideLoading();

    const content = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
        <div>
          <h3 style="font-weight: 800; font-size: 1.2rem; color: var(--text-main); margin: 0;">
            Phân Bổ Tuyến Cho: ${targetUser.Name}
          </h3>
          <div style="font-size: 0.78rem; color: var(--text-muted);">
            Mã: ${targetUser.UserID} • Vai trò: ${targetUser.Role}
          </div>
        </div>
        <button onclick="UI.closeModal()" style="border: none; background: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
      </div>

      <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
        Chọn các điểm bán khách hàng để giao cho <strong>${targetUser.Name}</strong> phụ trách:
      </div>

      <div style="max-height: 50vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem; border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem; background: var(--bg-subtle);">
        ${allCustomers.map(c => {
          const isAssigned = c.AssignedSalesID === salesId;
          const assignedOther = c.AssignedSalesID && c.AssignedSalesID !== salesId && typeof App !== "undefined" ? App.users.find(u => u.UserID === c.AssignedSalesID) : null;
          return `
            <label style="display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem; background: var(--bg-card); border-radius: 6px; cursor: pointer; border: 1px solid var(--border);">
              <input type="checkbox" class="cust-route-checkbox" value="${c.CustomerID}" ${isAssigned ? 'checked' : ''} style="width: 17px; height: 17px;" />
              <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">${c.CustomerName}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">
                  ${c.Address} • Loại: <strong>${c.CustomerType || 'NORMAL'}</strong>
                  ${assignedOther ? `<span style="color: #b45309; margin-left: 0.5rem;">(Hiện đang gán: ${assignedOther.Name})</span>` : ''}
                </div>
              </div>
            </label>
          `;
        }).join("")}
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
        <button class="btn-action-inline" onclick="UI.closeModal()" style="padding: 0.5rem 1rem;">Hủy</button>
        <button class="btn-action-large btn-meet-customer" onclick="ManagerApp.saveReassignedRoutes('${salesId}')" style="padding: 0.5rem 1.25rem;">
          LƯU PHÂN TUYẾN
        </button>
      </div>
    `;

    UI.showModal(content);
  },

  async saveReassignedRoutes(salesId) {
    const checkboxes = document.querySelectorAll(".cust-route-checkbox");
    const selectedIds = new Set();
    checkboxes.forEach(cb => {
      if (cb.checked) selectedIds.add(cb.value);
    });

    UI.showLoading("Đang cập nhật phân bổ tuyến...");
    if (typeof MockDatabase !== "undefined") {
      const db = MockDatabase.getDB();
      if (db.CUSTOMERS) {
        db.CUSTOMERS.forEach(c => {
          if (selectedIds.has(c.CustomerID)) {
            c.AssignedSalesID = salesId;
          } else if (c.AssignedSalesID === salesId) {
            c.AssignedSalesID = "";
          }
        });
        MockDatabase.saveDB(db);
      }
    }

    UI.hideLoading();
    UI.closeModal();
    UI.showToast("Đã cập nhật phân bổ tuyến bán hàng thành công!", "success");
    this.renderUsersTab();
  },

  // ----------------------------------------------------
  // TAB 5: PHÊ DUYỆT THAY ĐỔI THÔNG TIN KHÁCH HÀNG (APPROVAL FLOW)
  // ----------------------------------------------------
  approvalsFilter: "ALL", // "ALL", "PENDING", "APPROVED", "REJECTED"

  async renderApprovalsTab() {
    const content = document.getElementById("manager-tab-content");
    if (!content) return;

    content.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-muted);"><i class="fa fa-spinner fa-spin"></i> Đang tải danh sách yêu cầu phê duyệt...</div>`;

    const res = await ApiService.getCustomerUpdateRequests();
    const requests = (res && res.success && res.data) ? res.data : [];

    // Filter
    let filtered = requests;
    if (this.approvalsFilter !== "ALL") {
      filtered = requests.filter(r => r.Status === this.approvalsFilter);
    }

    const pendingCount = requests.filter(r => r.Status === "PENDING").length;
    const approvedCount = requests.filter(r => r.Status === "APPROVED").length;
    const rejectedCount = requests.filter(r => r.Status === "REJECTED").length;

    content.innerHTML = `
      <div style="padding: 1.25rem;">
        <!-- Header & Stats -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h2 style="font-size: 1.3rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">
              Phê Duyệt Thay Đổi Thông Tin Khách Hàng
            </h2>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">
              Kiểm tra và phê duyệt các đề xuất cập nhật SĐT, địa chỉ, người liên hệ do nhân viên Sales gửi lên.
            </p>
          </div>
          <!-- Filter Badges -->
          <div style="display: flex; gap: 0.5rem; background: var(--bg-card); padding: 0.3rem 0.5rem; border-radius: 8px; border: 1px solid var(--border);">
            <button class="btn-filter ${this.approvalsFilter === 'ALL' ? 'active' : ''}" onclick="ManagerApp.filterApprovals('ALL')" style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.82rem; font-weight: 600; cursor: pointer; border: none; background: ${this.approvalsFilter === 'ALL' ? 'var(--primary)' : 'transparent'}; color: ${this.approvalsFilter === 'ALL' ? '#fff' : 'var(--text-main)'};">
              Tất cả (${requests.length})
            </button>
            <button class="btn-filter ${this.approvalsFilter === 'PENDING' ? 'active' : ''}" onclick="ManagerApp.filterApprovals('PENDING')" style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.82rem; font-weight: 600; cursor: pointer; border: none; background: ${this.approvalsFilter === 'PENDING' ? '#f59e0b' : 'transparent'}; color: ${this.approvalsFilter === 'PENDING' ? '#fff' : 'var(--text-main)'};">
              Chờ duyệt (${pendingCount})
            </button>
            <button class="btn-filter ${this.approvalsFilter === 'APPROVED' ? 'active' : ''}" onclick="ManagerApp.filterApprovals('APPROVED')" style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.82rem; font-weight: 600; cursor: pointer; border: none; background: ${this.approvalsFilter === 'APPROVED' ? '#10b981' : 'transparent'}; color: ${this.approvalsFilter === 'APPROVED' ? '#fff' : 'var(--text-main)'};">
              Đã duyệt (${approvedCount})
            </button>
            <button class="btn-filter ${this.approvalsFilter === 'REJECTED' ? 'active' : ''}" onclick="ManagerApp.filterApprovals('REJECTED')" style="padding: 0.35rem 0.75rem; border-radius: 6px; font-size: 0.82rem; font-weight: 600; cursor: pointer; border: none; background: ${this.approvalsFilter === 'REJECTED' ? '#ef4444' : 'transparent'}; color: ${this.approvalsFilter === 'REJECTED' ? '#fff' : 'var(--text-main)'};">
              Từ chối (${rejectedCount})
            </button>
          </div>
        </div>

        <!-- Request List Cards -->
        ${filtered.length === 0 ? `
          <div style="background: var(--bg-card); border-radius: 12px; padding: 3rem; text-align: center; border: 1px dashed var(--border);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem; opacity: 0.4;">📋</div>
            <div style="font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">Không có yêu cầu nào trong danh mục này</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">Các đề xuất sửa đổi thông tin khách hàng từ Sales sẽ hiển thị tại đây</div>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${filtered.map(req => {
              const isPending = req.Status === "PENDING";
              const isApproved = req.Status === "APPROVED";
              const isRejected = req.Status === "REJECTED";

              const oldData = req.OldData || {};
              const newData = req.NewData || {};

              const statusBadge = isPending 
                ? `<span style="background: #fef3c7; color: #b45309; padding: 0.25rem 0.65rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700; border: 1px solid #fde68a;">⏳ Chờ Phê Duyệt</span>`
                : isApproved 
                ? `<span style="background: #d1fae5; color: #047857; padding: 0.25rem 0.65rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700; border: 1px solid #a7f3d0;">✓ Đã Chấp Thuận</span>`
                : `<span style="background: #fee2e2; color: #b91c1c; padding: 0.25rem 0.65rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700; border: 1px solid #fecaca;">✕ Đã Từ Chối</span>`;

              return `
                <div style="background: var(--bg-card); border: 1px solid ${isPending ? 'var(--primary)' : 'var(--border)'}; border-radius: 12px; padding: 1.25rem; box-shadow: 0 2px 8px rgba(0,0,0,0.04); transition: all 0.2s;">
                  <!-- Top Row: Customer info & status -->
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                        <span style="font-weight: 700; font-size: 1.05rem; color: var(--text-main);">${req.CustomerName}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted); background: var(--bg-subtle); padding: 0.15rem 0.4rem; border-radius: 4px;">ID: ${req.CustomerID}</span>
                      </div>
                      <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.75rem;">
                        <span>👤 Đề xuất: <strong>${req.SalesName}</strong> (${req.SalesID})</span>
                        <span>🕒 ${new Date(req.CreatedAt).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>
                    <div>${statusBadge}</div>
                  </div>

                  <!-- Reason Box -->
                  ${req.Reason ? `
                    <div style="background: var(--bg-subtle); padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.82rem; color: var(--text-main); margin-bottom: 1rem; border-left: 3px solid var(--primary);">
                      <strong>Lý do từ Sales:</strong> ${req.Reason}
                    </div>
                  ` : ''}

                  <!-- Old vs New Comparison (Diff Viewer) -->
                  <div style="margin-bottom: 1rem;">
                    <div style="font-size: 0.82rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">
                      So Sánh Thay Đổi (Cũ vs Mới):
                    </div>
                    <div class="diff-container">
                      <!-- Column Old -->
                      <div class="diff-column diff-old">
                        <div class="diff-header old">DỮ LIỆU HIỆN TẠI (CŨ)</div>
                        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                          <div><span style="color: var(--text-muted);">SĐT:</span> <strong>${oldData.Phone || '—'}</strong></div>
                          <div><span style="color: var(--text-muted);">Người liên hệ:</span> <strong>${oldData.ContactPerson || '—'}</strong></div>
                          <div><span style="color: var(--text-muted);">Địa chỉ:</span> <strong>${oldData.Address || '—'}</strong></div>
                          <div><span style="color: var(--text-muted);">Loại khách:</span> <strong>${oldData.CustomerType || '—'}</strong></div>
                        </div>
                      </div>

                      <!-- Column New -->
                      <div class="diff-column diff-new">
                        <div class="diff-header new">DỮ LIỆU ĐỀ XUẤT (MỚI)</div>
                        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                          <div>
                            <span style="color: var(--text-muted);">SĐT:</span> 
                            <strong style="${newData.Phone !== oldData.Phone ? 'color: #047857; text-decoration: underline;' : ''}">
                              ${newData.Phone || '—'}
                            </strong>
                            ${newData.Phone !== oldData.Phone ? '<span style="font-size: 0.7rem; background: #a7f3d0; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">Đổi</span>' : ''}
                          </div>
                          <div>
                            <span style="color: var(--text-muted);">Người liên hệ:</span> 
                            <strong style="${newData.ContactPerson !== oldData.ContactPerson ? 'color: #047857; text-decoration: underline;' : ''}">
                              ${newData.ContactPerson || '—'}
                            </strong>
                            ${newData.ContactPerson !== oldData.ContactPerson ? '<span style="font-size: 0.7rem; background: #a7f3d0; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">Đổi</span>' : ''}
                          </div>
                          <div>
                            <span style="color: var(--text-muted);">Địa chỉ:</span> 
                            <strong style="${newData.Address !== oldData.Address ? 'color: #047857; text-decoration: underline;' : ''}">
                              ${newData.Address || '—'}
                            </strong>
                            ${newData.Address !== oldData.Address ? '<span style="font-size: 0.7rem; background: #a7f3d0; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">Đổi</span>' : ''}
                          </div>
                          <div>
                            <span style="color: var(--text-muted);">Loại khách:</span> 
                            <strong style="${newData.CustomerType !== oldData.CustomerType ? 'color: #047857; text-decoration: underline;' : ''}">
                              ${newData.CustomerType || '—'}
                            </strong>
                            ${newData.CustomerType !== oldData.CustomerType ? '<span style="font-size: 0.7rem; background: #a7f3d0; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">Đổi</span>' : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Resolution info if resolved -->
                  ${!isPending ? `
                    <div style="font-size: 0.8rem; color: var(--text-muted); background: var(--bg-subtle); padding: 0.5rem 0.75rem; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                      <div>
                        Xử lý bởi: <strong>${req.ApprovedByName || req.ApprovedBy || 'Manager'}</strong> lúc ${req.ApprovedAt ? new Date(req.ApprovedAt).toLocaleString('vi-VN') : '—'}
                      </div>
                      ${req.RejectReason ? `<div style="color: var(--danger); font-weight: 600;">Lý do từ chối: ${req.RejectReason}</div>` : ''}
                    </div>
                  ` : ''}

                  <!-- Action Buttons for PENDING -->
                  ${isPending ? `
                    <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 0.75rem;">
                      <button class="btn-action-inline" onclick="ManagerApp.promptRejectRequest('${req.RequestID}')" style="background: #fee2e2; color: #b91c1c; border-color: #fecaca; padding: 0.5rem 1.25rem; font-weight: 600;">
                        ✕ Từ Chối
                      </button>
                      <button class="btn-action-large btn-meet-customer" onclick="ManagerApp.handleApproveRequest('${req.RequestID}')" style="padding: 0.5rem 1.5rem; font-weight: 700; background: #10b981;">
                        ✓ Chấp Thuận Ghi Đè
                      </button>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join("")}
          </div>
        `}
      </div>
    `;
  },

  filterApprovals(filter) {
    this.approvalsFilter = filter;
    this.renderApprovalsTab();
  },

  async handleApproveRequest(requestId) {
    if (!confirm("Bạn có chắc chắn muốn CHẤP THUẬN yêu cầu này? Dữ liệu mới sẽ được ghi đè vào hồ sơ khách hàng.")) {
      return;
    }

    UI.showLoading("Đang cập nhật hồ sơ khách hàng...");
    const res = await ApiService.resolveCustomerUpdateRequest(
      requestId,
      "APPROVE",
      "",
      this.currentUser ? this.currentUser.UserID : "MGR001",
      this.currentUser ? this.currentUser.Name : "Manager"
    );

    UI.hideLoading();
    if (res && res.success) {
      UI.showToast("Đã chấp thuận và ghi đè hồ sơ khách hàng thành công!", "success");
      await this.renderApprovalsTab();
    } else {
      UI.showToast((res && res.message) || "Lỗi khi phê duyệt yêu cầu", "danger");
    }
  },

  promptRejectRequest(requestId) {
    const reason = prompt("Vui lòng nhập lý do từ chối yêu cầu cập nhật này:");
    if (reason === null) return; // User cancelled
    if (!reason.trim()) {
      UI.showToast("Bạn cần nhập lý do để từ chối yêu cầu!", "warning");
      return;
    }

    this.handleRejectRequest(requestId, reason.trim());
  },

  async handleRejectRequest(requestId, reason) {
    UI.showLoading("Đang từ chối yêu cầu...");
    const res = await ApiService.resolveCustomerUpdateRequest(
      requestId,
      "REJECT",
      reason,
      this.currentUser ? this.currentUser.UserID : "MGR001",
      this.currentUser ? this.currentUser.Name : "Manager"
    );

    UI.hideLoading();
    if (res && res.success) {
      UI.showToast("Đã từ chối yêu cầu cập nhật!", "info");
      await this.renderApprovalsTab();
    } else {
      UI.showToast((res && res.message) || "Lỗi khi từ chối yêu cầu", "danger");
    }
  },

  // ----------------------------------------------------
  // TAB 6: QUẢN LÝ DANH MỤC HÀNG HÓA (PRODUCT MANAGEMENT)
  // ----------------------------------------------------
  productSearchQuery: "",
  productCategoryFilter: "ALL",

  async renderProductsTab() {
    const content = document.getElementById("manager-tab-content");
    if (!content) return;

    content.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-muted);"><i class="fa fa-spinner fa-spin"></i> Đang tải danh mục hàng hóa...</div>`;

    const res = await ApiService.getProducts();
    const products = (res && res.success && res.data) ? res.data : [];

    // Lọc theo search và category
    let filtered = products;
    if (this.productCategoryFilter !== "ALL") {
      filtered = filtered.filter(p => p.CategoryID === this.productCategoryFilter);
    }
    if (this.productSearchQuery.trim()) {
      const q = this.productSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(p => 
        (p.ProductName && p.ProductName.toLowerCase().includes(q)) ||
        (p.ProductID && p.ProductID.toLowerCase().includes(q)) ||
        (p.Packaging && p.Packaging.toLowerCase().includes(q))
      );
    }

    // Categories list for filter
    const categories = [
      { id: "ALL", name: "Tất cả danh mục" },
      { id: "DMN_XE_MAY", name: "Dầu Nhờn Xe Máy" },
      { id: "DMN_OTO", name: "Dầu Động Cơ Ô Tô & Xe Tải" },
      { id: "DMN_CONG_NGHIEP", name: "Dầu Công Nghiệp & Thủy Lực" },
      { id: "MO_BO", name: "Mỡ Bôi Trơn Chịu Nhiệt" },
      { id: "PHU_GIA", name: "Phụ Gia & Nước Làm Mát" }
    ];

    const activeCount = products.filter(p => p.Status === "ACTIVE").length;
    const inactiveCount = products.filter(p => p.Status === "INACTIVE").length;

    content.innerHTML = `
      <div style="padding: 1.25rem;">
        <!-- Top Banner & Add Button -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h2 style="font-size: 1.3rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">
              Quản Lý Danh Mục Sản Phẩm & Hàng Hóa
            </h2>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">
              Chỉ Quản Lý (Manager) và Admin có quyền thêm, cập nhật giá niêm yết, quy cách hoặc bật/tắt kinh doanh.
            </p>
          </div>
          <button class="btn-action-large btn-meet-customer" onclick="ManagerApp.showAddProductModal()" style="padding: 0.5rem 1.25rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
            <span>+</span> THÊM SẢN PHẨM MỚI
          </button>
        </div>

        <!-- KPI Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
          <div style="background: var(--bg-card); padding: 1rem; border-radius: 10px; border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Tổng Số Mặt Hàng</div>
            <div style="font-size: 1.6rem; font-weight: 700; color: var(--text-main);">${products.length}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">Mã hàng trong hệ thống</div>
          </div>
          <div style="background: var(--bg-card); padding: 1rem; border-radius: 10px; border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Đang Kinh Doanh</div>
            <div style="font-size: 1.6rem; font-weight: 700; color: #10b981;">${activeCount}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">Khả dụng cho Sales lên đơn</div>
          </div>
          <div style="background: var(--bg-card); padding: 1rem; border-radius: 10px; border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Tạm Ngừng Kinh Doanh</div>
            <div style="font-size: 1.6rem; font-weight: 700; color: #ef4444;">${inactiveCount}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">Ẩn khỏi danh mục bán hàng</div>
          </div>
          <div style="background: var(--bg-card); padding: 1rem; border-radius: 10px; border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Phân Loại Sản Phẩm</div>
            <div style="font-size: 1.6rem; font-weight: 700; color: var(--primary);">${categories.length - 1}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">Ngành hàng dầu nhờn Kingpetro</div>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div style="background: var(--bg-card); padding: 1rem; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 1.25rem; display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;">
          <div style="flex: 1; min-width: 250px;">
            <input 
              type="text" 
              placeholder="🔍 Tìm theo tên sản phẩm, mã hoặc quy cách..." 
              value="${this.productSearchQuery}"
              oninput="ManagerApp.productSearchQuery = this.value; ManagerApp.renderProductsTab();"
              style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.9rem; background: var(--bg-main); color: var(--text-main);"
            />
          </div>
          <div style="min-width: 220px;">
            <select 
              onchange="ManagerApp.productCategoryFilter = this.value; ManagerApp.renderProductsTab();"
              style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.9rem; background: var(--bg-main); color: var(--text-main);"
            >
              ${categories.map(c => `
                <option value="${c.id}" ${this.productCategoryFilter === c.id ? 'selected' : ''}>${c.name}</option>
              `).join("")}
            </select>
          </div>
        </div>

        <!-- Products Table -->
        <div style="background: var(--bg-card); border-radius: 10px; border: 1px solid var(--border); overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; text-align: left;">
            <thead>
              <tr style="background: var(--bg-subtle); border-bottom: 2px solid var(--border); color: var(--text-muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.5px;">
                <th style="padding: 0.75rem 1rem;">Mã SP</th>
                <th style="padding: 0.75rem 1rem;">Tên Sản Phẩm</th>
                <th style="padding: 0.75rem 1rem;">Phân Loại</th>
                <th style="padding: 0.75rem 1rem;">ĐVT</th>
                <th style="padding: 0.75rem 1rem;">Quy Cách</th>
                <th style="padding: 0.75rem 1rem; text-align: right;">Đơn Giá (VNĐ)</th>
                <th style="padding: 0.75rem 1rem; text-align: center;">Trạng Thái</th>
                <th style="padding: 0.75rem 1rem; text-align: center;">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                    Không tìm thấy sản phẩm nào phù hợp với bộ lọc
                  </td>
                </tr>
              ` : filtered.map(p => {
                const isActive = p.Status === "ACTIVE";
                return `
                  <tr style="border-bottom: 1px solid var(--border); transition: background 0.15s;">
                    <td style="padding: 0.75rem 1rem; font-weight: 700; color: var(--primary);">${p.ProductID}</td>
                    <td style="padding: 0.75rem 1rem; font-weight: 600; color: var(--text-main);">
                      <div>${p.ProductName}</div>
                    </td>
                    <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.82rem;">
                      ${p.CategoryName || p.CategoryID}
                    </td>
                    <td style="padding: 0.75rem 1rem;">
                      <span style="background: var(--bg-subtle); padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">${p.Unit}</span>
                    </td>
                    <td style="padding: 0.75rem 1rem; color: var(--text-muted);">${p.Packaging || '—'}</td>
                    <td style="padding: 0.75rem 1rem; text-align: right; font-weight: 700; color: var(--text-main);">
                      ${(p.BasePrice || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td style="padding: 0.75rem 1rem; text-align: center;">
                      ${isActive ? `
                        <span style="background: #d1fae5; color: #047857; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">Đang Bán</span>
                      ` : `
                        <span style="background: #fee2e2; color: #b91c1c; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">Tạm Ngừng</span>
                      `}
                    </td>
                    <td style="padding: 0.75rem 1rem; text-align: center;">
                      <div style="display: flex; justify-content: center; gap: 0.4rem;">
                        <button 
                          class="btn-action-inline" 
                          onclick="ManagerApp.showEditProductModal('${p.ProductID}')" 
                          title="Sửa thông tin hàng hóa"
                          style="padding: 0.35rem 0.6rem; font-size: 0.78rem;"
                        >
                          ✏ Sửa
                        </button>
                        <button 
                          class="btn-action-inline" 
                          onclick="ManagerApp.toggleProductStatus('${p.ProductID}')" 
                          title="${isActive ? 'Ngừng kinh doanh' : 'Kích hoạt bán lại'}"
                          style="padding: 0.35rem 0.6rem; font-size: 0.78rem; color: ${isActive ? '#b91c1c' : '#047857'}; border-color: ${isActive ? '#fecaca' : '#a7f3d0'}; background: ${isActive ? '#fee2e2' : '#d1fae5'};"
                        >
                          ${isActive ? '⛔ Dừng' : '✓ Bán'}
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  async showAddProductModal() {
    this.showProductFormModal(null);
  },

  async showEditProductModal(productId) {
    const res = await ApiService.getProducts();
    const products = (res && res.success && res.data) ? res.data : [];
    const product = products.find(p => p.ProductID === productId);
    if (!product) {
      UI.showToast("Không tìm thấy sản phẩm!", "danger");
      return;
    }
    this.showProductFormModal(product);
  },

  showProductFormModal(product) {
    const isEdit = !!product;
    const p = product || {
      ProductID: "PROD_" + Math.floor(100 + Math.random() * 900),
      ProductName: "",
      CategoryID: "DMN_XE_MAY",
      CategoryName: "Dầu Nhờn Xe Máy",
      Unit: "Thùng",
      Packaging: "Thùng 24 chai 0.8L",
      BasePrice: 1500000,
      Status: "ACTIVE"
    };

    const categories = [
      { id: "DMN_XE_MAY", name: "Dầu Nhờn Xe Máy" },
      { id: "DMN_OTO", name: "Dầu Động Cơ Ô Tô & Xe Tải" },
      { id: "DMN_CONG_NGHIEP", name: "Dầu Công Nghiệp & Thủy Lực" },
      { id: "MO_BO", name: "Mỡ Bôi Trơn Chịu Nhiệt" },
      { id: "PHU_GIA", name: "Phụ Gia & Nước Làm Mát" }
    ];

    const units = ["Thùng", "Xô", "Chai", "Bình", "Phuy", "Lon", "Gói"];

    const content = `
      <div style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
        <span>${isEdit ? '✏ Cập Nhật Thông Tin Hàng Hóa' : '➕ Thêm Sản Phẩm Mới'}</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
        ${isEdit ? `Cập nhật thông số kỹ thuật, giá niêm yết hoặc trạng thái của mặt hàng [${p.ProductID}]` : 'Nhập thông tin sản phẩm mới vào danh mục hàng hóa của Kingpetro'}
      </p>

      <form id="product-crud-form" onsubmit="event.preventDefault(); ManagerApp.saveProductForm('${p.ProductID}', ${isEdit});" style="display: flex; flex-direction: column; gap: 0.85rem;">
        <div style="display: flex; gap: 0.75rem;">
          <div style="flex: 1;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">Mã Sản Phẩm (*)</label>
            <input type="text" id="p-form-id" value="${p.ProductID}" ${isEdit ? 'readonly' : ''} style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 6px; font-weight: 700; background: ${isEdit ? 'var(--bg-subtle)' : 'var(--bg-main)'}; color: var(--text-main);" required />
          </div>
          <div style="flex: 2;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">Phân Loại / Ngành Hàng</label>
            <select id="p-form-category" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-main); color: var(--text-main);">
              ${categories.map(c => `
                <option value="${c.id}" ${p.CategoryID === c.id ? 'selected' : ''}>${c.name}</option>
              `).join("")}
            </select>
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">Tên Sản Phẩm (*)</label>
          <input type="text" id="p-form-name" value="${p.ProductName}" placeholder="VD: Kingpetro Moto 4T 10W40 SL" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-main); color: var(--text-main);" required />
        </div>

        <div style="display: flex; gap: 0.75rem;">
          <div style="flex: 1;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">Đơn Vị Tính (ĐVT)</label>
            <select id="p-form-unit" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-main); color: var(--text-main);">
              ${units.map(u => `
                <option value="${u}" ${p.Unit === u ? 'selected' : ''}>${u}</option>
              `).join("")}
            </select>
          </div>
          <div style="flex: 2;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">Quy Cách Đóng Gói</label>
            <input type="text" id="p-form-packaging" value="${p.Packaging || ''}" placeholder="VD: Thùng 24 chai x 0.8L" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-main); color: var(--text-main);" />
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem;">
          <div style="flex: 1;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">Đơn Giá Niêm Yết (VNĐ) (*)</label>
            <input type="number" id="p-form-price" value="${p.BasePrice || 0}" min="0" step="1000" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 6px; font-weight: 700; background: var(--bg-main); color: var(--text-main);" required />
          </div>
          <div style="flex: 1;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.25rem;">Trạng Thái Kinh Doanh</label>
            <select id="p-form-status" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-main); color: var(--text-main);">
              <option value="ACTIVE" ${p.Status === 'ACTIVE' ? 'selected' : ''}>Đang Kinh Doanh (ACTIVE)</option>
              <option value="INACTIVE" ${p.Status === 'INACTIVE' ? 'selected' : ''}>Tạm Ngừng (INACTIVE)</option>
            </select>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 0.75rem;">
          <button type="button" class="btn-action-inline" onclick="UI.closeModal()" style="padding: 0.5rem 1rem;">Hủy</button>
          <button type="submit" class="btn-action-large btn-meet-customer" style="padding: 0.5rem 1.5rem;">
            ${isEdit ? 'LƯU THAY ĐỔI' : 'TẠO MỚI SẢN PHẨM'}
          </button>
        </div>
      </form>
    `;

    UI.showModal(content);
  },

  async saveProductForm(originalId, isEdit) {
    const id = document.getElementById("p-form-id").value.trim();
    const name = document.getElementById("p-form-name").value.trim();
    const catSelect = document.getElementById("p-form-category");
    const categoryId = catSelect.value;
    const categoryName = catSelect.options[catSelect.selectedIndex].text;
    const unit = document.getElementById("p-form-unit").value;
    const packaging = document.getElementById("p-form-packaging").value.trim();
    const price = parseFloat(document.getElementById("p-form-price").value) || 0;
    const status = document.getElementById("p-form-status").value;

    if (!id || !name) {
      UI.showToast("Vui lòng nhập đầy đủ mã và tên sản phẩm!", "warning");
      return;
    }

    const productData = {
      ProductID: id,
      ProductName: name,
      CategoryID: categoryId,
      CategoryName: categoryName,
      Unit: unit,
      Packaging: packaging,
      BasePrice: price,
      Status: status
    };

    UI.showLoading("Đang lưu thông tin sản phẩm...");
    const res = await ApiService.saveProduct(productData);
    UI.hideLoading();

    if (res && res.success) {
      UI.closeModal();
      UI.showToast(isEdit ? "Cập nhật sản phẩm thành công!" : "Đã thêm sản phẩm mới!", "success");
      await this.renderProductsTab();
    } else {
      UI.showToast((res && res.message) || "Lỗi lưu sản phẩm", "danger");
    }
  },

  async toggleProductStatus(productId) {
    UI.showLoading("Đang đổi trạng thái sản phẩm...");
    const res = await ApiService.toggleProductStatus(productId);
    UI.hideLoading();

    if (res && res.success) {
      UI.showToast("Đã đổi trạng thái sản phẩm thành công!", "success");
      await this.renderProductsTab();
    } else {
      UI.showToast((res && res.message) || "Lỗi đổi trạng thái", "danger");
    }
  }
};

