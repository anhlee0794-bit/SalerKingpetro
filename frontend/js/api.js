/**
 * API SERVICE LAYER & MOCK DATABASE ENGINE
 * Provides unified interface for calling Google Apps Script Web App endpoints
 * or using the high-fidelity local database engine for zero-setup demo & testing.
 */

const ApiService = {
  // Config
  gasUrlKey: "sales_field_gas_url",
  useMockKey: "sales_field_use_mock",
  authTokenKey: "sales_field_auth_token",
  offlineQueueKey: "sales_field_offline_queue",
  customersCachePrefix: "sales_field_cache_customers_",
  settingsCacheKey: "sales_field_cache_settings",
  sessionCachePrefix: "sales_field_cache_session_",
  TOKEN_TTL_MS: 3 * 24 * 60 * 60 * 1000, // 3 ngày (72 giờ)
  FETCH_TIMEOUT_MS: 12000,
  _isFlushingQueue: false,
  _onlineWatcherBound: false,

  QUEUEABLE_FIELD_ACTIONS: [
    "startWork",
    "endWork",
    "recordGps",
    "checkinVisit",
    "cancelVisit",
    "checkoutVisit",
    "checkoutCareVisit",
    "requestCustomerUpdate"
  ],

  getGasUrl() {
    return localStorage.getItem(this.gasUrlKey) || "https://hiepphucduc.vn/saler/api/api.php";
  },

  setGasUrl(url) {
    localStorage.setItem(this.gasUrlKey, url);
  },

  getAuthToken() {
    return localStorage.getItem(this.authTokenKey) || "";
  },

  setAuthToken(token) {
    if (token) {
      localStorage.setItem(this.authTokenKey, token);
    } else {
      localStorage.removeItem(this.authTokenKey);
    }
  },

  clearAuthToken() {
    localStorage.removeItem(this.authTokenKey);
  },

  isMockMode() {
    const url = this.getGasUrl();
    if (!url) return true;
    return localStorage.getItem(this.useMockKey) === "true";
  },

  setMockMode(isMock) {
    localStorage.setItem(this.useMockKey, isMock ? "true" : "false");
  },

  // ----------------------------------------------------
  // OFFLINE QUEUE & REAL-DATA CACHE (NO FAKE MOCK FALLBACK)
  // ----------------------------------------------------
  getOfflineQueue() {
    try {
      const raw = localStorage.getItem(this.offlineQueueKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  },

  saveOfflineQueue(queue) {
    try {
      const trimmed = Array.isArray(queue) ? queue.slice(-300) : [];
      localStorage.setItem(this.offlineQueueKey, JSON.stringify(trimmed));
      if (typeof SalesApp !== "undefined" && typeof SalesApp.updateOfflineBanner === "function") {
        SalesApp.updateOfflineBanner();
      }
    } catch (e) {
      console.warn("[ApiService] Failed saving offline queue:", e);
    }
  },

  getOfflineQueueCount() {
    return this.getOfflineQueue().length;
  },

  bindOnlineAutoSync() {
    if (this._onlineWatcherBound || typeof window === "undefined") return;
    this._onlineWatcherBound = true;

    window.addEventListener("online", () => {
      if (typeof SalesApp !== "undefined" && typeof SalesApp.updateOfflineBanner === "function") {
        SalesApp.updateOfflineBanner();
      }
      this.flushOfflineQueue();
    });

    window.addEventListener("offline", () => {
      if (typeof SalesApp !== "undefined" && typeof SalesApp.updateOfflineBanner === "function") {
        SalesApp.updateOfflineBanner();
      }
    });
  },

  _cacheReadResponse(action, params, data) {
    if (!data || !data.success) return;
    try {
      if (action === "getSettings" && data.settings) {
        localStorage.setItem(this.settingsCacheKey, JSON.stringify(data));
      } else if (action === "getCustomers" && Array.isArray(data.customers)) {
        const key = this.customersCachePrefix + (params.salesId || params.role || "ALL");
        localStorage.setItem(key, JSON.stringify(data));
      } else if (action === "getActiveSession" && params.salesId) {
        localStorage.setItem(this.sessionCachePrefix + params.salesId, JSON.stringify(data));
      }
    } catch (e) {
      // Ignore quota warnings
    }
  },

  _readCachedResponse(action, params) {
    try {
      if (action === "getSettings") {
        const raw = localStorage.getItem(this.settingsCacheKey);
        return raw ? { ...JSON.parse(raw), fromOfflineCache: true } : null;
      }
      if (action === "getCustomers") {
        const key = this.customersCachePrefix + (params.salesId || params.role || "ALL");
        const raw = localStorage.getItem(key);
        return raw ? { ...JSON.parse(raw), fromOfflineCache: true } : null;
      }
      if (action === "getActiveSession" && params.salesId) {
        const raw = localStorage.getItem(this.sessionCachePrefix + params.salesId);
        return raw ? { ...JSON.parse(raw), fromOfflineCache: true } : null;
      }
    } catch (e) {
      return null;
    }
    return null;
  },

  _enqueueFieldMutation(action, params) {
    const nowIso = new Date().toISOString();
    const nowSql = nowIso.replace("T", " ").substring(0, 19);
    const queue = this.getOfflineQueue();

    const itemParams = { ...params };
    delete itemParams.authToken;
    itemParams.clientTimestamp = itemParams.clientTimestamp || nowIso;

    let syntheticResponse = {
      success: true,
      queuedOffline: true,
      message: "Mất sóng mạng 4G: Thao tác đã lưu vào Hàng đợi trên máy và sẽ tự đồng bộ khi có mạng lại!"
    };

    if (action === "startWork") {
      const tempSessionId = "SES-OFFLINE-" + Date.now();
      itemParams.tempSessionId = tempSessionId;
      const sessObj = {
        SessionID: tempSessionId,
        sessionId: tempSessionId,
        SalesID: params.salesId,
        Date: nowSql.substring(0, 10),
        CheckInTime: nowSql,
        CheckInLatitude: Number(params.lat || 0),
        CheckInLongitude: Number(params.lng || 0),
        Status: "WORKING"
      };
      localStorage.setItem(this.sessionCachePrefix + params.salesId, JSON.stringify({
        success: true,
        session: sessObj,
        activeVisit: null
      }));
      syntheticResponse = { ...syntheticResponse, sessionId: tempSessionId, SessionID: tempSessionId, session: sessObj };
    } else if (action === "checkinVisit") {
      const tempVisitId = "VIS-OFFLINE-" + Date.now();
      itemParams.tempVisitId = tempVisitId;
      const visitObj = {
        VisitID: tempVisitId,
        visitId: tempVisitId,
        SalesID: params.salesId,
        CustomerID: params.customerId,
        SessionID: params.sessionId || "",
        CheckInTime: nowSql,
        CheckInLatitude: Number(params.lat || 0),
        CheckInLongitude: Number(params.lng || 0),
        Status: "IN_PROGRESS"
      };
      const sessRaw = localStorage.getItem(this.sessionCachePrefix + params.salesId);
      if (sessRaw) {
        try {
          const parsedSess = JSON.parse(sessRaw);
          parsedSess.activeVisit = visitObj;
          localStorage.setItem(this.sessionCachePrefix + params.salesId, JSON.stringify(parsedSess));
        } catch (e) {}
      }
      syntheticResponse = { ...syntheticResponse, visitId: tempVisitId, VisitID: tempVisitId, visit: visitObj };
    } else if (action === "checkoutCareVisit" || action === "checkoutVisit" || action === "cancelVisit") {
      const sessRaw = localStorage.getItem(this.sessionCachePrefix + params.salesId);
      if (sessRaw) {
        try {
          const parsedSess = JSON.parse(sessRaw);
          parsedSess.activeVisit = null;
          localStorage.setItem(this.sessionCachePrefix + params.salesId, JSON.stringify(parsedSess));
        } catch (e) {}
      }
      syntheticResponse = { ...syntheticResponse, duration: 1 };
    } else if (action === "endWork") {
      localStorage.setItem(this.sessionCachePrefix + params.salesId, JSON.stringify({
        success: true,
        session: null,
        activeVisit: null
      }));
      syntheticResponse = { ...syntheticResponse, duration: 1, workDuration: 1 };
    }

    queue.push({
      queueId: "Q-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      action,
      params: itemParams,
      queuedAt: Date.now()
    });
    this.saveOfflineQueue(queue);
    return syntheticResponse;
  },

  async flushOfflineQueue() {
    if (this.isMockMode() || this._isFlushingQueue) return { synced: 0, remaining: 0 };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { synced: 0, remaining: this.getOfflineQueueCount() };
    }

    const queue = this.getOfflineQueue();
    if (queue.length === 0) return { synced: 0, remaining: 0 };

    const token = this.getAuthToken();
    const gasUrl = this.getGasUrl();
    if (!token || !gasUrl) return { synced: 0, remaining: queue.length };

    this._isFlushingQueue = true;
    const sessionIdMap = {};
    const visitIdMap = {};
    const remaining = [];
    let syncedCount = 0;

    try {
      for (let i = 0; i < queue.length; i++) {
        const entry = queue[i];
        const payloadParams = { ...entry.params, authToken: token };

        if (payloadParams.sessionId && sessionIdMap[payloadParams.sessionId]) {
          payloadParams.sessionId = sessionIdMap[payloadParams.sessionId];
        }
        if (payloadParams.visitId && visitIdMap[payloadParams.visitId]) {
          payloadParams.visitId = visitIdMap[payloadParams.visitId];
        }

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
          const res = await fetch(gasUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: entry.action, ...payloadParams }),
            signal: controller.signal
          });
          clearTimeout(timer);
          const data = await res.json();

          if (data && data.tokenExpired) {
            // Giữ nguyên hàng đợi để sau khi đăng nhập lại vẫn đồng bộ tiếp
            remaining.push(...queue.slice(i));
            break;
          }

          if (data && data.success) {
            syncedCount++;
            if (entry.action === "startWork" && entry.params.tempSessionId && (data.SessionID || data.sessionId)) {
              const realSid = data.SessionID || data.sessionId;
              sessionIdMap[entry.params.tempSessionId] = realSid;
              if (typeof SalesApp !== "undefined" && SalesApp.activeSession && SalesApp.activeSession.SessionID === entry.params.tempSessionId) {
                SalesApp.activeSession.SessionID = realSid;
              }
            }
            if (entry.action === "checkinVisit" && entry.params.tempVisitId && (data.VisitID || data.visitId)) {
              const realVid = data.VisitID || data.visitId;
              visitIdMap[entry.params.tempVisitId] = realVid;
              if (typeof SalesApp !== "undefined" && SalesApp.activeVisit && SalesApp.activeVisit.VisitID === entry.params.tempVisitId) {
                SalesApp.activeVisit.VisitID = realVid;
              }
            }
          }
          // Nếu lỗi logic nghiệp vụ (success: false nhưng server đã phản hồi HTTP 200), bỏ qua không lặp vô hạn
        } catch (netErr) {
          // Vẫn mất mạng -> dừng và giữ nguyên các phần tử còn lại
          remaining.push(...queue.slice(i));
          break;
        }
      }

      this.saveOfflineQueue(remaining);

      if (syncedCount > 0) {
        if (typeof UI !== "undefined" && typeof UI.showToast === "function") {
          UI.showToast(`Đã tự động đồng bộ ${syncedCount} dữ liệu ngoại tuyến lên máy chủ!`, "success");
        }
        if (typeof SalesApp !== "undefined" && SalesApp.currentUser) {
          SalesApp.loadCustomers().then(() => SalesApp.render()).catch(() => {});
        }
      }
      return { synced: syncedCount, remaining: remaining.length };
    } finally {
      this._isFlushingQueue = false;
    }
  },

  /**
   * Main request dispatcher
   */
  async request(action, params = {}) {
    const token = this.getAuthToken();
    const enrichedParams = (token && !params.authToken) ? { authToken: token, ...params } : params;

    if (this.isMockMode()) {
      return MockDatabase.handleAction(action, enrichedParams);
    }

    const gasUrl = this.getGasUrl();
    if (!gasUrl) {
      return MockDatabase.handleAction(action, enrichedParams);
    }

    this.bindOnlineAutoSync();

    // Nếu có hàng đợi ngoại tuyến tồn đọng và đang có sóng, đẩy bù lên Server trước
    if (!this._isFlushingQueue && action !== "login" && action !== "verifyToken" && this.getOfflineQueueCount() > 0) {
      if (typeof navigator === "undefined" || navigator.onLine !== false) {
        await this.flushOfflineQueue();
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
      const response = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: action, ...enrichedParams }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      if (data && data.tokenExpired && action !== "login" && action !== "verifyToken") {
        if (typeof App !== "undefined" && typeof App.handleTokenExpired === "function") {
          App.handleTokenExpired(data.message);
        }
      }

      // Lưu đệm dữ liệu thật từ MySQL phục vụ Sales xem khi rớt sóng 4G
      this._cacheReadResponse(action, params, data);
      return data;
    } catch (err) {
      console.warn(`[ApiService] Network error calling Production API for action ${action}:`, err);

      // 1. Nếu là thao tác hiện trường của Sales -> Lưu vào Hàng đợi Offline (KHÔNG nhảy sang dữ liệu giả MockDatabase!)
      if (this.QUEUEABLE_FIELD_ACTIONS.includes(action)) {
        return this._enqueueFieldMutation(action, params);
      }

      // 2. Nếu là thao tác đọc tuyến khách hàng / cấu hình / phiên hiện tại -> Đọc từ bản đệm MySQL gần nhất (nếu có)
      const cached = this._readCachedResponse(action, params);
      if (cached) {
        return cached;
      }

      // 3. Các thao tác Quản trị / Đăng nhập khi rớt mạng -> Báo lỗi mạng rõ ràng
      return {
        success: false,
        offline: true,
        message: "Không thể kết nối máy chủ (Mất sóng 4G/WiFi). Vui lòng kiểm tra kết nối mạng và thử lại!"
      };
    }
  },

  // High-level API wrappers
  async login(email, password) {
    return this.request("login", { email, password });
  },

  async verifyToken(token) {
    return this.request("verifyToken", { token: token || this.getAuthToken() });
  },

  async changePassword(userId, oldPassword, newPassword) {
    return this.request("changePassword", { userId, oldPassword, newPassword });
  },

  async getUsers(role, filterRole, includeInactive = false) {
    return this.request("getUsers", { role, filterRole, includeInactive });
  },

  async saveUser(userData) {
    return this.request("saveUser", { userData });
  },

  async resetUserPassword(userId, newPassword) {
    return this.request("resetUserPassword", { userId, newPassword });
  },

  async toggleUserStatus(userId) {
    return this.request("toggleUserStatus", { userId });
  },

  async deleteUser(userId) {
    return this.request("deleteUser", { userId });
  },

  async reassignRoutes(salesId, customerIds) {
    return this.request("reassignRoutes", { salesId, customerIds });
  },

  async getActiveSession(salesId) {
    return this.request("getActiveSession", { salesId });
  },

  async startWork(salesId, lat, lng, accuracy) {
    return this.request("startWork", { salesId, lat, lng, accuracy });
  },

  async endWork(sessionId, salesId, lat, lng, accuracy) {
    return this.request("endWork", { sessionId, salesId, lat, lng, accuracy });
  },

  async recordGps(sessionId, salesId, lat, lng, accuracy, speed, forcedStatus) {
    return this.request("recordGps", { sessionId, salesId, lat, lng, accuracy, speed, forcedStatus });
  },

  async getCustomers(salesId, role) {
    return this.request("getCustomers", { salesId, role });
  },

  async createCustomer(data, role, creatorId) {
    return this.request("createCustomer", { data, role, creatorId });
  },

  async updateCustomer(customerId, data, role) {
    return this.request("updateCustomer", { customerId, data, role });
  },

  async deleteCustomer(customerId, role) {
    return this.request("deleteCustomer", { customerId, role });
  },

  async approveCustomer(customerId, approved, approverId) {
    return this.request("approveCustomer", { customerId, approved, approverId });
  },

  async getCustomerVisits(customerId) {
    return this.request("getCustomerVisits", { customerId });
  },

  async checkinVisit(salesId, customerId, sessionId, lat, lng, accuracy) {
    return this.request("checkinVisit", { salesId, customerId, sessionId, lat, lng, accuracy });
  },

  async cancelVisit(visitId, salesId) {
    return this.request("cancelVisit", { visitId, salesId });
  },

  async checkoutVisit(visitId, salesId, result, note) {
    return this.request("checkoutVisit", { visitId, salesId, result, note });
  },

  async checkoutCareVisit(visitId, salesId, careData) {
    return this.request("checkoutCareVisit", { visitId, salesId, careData });
  },

  async getManagerDashboard(date) {
    return this.request("getManagerDashboard", { date });
  },

  async getSalesTimeline(salesId, date) {
    return this.request("getSalesTimeline", { salesId, date });
  },

  async getPerformanceReports(salesId, period, date) {
    return this.request("getPerformanceReports", { salesId, period, date });
  },

  async getSettings() {
    return this.request("getSettings");
  },

  async saveSettings(settings) {
    return this.request("saveSettings", { settings });
  },

  async cleanupGpsLogs(retentionDays = 90) {
    return this.request("cleanupGpsLogs", { retentionDays });
  },

  // Customer Info Approval Flow
  async requestCustomerUpdate(salesId, customerId, customerName, oldData, newData, reason) {
    return this.request("requestCustomerUpdate", { salesId, customerId, customerName, oldData, newData, reason });
  },

  async getCustomerUpdateRequests(status) {
    return this.request("getCustomerUpdateRequests", { status });
  },

  async resolveCustomerUpdateRequest(requestId, isApproved, rejectReason, approverName) {
    return this.request("resolveCustomerUpdateRequest", { requestId, isApproved, rejectReason, approverName });
  },

  // Product Catalog Management
  async getProducts(category, status) {
    const res = await this.request("getProducts", { category, status });
    if (res && res.success) {
      const list = res.products || res.data || [];
      if (typeof ProductService !== "undefined" && typeof ProductService.syncCatalog === "function") {
        ProductService.syncCatalog(list);
      }
    }
    return res;
  },

  async saveProduct(productData, role) {
    return this.request("saveProduct", { productData, role: role || "MANAGER" });
  },

  async toggleProductStatus(productId, role) {
    return this.request("toggleProductStatus", { productId, role: role || "MANAGER" });
  },

  async deleteProduct(productId, role) {
    return this.request("deleteProduct", { productId, role: role || "MANAGER" });
  }
};

/**
 * High-Fidelity In-Memory & LocalStorage Database Mock
 * Implements 100% of the Google Sheets tables and backend business rules.
 */
const MockDatabase = {
  dbKey: "sales_field_mock_db_v2",

  getDB() {
    let db = localStorage.getItem(this.dbKey);
    if (!db) {
      db = this.initDefaultDB();
      this.saveDB(db);
    } else {
      db = JSON.parse(db);
      let changed = false;
      if (!db.CUSTOMER_UPDATE_REQUESTS) {
        db.CUSTOMER_UPDATE_REQUESTS = this.initDefaultCustomerRequests();
        changed = true;
      }
      if (!db.PRODUCTS) {
        db.PRODUCTS = this.initDefaultProducts();
        changed = true;
      }
      if (!db.PRODUCT_CATEGORIES) {
        db.PRODUCT_CATEGORIES = ["Sơn Phủ", "Phụ Gia", "Sơn Lót", "Chống Thấm", "Dung Môi", "Dầu Nhờn & Mỡ Bôi Trơn", "Hóa Chất"];
        changed = true;
      }
      if (changed) this.saveDB(db);
    }
    return db;
  },

  saveDB(db) {
    localStorage.setItem(this.dbKey, JSON.stringify(db));
  },

  initDefaultCustomerRequests() {
    return [
      {
        RequestID: "REQ-001",
        CustomerID: "CUST-001",
        CustomerName: "Đại lý Tạp Hóa Minh Phát",
        SalesID: "USR-002",
        SalesName: "Nguyễn Văn A",
        OldData: {
          ContactName: "Anh Minh",
          Phone: "0912345601",
          Address: "128 Nguyễn Trãi, Q.1, TP.HCM",
          Note: "Khách hàng lớn, cần theo dõi tồn kho sát sao"
        },
        NewData: {
          ContactName: "Anh Minh (Chủ đại lý)",
          Phone: "0912345999",
          Address: "128A Nguyễn Trãi, Phường Bến Thành, Q.1, TP.HCM",
          Note: "Đại lý mới mở rộng thêm gian hàng bên cạnh, liên hệ ưu tiên số mới"
        },
        Reason: "Đại lý đổi số hotline và mở rộng thêm diện tích kinh doanh",
        Status: "PENDING",
        CreatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        ResolvedAt: null,
        ApproverName: null,
        RejectReason: null
      },
      {
        RequestID: "REQ-002",
        CustomerID: "CUST-003",
        CustomerName: "Nhà Phân Phối Bách Hóa Á Châu",
        SalesID: "USR-003",
        SalesName: "Trần Thị B",
        OldData: {
          ContactName: "Anh Hùng",
          Phone: "0912345603",
          Address: "320 Cách Mạng Tháng 8, Q.3, TP.HCM",
          Note: "Đang đàm phán hợp đồng"
        },
        NewData: {
          ContactName: "Anh Hùng (GĐ Kinh Doanh)",
          Phone: "0912345603",
          Address: "320 Cách Mạng Tháng 8, Phường 10, Q.3, TP.HCM",
          Note: "Đã ký hợp đồng phân phối chính thức, hạn thanh toán 15 ngày"
        },
        Reason: "Cập nhật chức danh liên hệ và điều khoản thanh toán",
        Status: "APPROVED",
        CreatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        ResolvedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        ApproverName: "Quản Lý Nguyễn",
        RejectReason: null
      }
    ];
  },

  initDefaultProducts() {
    return [
      { id: "PRD-001", name: "Sơn Ngoại Thất Cao Cấp SuperShield", category: "Sơn Phủ", defaultUnit: "Thùng", ratio: 24, baseUnit: "Chai", price: 1250000, status: "ACTIVE", spec: "Thùng 20L (quy cách 24 lon)" },
      { id: "PRD-002", name: "Dung Dịch Phủ Bóng Nano Pro", category: "Phụ Gia", defaultUnit: "Chai", ratio: 1, baseUnit: "Chai", price: 180000, status: "ACTIVE", spec: "Chai 1L" },
      { id: "PRD-003", name: "Sơn Lót Kháng Kiềm Chống Kiềm Hóa", category: "Sơn Lót", defaultUnit: "Xô", ratio: 18, baseUnit: "Chai", price: 890000, status: "ACTIVE", spec: "Xô tiêu chuẩn 18L" },
      { id: "PRD-004", name: "Keo Chống Thấm Polyurethane Công Nghiệp", category: "Chống Thấm", defaultUnit: "Phuy", ratio: 200, baseUnit: "Chai", price: 9500000, status: "ACTIVE", spec: "Phuy thép 200L" },
      { id: "PRD-005", name: "Dung Môi Tẩy Rửa & Pha Sơn Eco", category: "Dung Môi", defaultUnit: "Bình", ratio: 4, baseUnit: "Chai", price: 320000, status: "ACTIVE", spec: "Can 4L" },
      { id: "PRD-006", name: "Dầu Nhờn Động Cơ KingPetro Heavy-Duty", category: "Dầu Nhờn & Mỡ Bôi Trơn", defaultUnit: "Thùng", ratio: 24, baseUnit: "Chai", price: 1450000, status: "ACTIVE", spec: "Thùng 24 lon x 1L" },
      { id: "PRD-007", name: "Mỡ Bôi Trơn Công Nghiệp Chịu Nhiệt EP-3", category: "Dầu Nhờn & Mỡ Bôi Trơn", defaultUnit: "Xô", ratio: 18, baseUnit: "Chai", price: 1680000, status: "INACTIVE", spec: "Xô 18kg" }
    ];
  },

  initDefaultDB() {
    const today = new Date().toISOString().split("T")[0];
    return {
      USERS: [
        { UserID: "USR-000", Name: "Admin Hệ Thống", Email: "admin@company.com", Role: "ADMIN", Phone: "0901234500", Team: "HQ", Status: "ACTIVE" },
        { UserID: "USR-001", Name: "Quản Lý Nguyễn", Email: "manager@company.com", Role: "MANAGER", Phone: "0901234567", Team: "North Team", Status: "ACTIVE" },
        { UserID: "USR-002", Name: "Nguyễn Văn A", Email: "sales.a@company.com", Role: "SALES", Phone: "0901234568", Team: "North Team", Status: "ACTIVE" },
        { UserID: "USR-003", Name: "Trần Thị B", Email: "sales.b@company.com", Role: "SALES", Phone: "0901234569", Team: "North Team", Status: "ACTIVE" },
        { UserID: "USR-004", Name: "Lê Văn C", Email: "sales.c@company.com", Role: "SALES", Phone: "0901234570", Team: "North Team", Status: "ACTIVE" }
      ],
      CUSTOMERS: [
        // Seed customers with diverse care statuses: 1 Overdue VIP, 1 Due Soon, 1 On Track, 1 Never Visited
        {
          CustomerID: "CUST-001",
          CustomerName: "Đại lý Tạp Hóa Minh Phát",
          ContactName: "Anh Minh",
          Phone: "0912345601",
          Address: "128 Nguyễn Trãi, Q.1, TP.HCM",
          Latitude: 10.7685,
          Longitude: 106.6892,
          AssignedSalesID: "USR-002",
          Status: "ACTIVE",
          CustomerType: "VIP",
          CareCycleDays: 3,
          LastCareDate: "2026-09-11T08:30:00.000Z",
          NextCareDate: "2026-09-14T08:30:00.000Z",
          CurrentDebt: 28000000,
          CurrentStock: 40,
          StockUnit: "Thùng",
          Note: "Khách hàng lớn, cần theo dõi tồn kho sát sao"
        },
        {
          CustomerID: "CUST-002",
          CustomerName: "Siêu Thị Mini VinaMart",
          ContactName: "Chị Lan",
          Phone: "0912345602",
          Address: "45 Lê Lợi, Bến Nghé, Q.1, TP.HCM",
          Latitude: 10.7769,
          Longitude: 106.7009,
          AssignedSalesID: "USR-002",
          Status: "ACTIVE",
          CustomerType: "NORMAL",
          CareCycleDays: 7,
          LastCareDate: "2026-09-13T09:15:00.000Z",
          NextCareDate: "2026-09-20T09:15:00.000Z",
          CurrentDebt: 12000000,
          CurrentStock: 85,
          StockUnit: "Chai",
          Note: "Giao hàng buổi sáng"
        },
        {
          CustomerID: "CUST-003",
          CustomerName: "Nhà Phân Phối Bách Hóa Á Châu",
          ContactName: "Anh Hùng",
          Phone: "0912345603",
          Address: "320 Cách Mạng Tháng 8, Q.3, TP.HCM",
          Latitude: 10.7812,
          Longitude: 106.6775,
          AssignedSalesID: "USR-003",
          Status: "ACTIVE",
          CustomerType: "VIP",
          CareCycleDays: 3,
          LastCareDate: "2026-09-17T10:00:00.000Z",
          NextCareDate: "2026-09-20T10:00:00.000Z",
          CurrentDebt: 45000000,
          CurrentStock: 180,
          StockUnit: "Xô",
          Note: "Doanh số tốt, đang đàm phán hợp đồng mở rộng"
        },
        {
          CustomerID: "CUST-004",
          CustomerName: "Cửa Hàng Tiện Lợi Sao Mai",
          ContactName: "Cô Mai",
          Phone: "0912345604",
          Address: "88 Hai Bà Trưng, Q.1, TP.HCM",
          Latitude: 10.7801,
          Longitude: 106.6998,
          AssignedSalesID: "USR-002",
          Status: "ACTIVE",
          CustomerType: "NORMAL",
          CareCycleDays: 7,
          LastCareDate: "2026-09-05T14:20:00.000Z",
          NextCareDate: "2026-09-12T14:20:00.000Z",
          CurrentDebt: 35000000,
          CurrentStock: 30,
          StockUnit: "Bình",
          Note: "Đã quá hạn 7 ngày chưa được chăm sóc!"
        },
        {
          CustomerID: "CUST-005",
          CustomerName: "Đại Lý Sữa Bỉm Khang Thịnh",
          ContactName: "Anh Thịnh",
          Phone: "0912345605",
          Address: "15 Lý Thường Kiệt, Q.10, TP.HCM",
          Latitude: 10.7628,
          Longitude: 106.6587,
          AssignedSalesID: "USR-004",
          Status: "ACTIVE",
          CustomerType: "SMALL",
          CareCycleDays: 14,
          LastCareDate: "",
          NextCareDate: "",
          CurrentDebt: 0,
          CurrentStock: 0,
          StockUnit: "Phuy",
          Note: "Khách hàng mới chưa từng được chăm sóc"
        }
      ],
      WORK_SESSIONS: [
        // Seed an existing session for Tran Thi B to showcase live manager dashboard
        {
          SessionID: "SESS-MOCK-B01",
          SalesID: "USR-003",
          Date: today,
          CheckInTime: `${today}T08:15:00.000Z`,
          CheckInLatitude: 10.7800,
          CheckInLongitude: 106.6780,
          CheckInAccuracy: 12,
          CheckOutTime: "",
          CheckOutLatitude: "",
          CheckOutLongitude: "",
          WorkDuration: 45,
          Status: "WORKING"
        }
      ],
      GPS_LOGS: [
        { GPSLogID: "GPS-B01", SessionID: "SESS-MOCK-B01", SalesID: "USR-003", Timestamp: `${today}T08:15:00.000Z`, Latitude: 10.7800, Longitude: 106.6780, Accuracy: 12, Speed: 0, ActivityStatus: "STATIONARY" },
        { GPSLogID: "GPS-B02", SessionID: "SESS-MOCK-B01", SalesID: "USR-003", Timestamp: `${today}T08:30:00.000Z`, Latitude: 10.7812, Longitude: 106.6775, Accuracy: 10, Speed: 3.5, ActivityStatus: "MOVING" }
      ],
      VISITS: [
        {
          VisitID: "VIS-B01",
          SalesID: "USR-003",
          CustomerID: "CUST-003",
          SessionID: "SESS-MOCK-B01",
          CheckInTime: `${today}T08:35:00.000Z`,
          CheckInLatitude: 10.7812,
          CheckInLongitude: 106.6775,
          CheckInAccuracy: 10,
          CheckOutTime: "",
          Duration: 25,
          Result: "",
          Note: "",
          DistributedQty: 0,
          InventoryQty: 0,
          RecordedDebt: 0,
          NewOrderQty: 0,
          Status: "IN_PROGRESS"
        }
      ],
      SCHEDULES: [],
      SETTINGS: {
        GPS_INTERVAL: 5,
        CUSTOMER_RADIUS: 50,
        MOVING_SPEED_THRESHOLD: 1.2,
        STATIONARY_DISTANCE_THRESHOLD: 30,
        STATIONARY_TIME: 15,
        GPS_ACCURACY_LIMIT: 80,
        CARE_CYCLE_VIP: 3,
        CARE_CYCLE_NORMAL: 7,
        CARE_CYCLE_SMALL: 14,
        OVERDUE_WARNING_DAYS: 1,
        PROXIMITY_ALERT_RADIUS: 100,
        // Dwell Time / Auto-Checkin settings
        DWELL_RADIUS: 30,              // meters — geofence radius for passive check-in detection
        DWELL_THRESHOLD_MINUTES: 5     // minutes STATIONARY inside geofence to trigger auto-checkin
      },
      CUSTOMER_UPDATE_REQUESTS: this.initDefaultCustomerRequests(),
      PRODUCTS: this.initDefaultProducts(),
      PRODUCT_CATEGORIES: ["Sơn Phủ", "Phụ Gia", "Sơn Lót", "Chống Thấm", "Dung Môi", "Dầu Nhờn & Mỡ Bôi Trơn", "Hóa Chất"],
      LOGS: []
    };
  },

  resetDB() {
    localStorage.removeItem(this.dbKey);
    return this.initDefaultDB();
  },

  handleAction(action, params) {
    const db = this.getDB();
    const today = new Date().toISOString().split("T")[0];

    switch (action) {
      case "requestCustomerUpdate": {
        const reqId = "REQ-" + Date.now();
        const newReq = {
          RequestID: reqId,
          CustomerID: params.customerId,
          CustomerName: params.customerName || "Khách Hàng",
          SalesID: params.salesId,
          SalesName: params.salesName || ((db.USERS || []).find(u => u.UserID === params.salesId)?.Name || params.salesId),
          OldData: params.oldData || {},
          NewData: params.newData || {},
          Reason: params.reason || "",
          Status: "PENDING",
          CreatedAt: new Date().toISOString(),
          ResolvedAt: null,
          ApproverName: null,
          RejectReason: null
        };
        db.CUSTOMER_UPDATE_REQUESTS.unshift(newReq);
        this.saveDB(db);
        return { success: true, request: newReq, message: "Đã gửi yêu cầu cập nhật thông tin thành công! Đang chờ Quản lý phê duyệt." };
      }

      case "getCustomerUpdateRequests": {
        let list = db.CUSTOMER_UPDATE_REQUESTS || [];
        if (params.status && params.status !== "ALL") {
          list = list.filter(r => r.Status === params.status);
        }
        return { success: true, requests: list };
      }

      case "resolveCustomerUpdateRequest": {
        const req = (db.CUSTOMER_UPDATE_REQUESTS || []).find(r => r.RequestID === params.requestId);
        if (!req) return { success: false, message: "Không tìm thấy yêu cầu cập nhật" };

        req.ResolvedAt = new Date().toISOString();
        req.ApproverName = params.approverName || "Quản Lý";

        if (params.isApproved) {
          req.Status = "APPROVED";
          const cust = (db.CUSTOMERS || []).find(c => c.CustomerID === req.CustomerID);
          if (cust && req.NewData) {
            if (req.NewData.ContactName) cust.ContactName = req.NewData.ContactName;
            if (req.NewData.Phone) cust.Phone = req.NewData.Phone;
            if (req.NewData.Address) cust.Address = req.NewData.Address;
            if (req.NewData.Note !== undefined) cust.Note = req.NewData.Note;
            if (req.NewData.CustomerType) {
              cust.CustomerType = req.NewData.CustomerType;
              cust.CareCycleDays = req.NewData.CustomerType === "VIP" ? 3 : (req.NewData.CustomerType === "SMALL" ? 14 : 7);
            }
          }
        } else {
          req.Status = "REJECTED";
          req.RejectReason = params.rejectReason || "Không đủ thông tin xác thực";
        }

        this.saveDB(db);
        const actionLabel = params.isApproved ? "phê duyệt" : "từ chối";
        return { success: true, request: req, message: `Đã ${actionLabel} yêu cầu thành công!` };
      }

      case "getProducts": {
        let prods = (db.PRODUCTS || []).map(p => ({
          ProductID: p.ProductID || p.id,
          ProductName: p.ProductName || p.name,
          CategoryID: p.CategoryID || p.category,
          CategoryName: p.CategoryName || p.category,
          Unit: p.Unit || p.defaultUnit || "Thùng",
          Packaging: p.Packaging !== undefined ? p.Packaging : (p.spec || ""),
          BasePrice: Number(p.BasePrice !== undefined ? p.BasePrice : (p.price || 0)),
          Status: p.Status || p.status || "ACTIVE",
          id: p.id || p.ProductID,
          name: p.name || p.ProductName,
          category: p.category || p.CategoryName || p.CategoryID,
          defaultUnit: p.defaultUnit || p.Unit || "Thùng",
          ratio: Number(p.ratio || 24),
          baseUnit: p.baseUnit || "Chai",
          price: Number(p.price !== undefined ? p.price : (p.BasePrice || 0)),
          status: p.status || p.Status || "ACTIVE",
          spec: p.spec !== undefined ? p.spec : (p.Packaging || "")
        }));
        if (params.category && params.category !== "ALL") {
          prods = prods.filter(p => p.CategoryID === params.category || p.category === params.category);
        }
        if (params.status && params.status !== "ALL") {
          prods = prods.filter(p => p.Status === params.status);
        }
        return { success: true, products: prods, data: prods, categories: db.PRODUCT_CATEGORIES || [] };
      }

      case "saveProduct": {
        const pData = params.productData || {};
        let prods = db.PRODUCTS || [];
        const targetId = pData.ProductID || pData.id || ("PRD-" + String(prods.length + 1).padStart(3, "0"));
        const targetName = pData.ProductName || pData.name || "";
        const targetCat = pData.CategoryName || pData.CategoryID || pData.category || "Dầu Nhờn & Mỡ Bôi Trơn";
        const targetUnit = pData.Unit || pData.defaultUnit || "Thùng";
        const ratioMap = { "Thùng": 24, "Xô": 18, "Bình": 4, "Phuy": 200, "Chai": 1 };
        const targetRatio = Number(pData.ratio) || ratioMap[targetUnit] || 1;
        const targetPrice = Number(pData.BasePrice !== undefined ? pData.BasePrice : pData.price) || 0;
        const targetStatus = pData.Status || pData.status || "ACTIVE";
        const targetSpec = pData.Packaging !== undefined ? pData.Packaging : (pData.spec || "");

        const existingIdx = prods.findIndex(p => (p.id || p.ProductID) === targetId);
        const record = {
          id: targetId,
          ProductID: targetId,
          name: targetName,
          ProductName: targetName,
          category: targetCat,
          CategoryID: targetCat,
          CategoryName: targetCat,
          defaultUnit: targetUnit,
          Unit: targetUnit,
          ratio: targetRatio,
          baseUnit: "Chai",
          price: targetPrice,
          BasePrice: targetPrice,
          status: targetStatus,
          Status: targetStatus,
          spec: targetSpec,
          Packaging: targetSpec
        };

        if (existingIdx >= 0) {
          prods[existingIdx] = { ...prods[existingIdx], ...record };
        } else {
          prods.unshift(record);
        }
        db.PRODUCTS = prods;
        this.saveDB(db);
        return { success: true, productId: targetId, message: "Đã lưu thông tin hàng hóa thành công!" };
      }

      case "toggleProductStatus": {
        const prod = (db.PRODUCTS || []).find(p => (p.id || p.ProductID) === params.productId);
        if (!prod) return { success: false, message: "Không tìm thấy sản phẩm" };
        const nextSt = (prod.status || prod.Status) === "ACTIVE" ? "INACTIVE" : "ACTIVE";
        prod.status = nextSt;
        prod.Status = nextSt;
        this.saveDB(db);
        return { success: true, newStatus: nextSt, product: prod, message: `Đã chuyển trạng thái sang ${nextSt === 'ACTIVE' ? 'Đang kinh doanh' : 'Ngừng kinh doanh'}!` };
      }

      case "deleteProduct": {
        const idx = (db.PRODUCTS || []).findIndex(p => (p.id || p.ProductID) === params.productId);
        if (idx < 0) return { success: false, message: "Không tìm thấy sản phẩm cần xóa" };
        const removed = db.PRODUCTS.splice(idx, 1)[0];
        this.saveDB(db);
        return { success: true, message: `Đã xóa mặt hàng ${removed.name || removed.ProductName}!` };
      }

      case "getSettings":
        return { success: true, settings: db.SETTINGS };

      case "saveSettings": {
        db.SETTINGS = { ...(db.SETTINGS || {}), ...(params.settings || {}) };
        this.saveDB(db);
        return { success: true, settings: db.SETTINGS, message: "Đã lưu cấu hình thông số hệ thống thành công!" };
      }

      case "saveUser": {
        const uData = params.userData || {};
        const uId = (uData.UserID || uData.userId || "").trim();
        const email = (uData.Email || uData.email || "").trim();
        const name = (uData.Name || uData.name || "").trim();
        if (!name || !email) return { success: false, message: "Họ tên và Email không được để trống!" };

        const existingIdx = (db.USERS || []).findIndex(u => u.UserID === uId);
        if (existingIdx >= 0) {
          const dup = db.USERS.find((u, i) => i !== existingIdx && u.Email.toLowerCase() === email.toLowerCase());
          if (dup) return { success: false, message: `Email ${email} đã được sử dụng!` };
          const updated = {
            ...db.USERS[existingIdx],
            Name: name,
            Email: email,
            Phone: uData.Phone !== undefined ? uData.Phone : db.USERS[existingIdx].Phone,
            Role: uData.Role || db.USERS[existingIdx].Role,
            Team: uData.Team !== undefined ? uData.Team : db.USERS[existingIdx].Team,
            Status: uData.Status || db.USERS[existingIdx].Status || "ACTIVE"
          };
          if (uData.Password && String(uData.Password).trim().length >= 6) {
            updated.Password = String(uData.Password).trim();
          }
          db.USERS[existingIdx] = updated;
          this.saveDB(db);
          return { success: true, user: updated, message: `Đã cập nhật nhân sự ${name}!` };
        } else {
          const dup = (db.USERS || []).find(u => u.Email.toLowerCase() === email.toLowerCase());
          if (dup) return { success: false, message: `Email ${email} đã tồn tại!` };
          const newUser = {
            UserID: uId || ("USR-" + String(Date.now()).slice(-4)),
            Name: name,
            Email: email,
            Password: (uData.Password && String(uData.Password).trim()) || "123456",
            Role: uData.Role || "SALES",
            Phone: uData.Phone || "",
            Team: uData.Team || "North Team",
            Status: uData.Status || "ACTIVE",
            CreatedAt: new Date().toISOString()
          };
          db.USERS.push(newUser);
          this.saveDB(db);
          return { success: true, user: newUser, message: `Đã thêm nhân sự ${name} thành công!` };
        }
      }

      case "resetUserPassword": {
        const u = (db.USERS || []).find(x => x.UserID === params.userId);
        if (!u) return { success: false, message: "Không tìm thấy nhân sự!" };
        if (!params.newPassword || params.newPassword.length < 6) {
          return { success: false, message: "Mật khẩu mới phải tối thiểu 6 ký tự!" };
        }
        u.Password = params.newPassword;
        this.saveDB(db);
        return { success: true, message: `Đã đặt lại mật khẩu mới cho ${u.Name}!` };
      }

      case "toggleUserStatus": {
        const u = (db.USERS || []).find(x => x.UserID === params.userId);
        if (!u) return { success: false, message: "Không tìm thấy nhân sự!" };
        u.Status = (u.Status === "INACTIVE") ? "ACTIVE" : "INACTIVE";
        this.saveDB(db);
        return { success: true, newStatus: u.Status, message: `Đã đổi trạng thái ${u.Name} sang ${u.Status}!` };
      }

      case "deleteUser": {
        const idx = (db.USERS || []).findIndex(x => x.UserID === params.userId);
        if (idx < 0) return { success: false, message: "Không tìm thấy nhân sự cần xóa!" };
        const removed = db.USERS.splice(idx, 1)[0];
        (db.CUSTOMERS || []).forEach(c => {
          if (c.AssignedSalesID === params.userId) c.AssignedSalesID = "";
        });
        this.saveDB(db);
        return { success: true, message: `Đã xóa nhân sự ${removed.Name}!` };
      }

      case "reassignRoutes": {
        const selected = new Set(params.customerIds || []);
        (db.CUSTOMERS || []).forEach(c => {
          if (selected.has(c.CustomerID)) {
            c.AssignedSalesID = params.salesId;
          } else if (c.AssignedSalesID === params.salesId) {
            c.AssignedSalesID = "";
          }
        });
        this.saveDB(db);
        return { success: true, message: "Đã cập nhật phân bổ tuyến bán hàng!" };
      }

      case "deleteCustomer": {
        const idx = (db.CUSTOMERS || []).findIndex(c => c.CustomerID === params.customerId);
        if (idx < 0) return { success: false, message: "Không tìm thấy khách hàng cần xóa!" };
        const removed = db.CUSTOMERS.splice(idx, 1)[0];
        this.saveDB(db);
        return { success: true, message: `Đã xóa khách hàng ${removed.CustomerName}!` };
      }

      case "login": {
        const user = db.USERS.find(u => u.Email.toLowerCase().trim() === (params.email || "").toLowerCase().trim() && u.Status === "ACTIVE");
        if (!user) return { success: false, message: "Tài khoản không tồn tại hoặc đã bị khóa" };
        const reqPass = params.password || "";
        const userPass = user.Password || "123456";
        if (reqPass && reqPass !== userPass) {
          return { success: false, message: "Mật khẩu không chính xác. Vui lòng thử lại." };
        }
        const nowSec = Math.floor(Date.now() / 1000);
        const expSec = nowSec + 3 * 86400; // 3 ngày
        const payloadObj = { sub: user.UserID, email: user.Email, role: user.Role, iat: nowSec, exp: expSec };
        const encodedPayload = btoa(unescape(encodeURIComponent(JSON.stringify(payloadObj))));
        const mockToken = `mockjwt.${encodedPayload}.sig`;
        return { success: true, user, token: mockToken, expiresAt: expSec * 1000, ttlDays: 3 };
      }

      case "verifyToken": {
        const tok = params.token || params.authToken || "";
        if (!tok || typeof tok !== "string") {
          return { success: false, tokenExpired: true, message: "Không tìm thấy Token đăng nhập." };
        }
        try {
          const parts = tok.split(".");
          if (parts.length !== 3) throw new Error("Invalid token format");
          const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          const payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
          const nowSec = Math.floor(Date.now() / 1000);
          if (!payload.exp || Number(payload.exp) <= nowSec) {
            return { success: false, tokenExpired: true, message: "Phiên đăng nhập 3 ngày đã hết hạn. Vui lòng đăng nhập lại!" };
          }
          const user = db.USERS.find(u => u.UserID === payload.sub && u.Status === "ACTIVE");
          if (!user) {
            return { success: false, tokenExpired: true, message: "Tài khoản không tồn tại hoặc đã bị khóa." };
          }
          return { success: true, user, expiresAt: Number(payload.exp) * 1000 };
        } catch (err) {
          return { success: false, tokenExpired: true, message: "Token đăng nhập không hợp lệ." };
        }
      }

      case "changePassword": {
        const user = db.USERS.find(u => u.UserID === params.userId && u.Status === "ACTIVE");
        if (!user) return { success: false, message: "Không tìm thấy thông tin tài khoản" };
        const oldPass = params.oldPassword || "";
        const userPass = user.Password || "123456";
        if (oldPass !== userPass) {
          return { success: false, message: "Mật khẩu hiện tại không chính xác" };
        }
        if (!params.newPassword || params.newPassword.length < 6) {
          return { success: false, message: "Mật khẩu mới phải có tối thiểu 6 ký tự" };
        }
        user.Password = params.newPassword;
        this.saveDB(db);
        const nowSec = Math.floor(Date.now() / 1000);
        const expSec = nowSec + 3 * 86400;
        const payloadObj = { sub: user.UserID, email: user.Email, role: user.Role, iat: nowSec, exp: expSec };
        const encodedPayload = btoa(unescape(encodeURIComponent(JSON.stringify(payloadObj))));
        return {
          success: true,
          message: "Đổi mật khẩu thành công!",
          token: `mockjwt.${encodedPayload}.sig`,
          expiresAt: expSec * 1000
        };
      }

      case "getUsers":
        return { success: true, users: db.USERS };

      case "getActiveSession": {
        const session = db.WORK_SESSIONS.find(s => s.SalesID === params.salesId && s.Status === "WORKING");
        return { success: true, session: session || null };
      }

      case "startWork": {
        const active = db.WORK_SESSIONS.find(s => s.SalesID === params.salesId && s.Status === "WORKING");
        if (active) return { success: true, session: active, message: "Phiên làm việc đã tồn tại" };

        const sessionId = "SESS-" + Date.now();
        const nowIso = new Date().toISOString();
        const newSession = {
          SessionID: sessionId,
          SalesID: params.salesId,
          Date: today,
          CheckInTime: nowIso,
          CheckInLatitude: params.lat || 0,
          CheckInLongitude: params.lng || 0,
          CheckInAccuracy: params.accuracy || 0,
          CheckOutTime: "",
          CheckOutLatitude: "",
          CheckOutLongitude: "",
          WorkDuration: 0,
          Status: "WORKING"
        };
        db.WORK_SESSIONS.push(newSession);

        if (params.lat && params.lng) {
          db.GPS_LOGS.push({
            GPSLogID: "GPS-" + Date.now(),
            SessionID: sessionId,
            SalesID: params.salesId,
            Timestamp: nowIso,
            Latitude: params.lat,
            Longitude: params.lng,
            Accuracy: params.accuracy || 0,
            Speed: 0,
            ActivityStatus: "STATIONARY"
          });
        }
        this.saveDB(db);
        return { success: true, session: newSession };
      }

      case "endWork": {
        const session = db.WORK_SESSIONS.find(s => s.SessionID === params.sessionId && s.SalesID === params.salesId && s.Status === "WORKING");
        if (!session) return { success: false, message: "Không tìm thấy phiên làm việc đang chạy" };

        // Close any ongoing visit
        const activeVisit = db.VISITS.find(v => v.SessionID === params.sessionId && v.Status === "IN_PROGRESS");
        if (activeVisit) {
          activeVisit.CheckOutTime = new Date().toISOString();
          activeVisit.Status = "COMPLETED";
          activeVisit.Result = "Tự động hoàn thành khi hết ca";
        }

        const now = new Date();
        const duration = Math.round((now.getTime() - new Date(session.CheckInTime).getTime()) / (1000 * 60));
        session.CheckOutTime = now.toISOString();
        session.CheckOutLatitude = params.lat || 0;
        session.CheckOutLongitude = params.lng || 0;
        session.WorkDuration = duration;
        session.Status = "COMPLETED";

        if (params.lat && params.lng) {
          db.GPS_LOGS.push({
            GPSLogID: "GPS-" + Date.now(),
            SessionID: session.SessionID,
            SalesID: params.salesId,
            Timestamp: now.toISOString(),
            Latitude: params.lat,
            Longitude: params.lng,
            Accuracy: params.accuracy || 0,
            Speed: 0,
            ActivityStatus: "STATIONARY"
          });
        }

        this.saveDB(db);
        return { success: true, duration };
      }

      case "recordGps": {
        const session = db.WORK_SESSIONS.find(s => s.SalesID === params.salesId && s.Status === "WORKING");
        if (!session && !params.forcedStatus) {
          return { success: false, message: "Không thể ghi nhận GPS ngoài phiên làm việc" };
        }

        const logId = "GPS-" + Date.now();
        const nowIso = new Date().toISOString();
        const newLog = {
          GPSLogID: logId,
          SessionID: params.sessionId,
          SalesID: params.salesId,
          Timestamp: nowIso,
          Latitude: params.lat,
          Longitude: params.lng,
          Accuracy: params.accuracy || 0,
          Speed: params.speed || 0,
          ActivityStatus: params.forcedStatus || "MOVING"
        };
        db.GPS_LOGS.push(newLog);
        this.saveDB(db);
        return { success: true, log: newLog };
      }

      case "getCustomers": {
        const settings = db.SETTINGS || {};
        const now = new Date();
        const msPerDay = 24 * 60 * 60 * 1000;

        const enriched = db.CUSTOMERS.map(c => {
          const cycle = Number(c.CareCycleDays || (c.CustomerType === "VIP" ? 3 : (c.CustomerType === "SMALL" ? 14 : 7)));
          let careStatus = "NEVER_VISITED";
          let careLabel = "Chưa từng chăm sóc";
          let badgeColor = "#94a3b8";
          let daysOverdue = 0;
          let daysRemaining = 0;
          let daysSinceLast = 999;
          let nextCareDateIso = "";

          if (c.LastCareDate) {
            const lastDate = new Date(c.LastCareDate);
            const nextDate = new Date(lastDate.getTime() + cycle * msPerDay);
            nextCareDateIso = nextDate.toISOString();
            const diffDays = Math.floor((nextDate.getTime() - now.getTime()) / msPerDay);
            daysSinceLast = Math.floor((now.getTime() - lastDate.getTime()) / msPerDay);

            if (diffDays < 0) {
              careStatus = "OVERDUE";
              careLabel = "Quá hạn";
              badgeColor = "#ef4444";
              daysOverdue = Math.abs(diffDays);
            } else if (diffDays <= (settings.OVERDUE_WARNING_DAYS || 1)) {
              careStatus = "DUE_SOON";
              careLabel = "Sắp đến hạn";
              badgeColor = "#f59e0b";
              daysRemaining = diffDays;
            } else {
              careStatus = "ON_TRACK";
              careLabel = "Đúng hạn";
              badgeColor = "#10b981";
              daysRemaining = diffDays;
            }
          }

          return {
            ...c,
            CareCycleDays: cycle,
            NextCareDate: nextCareDateIso || c.NextCareDate,
            CareStatus: careStatus,
            CareStatusLabel: careLabel,
            BadgeColor: badgeColor,
            DaysOverdue: daysOverdue,
            DaysRemaining: daysRemaining,
            DaysSinceLast: daysSinceLast,
            CurrentDebt: Number(c.CurrentDebt || 0),
            CurrentStock: Number(c.CurrentStock || 0)
          };
        });

        if (params.role === "MANAGER" || params.role === "ADMIN") {
          return { success: true, customers: enriched };
        }
        const filtered = enriched.filter(c => {
          const isAssigned = c.AssignedSalesID === params.salesId || !c.AssignedSalesID || c.AssignedSalesID === "ALL";
          const isActive = c.Status === "ACTIVE";
          return isAssigned && isActive;
        });
        return { success: true, customers: filtered };
      }

      case "createCustomer": {
        const data = params.data || {};
        if (!data.CustomerName || !data.CustomerName.trim()) {
          return { success: false, message: "Tên khách hàng không được để trống" };
        }

        // Check duplicate phone
        const cleanPhone = (data.Phone || "").replace(/\D/g, "");
        if (cleanPhone) {
          const dupPhone = db.CUSTOMERS.find(c => (c.Phone || "").replace(/\D/g, "") === cleanPhone);
          if (dupPhone) {
            return {
              success: false,
              isDuplicate: true,
              message: `Số điện thoại ${data.Phone} đã tồn tại trên khách hàng: ${dupPhone.CustomerName}`
            };
          }
        }

        // Proximity alert check (< 100m)
        let nearbyWarning = null;
        if (data.Latitude && data.Longitude) {
          let minDistance = 999999;
          for (let c of db.CUSTOMERS) {
            if (c.Latitude && c.Longitude) {
              const dist = GeoService.calculateDistance(Number(data.Latitude), Number(data.Longitude), Number(c.Latitude), Number(c.Longitude));
              if (dist <= 100 && dist < minDistance) {
                minDistance = dist;
                nearbyWarning = `Đã có khách hàng '${c.CustomerName}' cách vị trí hiện tại ${GeoService.formatDistanceKm(dist)}. Bạn có muốn sử dụng khách hàng này không?`;
              }
            }
          }
        }

        const newId = "CUST-" + Date.now();
        const initialStatus = (params.role === "SALES") ? "PENDING_APPROVAL" : (data.Status || "ACTIVE");
        const assignedSales = data.AssignedSalesID || (params.role === "SALES" ? params.creatorId : "ALL");
        const customerType = data.CustomerType || "NORMAL";
        const cycle = Number(data.CareCycleDays || (customerType === "VIP" ? 3 : (customerType === "SMALL" ? 14 : 7)));

        const newCustomer = {
          CustomerID: newId,
          CustomerName: data.CustomerName.trim(),
          ContactName: data.ContactName || "",
          Phone: data.Phone || "",
          Address: data.Address || "",
          Latitude: Number(data.Latitude) || 0,
          Longitude: Number(data.Longitude) || 0,
          AssignedSalesID: assignedSales,
          Status: initialStatus,
          CustomerType: customerType,
          CareCycleDays: cycle,
          LastCareDate: "",
          NextCareDate: "",
          CurrentDebt: Number(data.CurrentDebt || 0),
          CurrentStock: Number(data.CurrentStock || 0),
          StockUnit: data.StockUnit || "Thùng",
          Note: data.Note || "",
          CreatedAt: new Date().toISOString()
        };

        db.CUSTOMERS.push(newCustomer);
        this.saveDB(db);

        return {
          success: true,
          message: initialStatus === "PENDING_APPROVAL" ? "Đã tạo khách hàng và gửi yêu cầu phê duyệt tới Quản lý!" : "Thêm khách hàng thành công!",
          customer: newCustomer,
          nearbyWarning: nearbyWarning
        };
      }

      case "checkoutCareVisit": {
        const visit = db.VISITS.find(v => v.VisitID === params.visitId && v.SalesID === params.salesId && v.Status === "IN_PROGRESS");
        if (!visit) return { success: false, message: "Không tìm thấy buổi chăm sóc đang tiến hành" };

        const data = params.careData || {};
        const now = new Date();
        const duration = Math.max(1, Math.round((now.getTime() - new Date(visit.CheckInTime).getTime()) / (1000 * 60)));

        // Update Visit
        visit.CheckOutTime = now.toISOString();
        visit.Duration = duration;
        visit.Result = data.Result || "Đã chăm sóc";
        visit.Note = data.Note || "";
        visit.SelectedProduct = data.SelectedProduct || "";
        visit.DistributedQty = Number(data.DistributedQty || 0);
        visit.DistributedUnit = data.DistributedUnit || "Thùng";
        visit.InventoryQty = Number(data.InventoryQty || 0);
        visit.InventoryUnit = data.InventoryUnit || "Thùng";
        visit.ReorderDemand = data.ReorderDemand || "";
        visit.ReorderUnit = data.ReorderUnit || "Thùng";
        visit.RecordedDebt = Number(data.RecordedDebt || 0);
        visit.DebtLimit = Number(data.DebtLimit || 0);
        visit.PaymentStatus = data.PaymentStatus || "Chưa thanh toán";
        visit.NewOrderQty = Number(data.NewOrderQty || 0);
        visit.NewOrderUnit = data.NewOrderUnit || "Thùng";
        visit.ExpectedNextOrder = data.ExpectedNextOrder || "";
        visit.ConsumptionRate = data.ConsumptionRate || "Bình thường";
        visit.DiscussionDetails = data.DiscussionDetails || "";
        visit.CustomerIssues = data.CustomerIssues || "";
        visit.NextCareNeeds = data.NextCareNeeds || "";
        visit.Status = "COMPLETED";

        // Update Customer Record
        const cust = db.CUSTOMERS.find(c => c.CustomerID === visit.CustomerID);
        if (cust) {
          const cycle = Number(cust.CareCycleDays || 7);
          cust.LastCareDate = now.toISOString();
          cust.NextCareDate = new Date(now.getTime() + cycle * 24 * 60 * 60 * 1000).toISOString();
          if (data.RecordedDebt !== undefined && data.RecordedDebt !== "") {
            cust.CurrentDebt = Number(data.RecordedDebt);
          }
          if (data.InventoryQty !== undefined && data.InventoryQty !== "") {
            cust.CurrentStock = Number(data.InventoryQty);
            cust.StockUnit = data.InventoryUnit || "Thùng";
          }
          if (data.SelectedProduct) {
            cust.MainProduct = data.SelectedProduct;
          }
        }

        this.saveDB(db);
        return { success: true, duration, message: "Đã hoàn thành buổi chăm sóc và cập nhật dữ liệu khách hàng!" };
      }

      case "updateCustomer": {
        const custId = params.customerId;
        const data = params.data || {};
        const cust = db.CUSTOMERS.find(c => c.CustomerID === custId);
        if (!cust) return { success: false, message: "Không tìm thấy khách hàng cần sửa" };

        if (data.Phone) {
          const cleanPhone = (data.Phone || "").replace(/\D/g, "");
          const dupPhone = db.CUSTOMERS.find(c => c.CustomerID !== custId && (c.Phone || "").replace(/\D/g, "") === cleanPhone);
          if (dupPhone) {
            return {
              success: false,
              isDuplicate: true,
              message: `Số điện thoại ${data.Phone} đã tồn tại trên khách hàng: ${dupPhone.CustomerName}`
            };
          }
        }

        Object.assign(cust, {
          CustomerName: data.CustomerName !== undefined ? data.CustomerName : cust.CustomerName,
          ContactName: data.ContactName !== undefined ? data.ContactName : cust.ContactName,
          Phone: data.Phone !== undefined ? data.Phone : cust.Phone,
          Address: data.Address !== undefined ? data.Address : cust.Address,
          Latitude: data.Latitude !== undefined ? Number(data.Latitude) : cust.Latitude,
          Longitude: data.Longitude !== undefined ? Number(data.Longitude) : cust.Longitude,
          AssignedSalesID: data.AssignedSalesID !== undefined ? data.AssignedSalesID : cust.AssignedSalesID,
          Status: data.Status !== undefined ? data.Status : cust.Status,
          CurrentStock: data.CurrentStock !== undefined ? Number(data.CurrentStock) : cust.CurrentStock,
          StockUnit: data.StockUnit !== undefined ? data.StockUnit : (cust.StockUnit || "Thùng"),
          CurrentDebt: data.CurrentDebt !== undefined ? Number(data.CurrentDebt) : cust.CurrentDebt,
          CustomerType: data.CustomerType !== undefined ? data.CustomerType : cust.CustomerType,
          CareCycleDays: data.CareCycleDays !== undefined ? Number(data.CareCycleDays) : cust.CareCycleDays,
          Note: data.Note !== undefined ? data.Note : cust.Note
        });

        this.saveDB(db);
        return { success: true, message: "Cập nhật khách hàng thành công!", customer: cust };
      }

      case "approveCustomer": {
        const cust = db.CUSTOMERS.find(c => c.CustomerID === params.customerId);
        if (!cust) return { success: false, message: "Không tìm thấy khách hàng" };

        cust.Status = params.approved ? "ACTIVE" : "INACTIVE";
        this.saveDB(db);
        return {
          success: true,
          message: params.approved ? "Đã duyệt khách hàng thành công!" : "Đã từ chối khách hàng.",
          customer: cust
        };
      }

      case "getCustomerVisits": {
        const visits = db.VISITS.filter(v => v.CustomerID === params.customerId);
        const enriched = visits.map(v => {
          const u = db.USERS.find(user => user.UserID === v.SalesID);
          return {
            visitId: v.VisitID,
            salesId: v.SalesID,
            salesName: u ? u.Name : v.SalesID,
            checkInTime: v.CheckInTime,
            checkOutTime: v.CheckOutTime,
            duration: v.Duration,
            result: v.Result,
            note: v.Note,
            status: v.Status
          };
        });
        enriched.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());
        return { success: true, visits: enriched };
      }

      case "checkinVisit": {
        let session = db.WORK_SESSIONS.find(s => s.SalesID === params.salesId && s.Status === "WORKING");
        if (!session) {
          session = {
            SessionID: "SESS-" + Date.now(),
            SalesID: params.salesId,
            Date: new Date().toISOString().substring(0, 10),
            CheckInTime: new Date().toISOString(),
            CheckOutTime: "",
            DurationMinutes: 0,
            Status: "WORKING"
          };
          db.WORK_SESSIONS.push(session);
        }

        const cust = db.CUSTOMERS.find(c => c.CustomerID === params.customerId);
        if (!cust) return { success: false, message: "Không tìm thấy khách hàng" };

        const distance = GeoService.calculateDistance(params.lat, params.lng, Number(cust.Latitude), Number(cust.Longitude));
        const radius = db.SETTINGS.CUSTOMER_RADIUS || 200;

        // Sales is free to update from anywhere. Distance is recorded for Manager audit.
        const visitId = "VIS-" + Date.now();
        const nowIso = new Date().toISOString();
        const newVisit = {
          VisitID: visitId,
          SalesID: params.salesId,
          CustomerID: params.customerId,
          CustomerName: cust.CustomerName,
          SessionID: session.SessionID,
          CheckInTime: nowIso,
          CheckInLatitude: params.lat,
          CheckInLongitude: params.lng,
          CheckInAccuracy: params.accuracy || 0,
          DistanceToCustomer: distance,
          IsWithinGeofence: distance <= radius,
          CheckOutTime: "",
          Duration: 0,
          Result: "",
          Note: "",
          Status: "IN_PROGRESS"
        };
        db.VISITS.push(newVisit);
        this.saveDB(db);
        return { success: true, visit: newVisit };
      }

      case "checkoutVisit": {
        const visit = db.VISITS.find(v => v.VisitID === params.visitId && v.SalesID === params.salesId && v.Status === "IN_PROGRESS");
        if (!visit) return { success: false, message: "Không tìm thấy lượt gặp khách đang tiến hành" };

        const now = new Date();
        const duration = Math.max(1, Math.round((now.getTime() - new Date(visit.CheckInTime).getTime()) / (1000 * 60)));
        visit.CheckOutTime = now.toISOString();
        visit.Duration = duration;
        visit.Result = params.result || "Hoàn thành";
        visit.Note = params.note || "";
        visit.Status = "COMPLETED";

        this.saveDB(db);
        return { success: true, duration };
      }

      case "cancelVisit": {
        db.VISITS.forEach(v => {
          if (v.SalesID === params.salesId && v.Status === "IN_PROGRESS" && (!params.visitId || v.VisitID === params.visitId)) {
            v.Status = "CANCELLED";
          }
        });
        this.saveDB(db);
        return { success: true };
      }

      case "cleanupGpsLogs": {
        const days = Math.max(7, Number(params.retentionDays || 90));
        const cutoffMs = Date.now() - days * 86400 * 1000;
        const before = (db.GPS_LOGS || []).length;
        db.GPS_LOGS = (db.GPS_LOGS || []).filter(g => new Date(g.Timestamp).getTime() >= cutoffMs);
        this.saveDB(db);
        const deleted = before - db.GPS_LOGS.length;
        return {
          success: true,
          deletedCount: deleted,
          remainingLogs: db.GPS_LOGS.length,
          retentionDays: days,
          message: `Đã dọn ${deleted} điểm GPS cũ quá ${days} ngày.`
        };
      }

      case "getManagerDashboard": {
        const targetDate = params.date || today;
        const salesUsers = db.USERS.filter(u => u.Role === "SALES" && u.Status === "ACTIVE");
        const sessions = db.WORK_SESSIONS.filter(s => s.Date === targetDate);
        const customersRes = this.handleAction("getCustomers", { role: "MANAGER" });
        const customers = customersRes.customers || [];

        let workingCount = 0;
        let completedCount = 0;
        let notStartedCount = 0;
        let totalVisitsToday = 0;
        let inProgressVisitsToday = 0;

        const salesList = salesUsers.map(user => {
          const session = sessions.find(s => s.SalesID === user.UserID);
          let status = "CHƯA BẮT ĐẦU";
          let checkInTime = "--";
          let checkOutTime = "--";
          let visitCount = 0;
          let currentActivity = "OFFLINE";
          let lastGps = null;

          const assignedCusts = customers.filter(c => c.AssignedSalesID === user.UserID);
          const overdueCusts = assignedCusts.filter(c => c.CareStatus === "OVERDUE");
          const dueSoonCusts = assignedCusts.filter(c => c.CareStatus === "DUE_SOON");

          if (session) {
            if (session.Status === "WORKING") {
              status = "ĐANG LÀM";
              workingCount++;
            } else if (session.Status === "COMPLETED") {
              status = "ĐÃ KẾT THÚC";
              completedCount++;
            }
            checkInTime = session.CheckInTime ? session.CheckInTime.substring(11, 16) : "--";
            checkOutTime = session.CheckOutTime ? session.CheckOutTime.substring(11, 16) : "--";

            const userGps = db.GPS_LOGS.filter(g => g.SessionID === session.SessionID);
            if (userGps.length > 0) {
              lastGps = userGps[userGps.length - 1];
              currentActivity = session.Status === "WORKING" ? lastGps.ActivityStatus : "COMPLETED";
            }

            const userVisits = db.VISITS.filter(v => v.SessionID === session.SessionID);
            visitCount = userVisits.length;
            totalVisitsToday += visitCount;

            const ongoingVisit = userVisits.find(v => v.Status === "IN_PROGRESS");
            if (ongoingVisit) {
              const cust = db.CUSTOMERS.find(c => c.CustomerID === ongoingVisit.CustomerID);
              inProgressVisitsToday++;
              currentActivity = "GẶP KHÁCH (" + (cust ? cust.CustomerName : "Khách hàng") + ")";
            }
          } else {
            notStartedCount++;
          }

          return {
            salesId: user.UserID,
            name: user.Name,
            phone: user.Phone,
            team: user.Team,
            status: status,
            checkInTime: checkInTime,
            checkOutTime: checkOutTime,
            visitCount: visitCount,
            currentActivity: currentActivity,
            lastGps: lastGps,
            sessionId: session ? session.SessionID : null,
            totalAssignedCustomers: assignedCusts.length,
            overdueCount: overdueCusts.length,
            dueSoonCount: dueSoonCusts.length
          };
        });

        // Categorize All Customers
        const overdueCustomers = customers.filter(c => c.CareStatus === "OVERDUE");
        const dueSoonCustomers = customers.filter(c => c.CareStatus === "DUE_SOON");
        const onTrackCustomers = customers.filter(c => c.CareStatus === "ON_TRACK");
        const neverVisitedCustomers = customers.filter(c => c.CareStatus === "NEVER_VISITED");

        let totalDebt = 0;
        let totalStock = 0;
        const highDebtCustomers = [];
        const lowStockCustomers = [];

        customers.forEach(c => {
          const debt = Number(c.CurrentDebt || 0);
          const stock = Number(c.CurrentStock || 0);
          totalDebt += debt;
          totalStock += stock;

          if (debt >= 20000000) highDebtCustomers.push(c);
          if (stock > 0 && stock <= 50) lowStockCustomers.push(c);
        });

        return {
          success: true,
          date: targetDate,
          stats: {
            totalSales: salesUsers.length,
            workingCount: workingCount,
            notStartedCount: notStartedCount,
            completedCount: completedCount,
            totalVisits: totalVisitsToday,
            inProgressVisits: inProgressVisitsToday,
            totalCustomers: customers.length,
            overdueCount: overdueCustomers.length,
            dueSoonCount: dueSoonCustomers.length,
            onTrackCount: onTrackCustomers.length,
            neverVisitedCount: neverVisitedCustomers.length,
            totalDebt: totalDebt,
            totalStock: totalStock
          },
          sales: salesList,
          careAlerts: {
            overdue: overdueCustomers,
            dueSoon: dueSoonCustomers,
            onTrack: onTrackCustomers,
            neverVisited: neverVisitedCustomers,
            highDebt: highDebtCustomers,
            lowStock: lowStockCustomers
          }
        };
      }

      case "getSalesTimeline": {
        const targetDate = params.date || today;
        const user = db.USERS.find(u => u.UserID === params.salesId);
        if (!user) return { success: false, message: "Không tìm thấy thông tin Sales" };

        const sessions = db.WORK_SESSIONS.filter(s => s.SalesID === params.salesId && s.Date === targetDate);
        if (sessions.length === 0) {
          return {
            success: true,
            user,
            hasData: false,
            message: `Không có dữ liệu làm việc trong ngày ${targetDate}`
          };
        }

        const session = sessions[0];
        const gpsLogs = db.GPS_LOGS.filter(g => g.SessionID === session.SessionID);
        const visits = db.VISITS.filter(v => v.SessionID === session.SessionID);

        let movingTime = 0;
        let stationaryTime = 0;
        const interval = db.SETTINGS.GPS_INTERVAL || 5;

        gpsLogs.forEach(g => {
          if (g.ActivityStatus === "MOVING") movingTime += interval;
          else if (g.ActivityStatus === "STATIONARY") stationaryTime += interval;
        });

        // Build Chronological Timeline
        const timeline = [];
        if (session.CheckInTime) {
          timeline.push({
            time: session.CheckInTime,
            displayTime: session.CheckInTime.substring(11, 16),
            type: "START_WORK",
            title: "Bắt đầu làm việc",
            description: `Tọa độ khởi đầu: ${session.CheckInLatitude}, ${session.CheckInLongitude}`,
            lat: session.CheckInLatitude,
            lng: session.CheckInLongitude
          });
        }

        visits.forEach(v => {
          const cust = db.CUSTOMERS.find(c => c.CustomerID === v.CustomerID);
          const custName = cust ? cust.CustomerName : "Khách hàng " + v.CustomerID;
          timeline.push({
            time: v.CheckInTime,
            displayTime: v.CheckInTime.substring(11, 16),
            type: "VISIT_CHECKIN",
            title: `Gặp khách: ${custName}`,
            description: `Thời gian: ${v.Duration || "Đang gặp"} phút | Kết quả: ${v.Result || "--"} | Ghi chú: ${v.Note || "--"}`,
            duration: v.Duration,
            result: v.Result,
            note: v.Note,
            lat: v.CheckInLatitude,
            lng: v.CheckInLongitude,
            customerName: custName
          });
        });

        let lastStatus = null;
        gpsLogs.forEach(g => {
          if (g.ActivityStatus !== lastStatus) {
            timeline.push({
              time: g.Timestamp,
              displayTime: g.Timestamp.substring(11, 16),
              type: g.ActivityStatus === "MOVING" ? "MOVING" : "STATIONARY",
              title: g.ActivityStatus === "MOVING" ? "Đang di chuyển" : "Đứng yên",
              description: `Tốc độ: ${g.Speed ? Number(g.Speed).toFixed(1) : 0} m/s | Sai số: ${Math.round(g.Accuracy || 0)}m`,
              lat: g.Latitude,
              lng: g.Longitude
            });
            lastStatus = g.ActivityStatus;
          }
        });

        if (session.CheckOutTime) {
          timeline.push({
            time: session.CheckOutTime,
            displayTime: session.CheckOutTime.substring(11, 16),
            type: "END_WORK",
            title: "Kết thúc làm việc",
            description: `Tổng thời gian ca: ${session.WorkDuration} phút`,
            lat: session.CheckOutLatitude,
            lng: session.CheckOutLongitude
          });
        }

        timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        const anomalies = [];
        if (gpsLogs.length === 0 && session.Status === "WORKING") {
          anomalies.push({ type: "NO_GPS", message: "Chưa ghi nhận điểm GPS nào trong ca làm" });
        }
        if (stationaryTime >= 120) {
          anomalies.push({ type: "LONG_STATIONARY", message: `Thời gian đứng yên tích lũy cao (${Math.round(stationaryTime / 60)} giờ)` });
        }

        return {
          success: true,
          user,
          hasData: true,
          session,
          summary: {
            checkIn: session.CheckInTime ? session.CheckInTime.substring(11, 16) : "--",
            checkOut: session.CheckOutTime ? session.CheckOutTime.substring(11, 16) : "--",
            workDuration: session.WorkDuration || 0,
            visitCount: visits.length,
            movingTime,
            stationaryTime,
            gpsRecordCount: gpsLogs.length
          },
          gpsRoute: gpsLogs,
          visits,
          timeline,
          anomalies
        };
      }

      case "getPerformanceReports": {
        const period = params.period || "today"; // 'today', 'week', 'month', 'all'
        const targetSalesId = params.salesId || "ALL";
        const targetDate = params.date || today;

        const salesUsers = db.USERS.filter(u => u.Role === "SALES" && (targetSalesId === "ALL" || u.UserID === targetSalesId));
        const allCusts = (this.handleAction("getCustomers", { role: "MANAGER" })).customers || [];
        const allVisits = db.VISITS || [];
        const allSessions = db.WORK_SESSIONS || [];

        // Build report for each sales rep
        const repReports = salesUsers.map(user => {
          const assignedCusts = allCusts.filter(c => c.AssignedSalesID === user.UserID || c.AssignedSalesID === "ALL");
          const overdueCusts = assignedCusts.filter(c => c.CareStatus === "OVERDUE");
          const dueSoonCusts = assignedCusts.filter(c => c.CareStatus === "DUE_SOON");
          const onTrackCusts = assignedCusts.filter(c => c.CareStatus === "ON_TRACK" || c.CareStatus === "DUE_SOON");

          // Filter visits
          const userVisits = allVisits.filter(v => v.SalesID === user.UserID);
          const userSessions = allSessions.filter(s => s.SalesID === user.UserID);

          let totalDistributed = 0;
          let totalNewOrders = 0;
          let totalVisitDuration = 0;
          let completedVisitsCount = 0;

          userVisits.forEach(v => {
            totalDistributed += Number(v.DistributedQty || 0);
            totalNewOrders += Number(v.NewOrderQty || 0);
            totalVisitDuration += Number(v.Duration || 0);
            if (v.Status === "COMPLETED" || (v.Duration && v.Duration > 0)) {
              completedVisitsCount++;
            }
          });

          let totalWorkMinutes = 0;
          userSessions.forEach(s => {
            totalWorkMinutes += Number(s.WorkDuration || 0);
          });

          // Planned target: 5 visits per working day (or count of assigned customers if small)
          const targetVisits = Math.max(1, assignedCusts.length > 0 ? assignedCusts.length : 5);
          const routeCompletionRate = Math.min(100, Math.round((completedVisitsCount / targetVisits) * 100));
          const careComplianceRate = assignedCusts.length > 0 ? Math.round((onTrackCusts.length / assignedCusts.length) * 100) : 100;
          const avgTimePerVisit = completedVisitsCount > 0 ? Math.round(totalVisitDuration / completedVisitsCount) : 0;
          const totalFieldHours = (totalWorkMinutes / 60).toFixed(1);

          let performanceRating = "ĐẠT";
          let ratingBadge = "badge-working";
          if (routeCompletionRate >= 80 && overdueCusts.length === 0) {
            performanceRating = "XUẤT SẮC";
            ratingBadge = "badge-completed";
          } else if (overdueCusts.length > 2 || routeCompletionRate < 50) {
            performanceRating = "CẦN CẢI THIỆN";
            ratingBadge = "badge-notstarted";
          }

          return {
            salesId: user.UserID,
            name: user.Name,
            team: user.Team,
            phone: user.Phone,
            totalAssignedCustomers: assignedCusts.length,
            completedVisits: completedVisitsCount,
            targetVisits: targetVisits,
            routeCompletionRate: routeCompletionRate,
            careComplianceRate: careComplianceRate,
            overdueCount: overdueCusts.length,
            dueSoonCount: dueSoonCusts.length,
            totalDistributed: totalDistributed,
            totalNewOrders: totalNewOrders,
            totalFieldHours: totalFieldHours,
            totalWorkMinutes: totalWorkMinutes,
            avgTimePerVisit: avgTimePerVisit,
            performanceRating: performanceRating,
            ratingBadge: ratingBadge
          };
        });

        // Totals for all selected
        const totalVisits = repReports.reduce((acc, r) => acc + r.completedVisits, 0);
        const totalOrders = repReports.reduce((acc, r) => acc + r.totalNewOrders, 0);
        const totalDistributed = repReports.reduce((acc, r) => acc + r.totalDistributed, 0);
        const totalHours = repReports.reduce((acc, r) => acc + Number(r.totalFieldHours), 0).toFixed(1);
        const avgRouteRate = repReports.length > 0 ? Math.round(repReports.reduce((acc, r) => acc + r.routeCompletionRate, 0) / repReports.length) : 0;
        const totalOverdue = repReports.reduce((acc, r) => acc + r.overdueCount, 0);

        return {
          success: true,
          period,
          salesId: targetSalesId,
          date: targetDate,
          summary: {
            totalSalesCount: repReports.length,
            totalVisits,
            totalOrders,
            totalDistributed,
            totalFieldHours: totalHours,
            avgRouteCompletionRate: avgRouteRate,
            totalOverdueCount: totalOverdue
          },
          reports: repReports
        };
      }

      default:
        return { success: false, message: "Action không xác định: " + action };
    }
  }
};
