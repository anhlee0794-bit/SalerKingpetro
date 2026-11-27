/**
 * GPS & GEOLOCATION SERVICE
 * Handles device GPS access, error recovery, Haversine distance,
 * velocity tracking, and movement classification (MOVING / STATIONARY / UNKNOWN).
 */

const GeoService = {
  watchId: null,
  lastPosition: null,
  prevPosition: null,
  anchorPosition: null,
  trackingSettings: {},
  isTracking: false,
  trackingIntervalMs: 5 * 60 * 1000,
  intervalTimer: null,
  wakeLockSentinel: null,
  visibilityTrackingBound: false,
  arrivalMap: {}, // { CustomerID: timestampMs } ghi nhận thời điểm thực tế Sales bước vào vùng điểm bán

  // Mock GPS state
  isMockGpsEnabled: false,
  mockPosition: null,
  mockLocationName: "",

  // Callbacks
  onLocationUpdate: null,
  onError: null,
  onActivityChange: null,

  currentActivity: "UNKNOWN",

  /**
   * DWELL TIME ENGINE — Auto-Checkin Ngầm
   * Tracks when a sales rep stays STATIONARY within geofence (≤30m)
   * of a customer for at least DWELL_THRESHOLD_MINUTES and fires onDwellComplete.
   */
  dwellTracker: {
    active: false,
    customers: [],            // Array of { CustomerID, CustomerName, Latitude, Longitude }
    radiusMeters: 30,         // Geofence radius for auto-checkin
    thresholdMs: 5 * 60 * 1000, // 5 minutes minimum dwell time
    currentTarget: null,      // { customer, enteredAt, lastSeenAt }
    onDwellComplete: null,    // callback(customer, dwellSeconds)
    onDwellEntered: null,     // callback(customer) — fired when entering geofence
    onDwellExited: null,      // callback(customer) — fired when exiting geofence
    suppressedIds: new Set()  // CustomerIDs already auto-checked-in this session
  },

  /**
   * Format distance from meters to KM with 2 decimal places (e.g. 125m -> "0.13 km", 12500m -> "12.50 km")
   */
  formatDistanceKm(meters) {
    if (meters === null || meters === undefined || isNaN(meters)) return "0.00 km";
    const km = Number(meters) / 1000;
    return km.toFixed(2) + " km";
  },

  /**
   * Calculate distance between two coordinates in meters using Haversine formula
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 0;
    const R = 6371000; // meters
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  },

  /**
   * Classify movement activity based on speed, anchor displacement over 25-60s window, and accuracy.
   * Khắc phục triệt để lỗi watchPosition nhảy mỗi 1-2 giây làm distance < 30m bị nhận nhầm là ĐỨNG YÊN.
   */
  classifyActivity(currentPos, anchorOrPrevPos, settings = {}) {
    const accuracyLimit = Number(settings.GPS_ACCURACY_LIMIT || 80);
    const speedThreshold = Number(settings.MOVING_SPEED_THRESHOLD || 1.2); // m/s (~4.3 km/h)
    const stationaryDistanceThreshold = Number(settings.STATIONARY_DISTANCE_THRESHOLD || 30); // meters

    // 1. Kiểm tra sai số GPS (lọc điểm nhiễu trong nhà / mất vệ tinh)
    if (!currentPos || !currentPos.accuracy || Number(currentPos.accuracy) > accuracyLimit) {
      return "UNKNOWN";
    }

    // 2. Ưu tiên tốc độ phần cứng từ chip GPS (khi chạy xe ngoài đường)
    if (currentPos.speed !== null && currentPos.speed !== undefined && !isNaN(currentPos.speed) && Number(currentPos.speed) >= speedThreshold) {
      return "MOVING";
    }

    // 3. Đối chiếu với điểm neo (anchorPosition cách >= 25 giây trước đó)
    if (!anchorOrPrevPos) {
      return "STATIONARY";
    }

    const distance = this.calculateDistance(anchorOrPrevPos.lat, anchorOrPrevPos.lng, currentPos.lat, currentPos.lng);
    const timeDeltaSeconds = Math.max(1, ((currentPos.timestamp || Date.now()) - (anchorOrPrevPos.timestamp || Date.now())) / 1000);
    const calculatedSpeed = distance / timeDeltaSeconds;

    if (distance >= stationaryDistanceThreshold && calculatedSpeed >= speedThreshold * 0.75) {
      return "MOVING";
    }
    if (timeDeltaSeconds >= 10 && calculatedSpeed >= speedThreshold && distance >= 12) {
      return "MOVING";
    }

    return "STATIONARY";
  },

  /**
   * Enable Mock GPS mode: overrides navigator.geolocation.getCurrentPosition & watchPosition
   * to simulate standing directly at the target location with high accuracy (accuracy: 10m).
   * @param {Object} target - { lat, lng, accuracy, name }
   */
  enableMockGps(target = {}) {
    const lat = target.lat !== undefined ? Number(target.lat) : 10.7685;
    const lng = target.lng !== undefined ? Number(target.lng) : 106.6892;
    const accuracy = target.accuracy !== undefined ? Number(target.accuracy) : 10;
    const name = target.name || "Đại lý Minh Phát";

    this.isMockGpsEnabled = true;
    this.mockLocationName = name;
    this.mockPosition = {
      lat: lat,
      lng: lng,
      accuracy: accuracy,
      speed: 0,
      heading: null,
      timestamp: Date.now()
    };
    this.lastPosition = { ...this.mockPosition };
    this.currentActivity = "STATIONARY";

    // Backup native navigator.geolocation methods once
    if (typeof window !== "undefined" && !window._nativeGeolocation && typeof navigator !== "undefined" && navigator.geolocation) {
      window._nativeGeolocation = {
        getCurrentPosition: navigator.geolocation.getCurrentPosition ? navigator.geolocation.getCurrentPosition.bind(navigator.geolocation) : null,
        watchPosition: navigator.geolocation.watchPosition ? navigator.geolocation.watchPosition.bind(navigator.geolocation) : null,
        clearWatch: navigator.geolocation.clearWatch ? navigator.geolocation.clearWatch.bind(navigator.geolocation) : null
      };
    }

    const self = this;
    const createMockGeoPos = () => ({
      coords: {
        latitude: self.mockPosition.lat,
        longitude: self.mockPosition.lng,
        accuracy: self.mockPosition.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: 0
      },
      timestamp: Date.now()
    });

    // Override navigator.geolocation methods
    try {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          navigator.geolocation.getCurrentPosition = function(success, error, options) {
            if (typeof success === "function") {
              setTimeout(() => success(createMockGeoPos()), 5);
            }
          };

          navigator.geolocation.watchPosition = function(success, error, options) {
            if (typeof success === "function") {
              setTimeout(() => success(createMockGeoPos()), 5);
            }
            return 88888;
          };
        } catch (e1) {
          Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
            value: function(success) { if (typeof success === "function") setTimeout(() => success(createMockGeoPos()), 5); },
            configurable: true,
            writable: true
          });
          Object.defineProperty(navigator.geolocation, "watchPosition", {
            value: function(success) { if (typeof success === "function") setTimeout(() => success(createMockGeoPos()), 5); return 88888; },
            configurable: true,
            writable: true
          });
        }
      }
    } catch (e) {
      console.warn("[GeoService] Failed to override navigator.geolocation:", e);
    }

    // Process updated position through GeoService lifecycle
    this.processLocation(this.mockPosition, false);
    console.log(`[GeoService] Mock GPS activated at ${name} (${lat}, ${lng}, accuracy: ${accuracy}m)`);
    return this.mockPosition;
  },

  /**
   * Disable Mock GPS mode and restore native geolocation
   */
  disableMockGps() {
    this.isMockGpsEnabled = false;
    this.mockPosition = null;
    this.mockLocationName = "";

    if (typeof window !== "undefined" && window._nativeGeolocation && typeof navigator !== "undefined" && navigator.geolocation) {
      try {
        if (window._nativeGeolocation.getCurrentPosition) {
          navigator.geolocation.getCurrentPosition = window._nativeGeolocation.getCurrentPosition;
        }
        if (window._nativeGeolocation.watchPosition) {
          navigator.geolocation.watchPosition = window._nativeGeolocation.watchPosition;
        }
      } catch (e) {
        console.warn("[GeoService] Failed to restore navigator.geolocation:", e);
      }
    }
    console.log("[GeoService] Mock GPS disabled. Restored native geolocation.");
  },

  /**
   * Acquire a single high-accuracy GPS position with timeout & fallback
   */
  getCurrentPosition(options = {}) {
    if (this.isMockGpsEnabled && this.mockPosition) {
      return Promise.resolve({
        ...this.mockPosition,
        timestamp: Date.now()
      });
    }

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error("Thiết bị hoặc trình duyệt không hỗ trợ định vị GPS."));
      }

      const geoOptions = {
        enableHighAccuracy: options.enableHighAccuracy !== undefined ? Boolean(options.enableHighAccuracy) : true,
        timeout: options.timeout || 12000,
        maximumAge: options.maximumAge !== undefined ? options.maximumAge : 0
      };

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
            timestamp: pos.timestamp || Date.now()
          };
          resolve(coords);
        },
        (err) => {
          let msg = "Không thể lấy tọa độ GPS.";
          switch (err.code) {
            case err.PERMISSION_DENIED:
              msg = "Người dùng từ chối cấp quyền truy cập GPS. Vui lòng bật vị trí trong cài đặt trình duyệt.";
              break;
            case err.POSITION_UNAVAILABLE:
              msg = "Tín hiệu GPS không khả dụng hoặc bị che khuất.";
              break;
            case err.TIMEOUT:
              msg = "Hết thời gian chờ phản hồi GPS (Timeout).";
              break;
          }
          reject(new Error(msg));
        },
        geoOptions
      );
    });
  },

  /**
   * Acquire reliable device GPS: tries high-accuracy satellite first, then falls back to fast Wi-Fi/Cell network location.
   * NEVER invents fake coordinates!
   */
  async getReliablePosition(maxAgeMs = 15000) {
    try {
      return await this.getCurrentPosition({ enableHighAccuracy: true, timeout: 9000, maximumAge: maxAgeMs });
    } catch (err1) {
      // Thử lại chế độ định vị trạm phát sóng / Wi-Fi (nhanh khi đứng dưới mái tôn cửa hàng)
      return await this.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: Math.max(maxAgeMs, 45000) });
    }
  },

  async requestWakeLock() {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      if (!this.wakeLockSentinel) {
        this.wakeLockSentinel = await navigator.wakeLock.request("screen");
        this.wakeLockSentinel.addEventListener("release", () => {
          this.wakeLockSentinel = null;
        });
      }
    } catch (e) {
      // Trình duyệt tiết kiệm pin có thể từ chối im lặng
    }
  },

  async releaseWakeLock() {
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch (e) {}
      this.wakeLockSentinel = null;
    }
  },

  bindVisibilityTrackingResume() {
    if (this.visibilityTrackingBound || typeof document === "undefined") return;
    this.visibilityTrackingBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.isTracking) {
        this.requestWakeLock();
        this.pollLocation();
        if (typeof ApiService !== "undefined" && typeof ApiService.flushOfflineQueue === "function") {
          ApiService.flushOfflineQueue().catch(() => {});
        }
      }
    });
  },

  getCustomerArrivalIso(customerId) {
    const ts = this.arrivalMap && this.arrivalMap[customerId];
    if (!ts) return null;
    // Chỉ hợp lệ trong vòng 4 giờ gần nhất
    if (Date.now() - ts > 4 * 3600 * 1000) return null;
    return new Date(ts).toISOString();
  },

  clearCustomerArrival(customerId) {
    if (customerId && this.arrivalMap) {
      delete this.arrivalMap[customerId];
    }
  },

  /**
   * Start continuous background GPS tracking for active sales work session
   */
  startTracking(intervalMinutes = 5, onUpdateCallback, onErrorCallback, settings = {}) {
    this.trackingSettings = settings || this.trackingSettings || {};
    if (this.isTracking) return;
    this.isTracking = true;
    this.trackingIntervalMs = Math.max(1, Number(intervalMinutes || 5)) * 60 * 1000;
    this.onLocationUpdate = onUpdateCallback;
    this.onError = onErrorCallback;

    this.requestWakeLock();
    this.bindVisibilityTrackingResume();

    console.log(`[GeoService] Started GPS tracking with interval: ${intervalMinutes} min`);

    // Immediate first acquisition
    this.pollLocation();

    // Setup periodic polling interval
    this.intervalTimer = setInterval(() => {
      this.pollLocation();
    }, this.trackingIntervalMs);

    // Also register watchPosition for responsive hardware speed changes
    if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
            timestamp: pos.timestamp || Date.now()
          };
          this.processLocation(coords, false);
        },
        (err) => {
          console.warn("[GeoService] watchPosition error:", err.message);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
      );
    }
  },

  /**
   * Execute location polling cycle
   */
  async pollLocation() {
    try {
      const coords = await this.getReliablePosition(10000);
      this.processLocation(coords, true);
    } catch (err) {
      console.error("[GeoService] Poll error:", err.message);
      if (this.onError) this.onError(err);
    }
  },

  /**
   * Process and classify incoming GPS coordinate using sliding anchor window
   */
  processLocation(coords, isIntervalTick = false) {
    const now = coords.timestamp || Date.now();
    coords.timestamp = now;

    this.prevPosition = this.lastPosition;
    this.lastPosition = coords;

    const activity = this.classifyActivity(coords, this.anchorPosition || this.prevPosition, this.trackingSettings);
    const activityChanged = activity !== this.currentActivity;
    this.currentActivity = activity;

    // Cập nhật điểm neo (anchorPosition) mỗi 30 giây hoặc khi đã dịch chuyển quá ngưỡng đứng yên
    const statDist = Number((this.trackingSettings && this.trackingSettings.STATIONARY_DISTANCE_THRESHOLD) || 30);
    if (!this.anchorPosition) {
      this.anchorPosition = { ...coords };
    } else {
      const elapsedSec = (now - (this.anchorPosition.timestamp || now)) / 1000;
      const movedMeters = this.calculateDistance(this.anchorPosition.lat, this.anchorPosition.lng, coords.lat, coords.lng);
      if (elapsedSec >= 30 || movedMeters >= statDist * 1.5) {
        this.anchorPosition = { ...coords };
      }
    }

    // Ghi nhận thời điểm thực tế tới vùng điểm bán (<= CUSTOMER_RADIUS, mặc định 200m) để tính đúng thời gian ghé thăm
    const custRadius = Number((this.trackingSettings && this.trackingSettings.CUSTOMER_RADIUS) || 200);
    if (this.dwellTracker && Array.isArray(this.dwellTracker.customers) && coords.accuracy <= Number(this.trackingSettings.GPS_ACCURACY_LIMIT || 120)) {
      for (const c of this.dwellTracker.customers) {
        const cLat = Number(c.Latitude);
        const cLng = Number(c.Longitude);
        if (!cLat || !cLng) continue;
        const d = this.calculateDistance(coords.lat, coords.lng, cLat, cLng);
        if (d <= custRadius) {
          if (!this.arrivalMap[c.CustomerID]) {
            this.arrivalMap[c.CustomerID] = now;
          }
        } else if (d > custRadius * 2 && this.arrivalMap[c.CustomerID]) {
          // Đã rời xa điểm bán gấp đôi bán kính -> xóa mốc đến cũ
          delete this.arrivalMap[c.CustomerID];
        }
      }
    }

    if (this.onLocationUpdate) {
      this.onLocationUpdate({
        coords: coords,
        activity: activity,
        isIntervalTick: isIntervalTick,
        activityChanged: activityChanged
      });
    }

    // Drive dwell tracker on every location update
    if (this.dwellTracker.active) {
      this.updateDwell(coords, activity);
    }
  },

  /**
   * Start the Dwell Time engine.
   * @param {Array}    customers - array of customer objects with {CustomerID, CustomerName, Latitude, Longitude}
   * @param {Object}   options   - { radiusMeters, thresholdMinutes }
   * @param {Function} onDwellComplete - called when dwell threshold reached: (customer, dwellSeconds) => void
   * @param {Function} onDwellEntered  - called on geofence entry:  (customer) => void
   * @param {Function} onDwellExited   - called on geofence exit:   (customer) => void
   */
  startDwellTracking(customers, options = {}, onDwellComplete, onDwellEntered, onDwellExited) {
    this.dwellTracker.customers     = customers || [];
    this.dwellTracker.radiusMeters  = options.radiusMeters    !== undefined ? Number(options.radiusMeters) : 30;
    this.dwellTracker.thresholdMs   = (options.thresholdMinutes !== undefined ? Number(options.thresholdMinutes) : 5) * 60 * 1000;
    this.dwellTracker.onDwellComplete = onDwellComplete || null;
    this.dwellTracker.onDwellEntered  = onDwellEntered  || null;
    this.dwellTracker.onDwellExited   = onDwellExited   || null;
    this.dwellTracker.currentTarget   = null;
    this.dwellTracker.suppressedIds   = new Set();
    this.dwellTracker.active          = true;
    console.log(`[GeoService.Dwell] Started — radius: ${this.dwellTracker.radiusMeters}m, threshold: ${options.thresholdMinutes || 5} min, customers: ${customers.length}`);
  },

  /** Stop dwell tracking and reset state */
  stopDwellTracking() {
    this.dwellTracker.active        = false;
    this.dwellTracker.currentTarget = null;
    this.dwellTracker.suppressedIds = new Set();
    console.log("[GeoService.Dwell] Stopped.");
  },

  /**
   * Core dwell algorithm — called inside processLocation on every GPS update.
   * Logic:
   *   1. Skip if activity is MOVING (rep is driving away).
   *   2. Find nearest customer within dwellTracker.radiusMeters.
   *   3. If a target was previously tracked:
   *      a. Same customer → extend dwell, check if ≥ threshold → fire onDwellComplete.
   *      b. Different customer or moved away → fire onDwellExited, start fresh tracking.
   *   4. If no previous target, entering a geofence → fire onDwellEntered.
   */
  updateDwell(coords, activity) {
    const dt = this.dwellTracker;
    const now = Date.now();

    // Only accumulate dwell when STATIONARY (or MOCK GPS)
    if (activity === "MOVING") {
      // Exited via movement — reset current target
      if (dt.currentTarget) {
        console.log(`[GeoService.Dwell] MOVING — exiting geofence of ${dt.currentTarget.customer.CustomerName}`);
        if (dt.onDwellExited) dt.onDwellExited(dt.currentTarget.customer);
        dt.currentTarget = null;
      }
      return;
    }

    // Find nearest customer inside geofence radius
    let nearestCustomer = null;
    let nearestDist     = Infinity;
    for (const cust of dt.customers) {
      const lat = Number(cust.Latitude);
      const lng = Number(cust.Longitude);
      if (!lat || !lng) continue;
      const dist = this.calculateDistance(coords.lat, coords.lng, lat, lng);
      if (dist <= dt.radiusMeters && dist < nearestDist) {
        nearestDist     = dist;
        nearestCustomer = cust;
      }
    }

    if (!nearestCustomer) {
      // Outside all geofences — reset if was tracking
      if (dt.currentTarget) {
        if (dt.onDwellExited) dt.onDwellExited(dt.currentTarget.customer);
        dt.currentTarget = null;
      }
      return;
    }

    const custId = nearestCustomer.CustomerID;

    // Skip already auto-checked-in customers in this session
    if (dt.suppressedIds.has(custId)) return;

    if (!dt.currentTarget || dt.currentTarget.customer.CustomerID !== custId) {
      // Entered a new geofence
      if (dt.currentTarget && dt.onDwellExited) {
        dt.onDwellExited(dt.currentTarget.customer);
      }
      dt.currentTarget = { customer: nearestCustomer, enteredAt: now, lastSeenAt: now };
      console.log(`[GeoService.Dwell] Entered geofence of ${nearestCustomer.CustomerName} (${Math.round(nearestDist)}m)`);
      if (dt.onDwellEntered) dt.onDwellEntered(nearestCustomer);
    } else {
      // Continuing to dwell — update lastSeen
      dt.currentTarget.lastSeenAt = now;
      const dwellMs = now - dt.currentTarget.enteredAt;

      if (dwellMs >= dt.thresholdMs) {
        // Dwell threshold reached — fire auto-checkin
        const dwellSeconds = Math.round(dwellMs / 1000);
        console.log(`[GeoService.Dwell] THRESHOLD REACHED at ${nearestCustomer.CustomerName} after ${Math.round(dwellMs / 60000)} min`);
        dt.suppressedIds.add(custId); // suppress duplicate fires
        dt.currentTarget = null;
        if (dt.onDwellComplete) dt.onDwellComplete(nearestCustomer, dwellSeconds);
      }
    }
  },

  /**
   * Stop all GPS tracking routines (when session completes)
   */
  stopTracking() {
    this.isTracking = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.lastPosition = null;
    this.prevPosition = null;
    this.anchorPosition = null;
    this.arrivalMap = {};
    this.currentActivity = "UNKNOWN";
    this.releaseWakeLock();
    console.log("[GeoService] Stopped GPS tracking.");
  },

  // =========================================================================
  // FREE GEOCODING (NOMINATIM OSM + PHOTON FALLBACK) & MINI-MAP PICKER
  // =========================================================================
  _pickerMap: null,
  _pickerMarker: null,
  _lastSearchResults: [],

  /**
   * Tìm tọa độ Kinh độ / Vĩ độ miễn phí từ địa chỉ văn bản (ưu tiên Việt Nam)
   * Kết hợp OpenStreetMap Nominatim + tự động dự phòng Photon Komoot (0đ, không cần API Key)
   */
  async geocodeAddress(query) {
    const cleanQuery = (query || "").trim();
    if (!cleanQuery) return [];

    // 1. Ưu tiên Nominatim OpenStreetMap (hỗ trợ chi tiết phường/quận/tỉnh Việt Nam)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=vn&addressdetails=1&limit=5&accept-language=vi&q=${encodeURIComponent(cleanQuery)}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map(item => ({
            displayName: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            source: "OSM"
          })).filter(x => !isNaN(x.lat) && !isNaN(x.lng));
        }
      }
    } catch (e) {
      console.warn("[GeoService.geocodeAddress] Nominatim fallback to Photon:", e.message);
    }

    // 2. Dự phòng Photon API (tìm kiếm mờ / viết tắt rất nhạy)
    try {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 5000);
      const qVietnam = cleanQuery.toLowerCase().includes("việt nam") ? cleanQuery : `${cleanQuery}, Việt Nam`;
      const url2 = `https://photon.komoot.io/api/?q=${encodeURIComponent(qVietnam)}&limit=5&lat=10.7760&lon=106.6950`;
      const res2 = await fetch(url2, { signal: controller2.signal });
      clearTimeout(timer2);
      if (res2.ok) {
        const json2 = await res2.json();
        const features = (json2 && json2.features) || [];
        return features.map(f => {
          const p = f.properties || {};
          const coords = (f.geometry && f.geometry.coordinates) || [];
          const parts = [p.name, p.housenumber, p.street, p.district || p.suburb, p.city || p.state, p.country].filter(Boolean);
          return {
            displayName: parts.join(", ") || cleanQuery,
            lat: parseFloat(coords[1]),
            lng: parseFloat(coords[0]),
            source: "Photon"
          };
        }).filter(x => !isNaN(x.lat) && !isNaN(x.lng));
      }
    } catch (e2) {
      console.warn("[GeoService.geocodeAddress] Photon error:", e2.message);
    }

    return [];
  },

  /**
   * Tra ngược tên đường / địa chỉ từ tọa độ ghim trên bản đồ (Reverse Geocoding miễn phí)
   */
  async reverseGeocode(lat, lng) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=vi`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          return data.display_name;
        }
      }
    } catch (e) {
      // Bỏ qua nếu mạng chậm
    }
    return "";
  },

  /**
   * Khởi tạo Bản đồ nhỏ tương tác (Mini-Map Picker) ngay trong Modal Thêm/Sửa đại lý
   * Hỗ trợ: Bấm trực tiếp lên bản đồ, kéo thả ghim (Drag & Drop), chuyển lớp Vệ tinh, đồng bộ 2 chiều với ô tọa độ
   */
  initMiniMapPicker(options = {}) {
    if (typeof L === "undefined") return null;

    const {
      containerId = "cust-minimap-picker",
      latInputId,
      lngInputId,
      addressInputId,
      initialLat = 10.7760,
      initialLng = 106.6950,
      onChange = null
    } = options;

    const mapEl = document.getElementById(containerId);
    if (!mapEl) return null;

    if (this._pickerMap) {
      try {
        this._pickerMap.remove();
      } catch (e) {}
      this._pickerMap = null;
      this._pickerMarker = null;
    }
    if (mapEl._leaflet_id) {
      mapEl._leaflet_id = null;
    }

    const startLat = (!isNaN(Number(initialLat)) && Number(initialLat) !== 0) ? Number(initialLat) : 10.7760;
    const startLng = (!isNaN(Number(initialLng)) && Number(initialLng) !== 0) ? Number(initialLng) : 106.6950;

    const map = L.map(containerId, { zoomControl: true }).setView([startLat, startLng], 15);
    this._pickerMap = map;

    const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19
    });
    const esriStreet = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
      attribution: "&copy; Esri",
      maxZoom: 19
    });
    const esriSat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "&copy; Esri Satellite",
      maxZoom: 19
    });

    let fallbackUsed = false;
    osmLayer.on("tileerror", () => {
      if (!fallbackUsed && map.hasLayer(osmLayer)) {
        fallbackUsed = true;
        map.removeLayer(osmLayer);
        esriStreet.addTo(map);
      }
    });

    osmLayer.addTo(map);
    L.control.layers({
      "🗺️ Đường phố": osmLayer,
      "🛰️ Vệ tinh": esriSat,
      "🧭 Esri Street": esriStreet
    }, null, { position: "topright" }).addTo(map);

    const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);
    marker.bindTooltip("Kéo thả ghim hoặc bấm trên bản đồ", { direction: "top", offset: [0, -12] });
    this._pickerMarker = marker;

    const syncCoordsToInputs = async (lat, lng, autoFillEmptyAddress = true) => {
      const fixedLat = Number(lat).toFixed(6);
      const fixedLng = Number(lng).toFixed(6);
      const latEl = latInputId ? document.getElementById(latInputId) : null;
      const lngEl = lngInputId ? document.getElementById(lngInputId) : null;
      if (latEl) latEl.value = fixedLat;
      if (lngEl) lngEl.value = fixedLng;

      if (typeof onChange === "function") {
        onChange(Number(fixedLat), Number(fixedLng));
      }

      if (autoFillEmptyAddress && addressInputId) {
        const addrEl = document.getElementById(addressInputId);
        if (addrEl && !addrEl.value.trim()) {
          const detected = await this.reverseGeocode(fixedLat, fixedLng);
          if (detected && !addrEl.value.trim()) {
            addrEl.value = detected;
          }
        }
      }
    };

    // Bấm bất kỳ vị trí nào trên bản đồ để đặt ghim
    map.on("click", (ev) => {
      const { lat, lng } = ev.latlng;
      marker.setLatLng([lat, lng]);
      syncCoordsToInputs(lat, lng, true);
    });

    // Kéo thả ghim xong tự cập nhật tọa độ
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      map.panTo(pos);
      syncCoordsToInputs(pos.lat, pos.lng, true);
    });

    // Nhập tay số kinh độ/vĩ độ tự nhảy ghim trên bản đồ
    const onManualInputChange = () => {
      const latEl = latInputId ? document.getElementById(latInputId) : null;
      const lngEl = lngInputId ? document.getElementById(lngInputId) : null;
      const vLat = parseFloat(latEl && latEl.value);
      const vLng = parseFloat(lngEl && lngEl.value);
      if (!isNaN(vLat) && !isNaN(vLng) && Math.abs(vLat) <= 90 && Math.abs(vLng) <= 180) {
        marker.setLatLng([vLat, vLng]);
        map.setView([vLat, vLng], map.getZoom());
      }
    };
    if (latInputId && document.getElementById(latInputId)) {
      document.getElementById(latInputId).addEventListener("change", onManualInputChange);
    }
    if (lngInputId && document.getElementById(lngInputId)) {
      document.getElementById(lngInputId).addEventListener("change", onManualInputChange);
    }

    // Sửa lỗi khung bản đồ bị xám khi mở trong hộp thoại Modal có hiệu ứng chuyển động
    setTimeout(() => { map.invalidateSize(); }, 180);
    setTimeout(() => { map.invalidateSize(); }, 450);

    return map;
  },

  /**
   * Di chuyển ghim trên Mini-Map Picker tới tọa độ mới (dùng khi bấm Lấy GPS hiện tại hoặc chọn gợi ý địa chỉ)
   */
  setMiniMapPosition(lat, lng, zoom = 17) {
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (isNaN(nLat) || isNaN(nLng)) return;
    if (this._pickerMarker) {
      this._pickerMarker.setLatLng([nLat, nLng]);
    }
    if (this._pickerMap) {
      this._pickerMap.setView([nLat, nLng], zoom);
      this._pickerMap.invalidateSize();
    }
  },

  /**
   * Tìm kiếm địa chỉ từ ô nhập liệu, tự động nhảy ghim đến kết quả đầu tiên và hiển thị danh sách gợi ý để chọn chính xác
   */
  async searchAddressForPicker({ addressInputId, latInputId, lngInputId, resultsBoxId, onCoordsSelected = null }) {
    const addrEl = document.getElementById(addressInputId);
    const resultsBox = document.getElementById(resultsBoxId);
    const query = (addrEl && addrEl.value.trim()) || "";

    if (!query) {
      if (typeof UI !== "undefined" && UI.showToast) {
        UI.showToast("Vui lòng gõ tên đường hoặc địa chỉ đại lý vào ô Địa chỉ trước khi bấm Tìm!", "warning");
      }
      if (addrEl) addrEl.focus();
      return;
    }

    if (resultsBox) {
      resultsBox.style.display = "block";
      resultsBox.innerHTML = `<div style="padding: 0.55rem 0.75rem; font-size: 0.8rem; color: #0369a1;">🔍 Đang dò tìm tọa độ cho "${query}"...</div>`;
    }

    const results = await this.geocodeAddress(query);
    this._lastSearchResults = results;

    if (!results || results.length === 0) {
      if (resultsBox) {
        resultsBox.innerHTML = `<div style="padding: 0.55rem 0.75rem; font-size: 0.8rem; color: #b91c1c;">Không tìm thấy địa chỉ khớp chính xác. Bạn có thể gõ ngắn gọn hơn (VD: tên đường + quận/tỉnh) hoặc bấm chọn trực tiếp trên bản đồ bên dưới!</div>`;
      }
      return;
    }

    // Áp dụng ngay kết quả sát nhất đầu tiên
    const best = results[0];
    const latEl = latInputId ? document.getElementById(latInputId) : null;
    const lngEl = lngInputId ? document.getElementById(lngInputId) : null;
    if (latEl) latEl.value = best.lat.toFixed(6);
    if (lngEl) lngEl.value = best.lng.toFixed(6);
    this.setMiniMapPosition(best.lat, best.lng, 17);
    if (typeof onCoordsSelected === "function") {
      onCoordsSelected(best.lat, best.lng, best.displayName);
    }

    // Hiển thị danh sách kết quả để người dùng bấm chọn nếu có nhiều địa điểm trùng tên
    if (resultsBox) {
      resultsBox.innerHTML = `
        <div style="font-size: 0.73rem; font-weight: 700; color: var(--text-muted); padding: 0.35rem 0.65rem; background: var(--bg-subtle); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <span>🎯 Đã ghim kết quả #1 — Bấm chọn nếu muốn đổi vị trí khác:</span>
          <button type="button" onclick="document.getElementById('${resultsBoxId}').style.display='none'" style="border:none;background:none;cursor:pointer;color:var(--text-muted);font-size:0.95rem;">&times;</button>
        </div>
        ${results.map((r, idx) => `
          <div
            onclick="GeoService.selectSearchResult(${idx}, '${addressInputId}', '${latInputId}', '${lngInputId}', '${resultsBoxId}')"
            style="padding: 0.48rem 0.65rem; font-size: 0.8rem; cursor: pointer; border-bottom: 1px solid var(--border); background: ${idx === 0 ? '#f0f9ff' : 'var(--bg-card)'}; color: var(--text-main);"
            onmouseover="this.style.background='#e0f2fe'"
            onmouseout="this.style.background='${idx === 0 ? '#f0f9ff' : 'var(--bg-card)'}'"
          >
            <strong>#${idx + 1}:</strong> ${r.displayName}
            <span style="font-size: 0.72rem; color: #0284c7; margin-left: 4px;">(${r.lat.toFixed(5)}, ${r.lng.toFixed(5)})</span>
          </div>
        `).join("")}
      `;
    }
  },

  selectSearchResult(idx, addressInputId, latInputId, lngInputId, resultsBoxId) {
    const item = (this._lastSearchResults || [])[idx];
    if (!item) return;
    const addrEl = addressInputId ? document.getElementById(addressInputId) : null;
    const latEl = latInputId ? document.getElementById(latInputId) : null;
    const lngEl = lngInputId ? document.getElementById(lngInputId) : null;
    const boxEl = resultsBoxId ? document.getElementById(resultsBoxId) : null;

    if (addrEl) addrEl.value = item.displayName;
    if (latEl) latEl.value = item.lat.toFixed(6);
    if (lngEl) lngEl.value = item.lng.toFixed(6);
    this.setMiniMapPosition(item.lat, item.lng, 17);
    if (boxEl) boxEl.style.display = "none";

    if (typeof UI !== "undefined" && UI.showToast) {
      UI.showToast(`Đã ghim tọa độ (${item.lat.toFixed(5)}, ${item.lng.toFixed(5)})`, "success");
    }
  },

  /**
   * Nút "Lấy địa chỉ từ vị trí ghim" (Reverse Geocoding thủ công theo yêu cầu người dùng)
   */
  async fillAddressFromPin(addressInputId, latInputId, lngInputId) {
    const latEl = document.getElementById(latInputId);
    const lngEl = document.getElementById(lngInputId);
    const addrEl = document.getElementById(addressInputId);
    const lat = parseFloat(latEl && latEl.value);
    const lng = parseFloat(lngEl && lngEl.value);
    if (isNaN(lat) || isNaN(lng)) return;

    const detected = await this.reverseGeocode(lat, lng);
    if (detected && addrEl) {
      addrEl.value = detected;
      if (typeof UI !== "undefined" && UI.showToast) {
        UI.showToast("Đã tự động điền tên đường từ vị trí ghim!", "success");
      }
    } else if (typeof UI !== "undefined" && UI.showToast) {
      UI.showToast("Không tra cứu được tên đường chi tiết tại điểm này.", "warning");
    }
  }
};
