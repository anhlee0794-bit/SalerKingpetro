/**
 * GPS & GEOLOCATION SERVICE
 * Handles device GPS access, error recovery, Haversine distance,
 * velocity tracking, and movement classification (MOVING / STATIONARY / UNKNOWN).
 */

const GeoService = {
  watchId: null,
  lastPosition: null,
  prevPosition: null,
  isTracking: false,
  trackingIntervalMs: 5 * 60 * 1000,
  intervalTimer: null,

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
   * Classify movement activity based on speed, displacement, time delta, and accuracy
   */
  classifyActivity(currentPos, previousPos, settings = {}) {
    const accuracyLimit = settings.GPS_ACCURACY_LIMIT || 80;
    const speedThreshold = settings.MOVING_SPEED_THRESHOLD || 1.2; // m/s
    const stationaryDistanceThreshold = settings.STATIONARY_DISTANCE_THRESHOLD || 30; // meters

    // 1. Check GPS accuracy limit
    if (!currentPos.accuracy || currentPos.accuracy > accuracyLimit) {
      return "UNKNOWN";
    }

    // 2. Hardware GPS reported speed
    if (currentPos.speed !== null && currentPos.speed !== undefined && currentPos.speed >= speedThreshold) {
      return "MOVING";
    }

    // 3. Compare with previous GPS point
    if (!previousPos) {
      return "STATIONARY";
    }

    const distance = this.calculateDistance(previousPos.lat, previousPos.lng, currentPos.lat, currentPos.lng);
    const timeDeltaSeconds = Math.max(1, (currentPos.timestamp - previousPos.timestamp) / 1000);
    const calculatedSpeed = distance / timeDeltaSeconds;

    if (calculatedSpeed >= speedThreshold && distance > stationaryDistanceThreshold) {
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
        enableHighAccuracy: true,
        timeout: options.timeout || 15000,
        maximumAge: options.maximumAge || 0
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
   * Start continuous background GPS tracking for active sales work session
   */
  startTracking(intervalMinutes = 5, onUpdateCallback, onErrorCallback) {
    if (this.isTracking) return;
    this.isTracking = true;
    this.trackingIntervalMs = intervalMinutes * 60 * 1000;
    this.onLocationUpdate = onUpdateCallback;
    this.onError = onErrorCallback;

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
      const coords = await this.getCurrentPosition();
      this.processLocation(coords, true);
    } catch (err) {
      console.error("[GeoService] Poll error:", err.message);
      if (this.onError) this.onError(err);
    }
  },

  /**
   * Process and classify incoming GPS coordinate
   */
  processLocation(coords, isIntervalTick = false) {
    this.prevPosition = this.lastPosition;
    this.lastPosition = coords;

    const activity = this.classifyActivity(coords, this.prevPosition);
    const activityChanged = activity !== this.currentActivity;
    this.currentActivity = activity;

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
    this.currentActivity = "UNKNOWN";
    console.log("[GeoService] Stopped GPS tracking.");
  }
};
