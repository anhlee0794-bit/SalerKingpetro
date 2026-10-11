/**
 * SALES FIELD MANAGEMENT - GOOGLE APPS SCRIPT BACKEND
 * ===================================================
 * System designed for field sales teams (< 10 reps).
 * Tracks actual working hours, periodic GPS, movement classification,
 * customer radius check-in/out, manager timeline, routes, and reports.
 */

// ----------------------------------------------------
// GLOBAL CONFIG & CONSTANTS
// ----------------------------------------------------
var SPREADSHEET_ID = ""; // Leave blank to use active spreadsheet when container-bound, or set your Google Sheet ID

var SHEETS = {
  USERS: "USERS",
  CUSTOMERS: "CUSTOMERS",
  WORK_SESSIONS: "WORK_SESSIONS",
  GPS_LOGS: "GPS_LOGS",
  VISITS: "VISITS",
  SCHEDULES: "SCHEDULES",
  SETTINGS: "SETTINGS",
  LOGS: "LOGS"
};

var DEFAULT_SETTINGS = {
  GPS_INTERVAL: 5, // minutes
  CUSTOMER_RADIUS: 50, // meters (Geofencing check-in radius)
  MOVING_SPEED_THRESHOLD: 1.2, // m/s (~4.3 km/h)
  STATIONARY_DISTANCE_THRESHOLD: 30, // meters
  STATIONARY_TIME: 15, // minutes
  GPS_ACCURACY_LIMIT: 80, // meters
  // Customer Care Cycle Settings (in days)
  CARE_CYCLE_VIP: 3,
  CARE_CYCLE_NORMAL: 7,
  CARE_CYCLE_SMALL: 14,
  OVERDUE_WARNING_DAYS: 1,
  PROXIMITY_ALERT_RADIUS: 100 // meters to alert nearby existing customers when adding
};

// ----------------------------------------------------
// DATABASE INITIALIZATION & SETUP WITH SAFE MIGRATION
// ----------------------------------------------------
function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    throw new Error("Vui lòng cấu hình SPREADSHEET_ID trong Code.gs hoặc gán script vào Google Sheet.");
  }
}

/**
 * Run this function once or during updates to initialize / safely migrate all sheets.
 * Will NEVER delete or overwrite existing data.
 */
function setupSheets() {
  var ss = getSpreadsheet();
  var today = getTodayString();
  
  var schemas = [
    {
      name: SHEETS.USERS,
      headers: ["UserID", "Name", "Email", "Role", "Phone", "Team", "Status", "CreatedAt"],
      seed: [
        ["USR-001", "Quản Lý Nguyễn", "manager@company.com", "MANAGER", "0901234567", "North Team", "ACTIVE", new Date().toISOString()],
        ["USR-002", "Nguyễn Văn A", "sales.a@company.com", "SALES", "0901234568", "North Team", "ACTIVE", new Date().toISOString()],
        ["USR-003", "Trần Thị B", "sales.b@company.com", "SALES", "0901234569", "North Team", "ACTIVE", new Date().toISOString()],
        ["USR-004", "Lê Văn C", "sales.c@company.com", "SALES", "0901234570", "North Team", "ACTIVE", new Date().toISOString()],
        ["USR-000", "Admin Hệ Thống", "admin@company.com", "ADMIN", "0901234500", "HQ", "ACTIVE", new Date().toISOString()]
      ]
    },
    {
      name: SHEETS.CUSTOMERS,
      headers: [
        "CustomerID", "CustomerName", "ContactName", "Phone", "Address",
        "Latitude", "Longitude", "AssignedSalesID", "Status", "Note", "CreatedAt",
        "CustomerType", "CareCycleDays", "LastCareDate", "NextCareDate", "CurrentDebt", "CurrentStock", "StockUnit"
      ],
      seed: [
        ["CUST-001", "Đại lý Tạp Hóa Minh Phát", "Anh Minh", "0912345601", "128 Nguyễn Trãi, Q.1, TP.HCM", 10.7685, 106.6892, "USR-002", "ACTIVE", "Khách hàng thân thiết", new Date().toISOString(), "VIP", 3, "2026-09-12T08:30:00.000Z", "2026-09-15T08:30:00.000Z", 25000000, 150, "Thùng"],
        ["CUST-002", "Siêu Thị Mini VinaMart", "Chị Lan", "0912345602", "45 Lê Lợi, Bến Nghé, Q.1, TP.HCM", 10.7769, 106.7009, "USR-002", "ACTIVE", "Giao hàng buổi sáng", new Date().toISOString(), "NORMAL", 7, "2026-09-18T09:15:00.000Z", "2026-09-25T09:15:00.000Z", 12000000, 80, "Thùng"],
        ["CUST-003", "Nhà Phân Phối Bách Hóa Á Châu", "Anh Hùng", "0912345603", "320 Cách Mạng Tháng 8, Q.3, TP.HCM", 10.7812, 106.6775, "USR-003", "ACTIVE", "Đang đàm phán hợp đồng", new Date().toISOString(), "NORMAL", 7, "2026-09-10T10:00:00.000Z", "2026-09-17T10:00:00.000Z", 45000000, 210, "Xô"],
        ["CUST-004", "Cửa Hàng Tiện Lợi Sao Mai", "Cô Mai", "0912345604", "88 Hai Bà Trưng, Q.1, TP.HCM", 10.7801, 106.6998, "USR-002", "ACTIVE", "Tiềm năng mở rộng", new Date().toISOString(), "VIP", 3, "2026-09-08T14:20:00.000Z", "2026-09-11T14:20:00.000Z", 35000000, 45, "Chai"],
        ["CUST-005", "Đại Lý Sữa Bỉm Khang Thịnh", "Anh Thịnh", "0912345605", "15 Lý Thường Kiệt, Q.10, TP.HCM", 10.7628, 106.6587, "USR-004", "ACTIVE", "Doanh số tốt", new Date().toISOString(), "SMALL", 14, "", "", 0, 0, "Thùng"]
      ]
    },
    {
      name: SHEETS.WORK_SESSIONS,
      headers: ["SessionID", "SalesID", "Date", "CheckInTime", "CheckInLatitude", "CheckInLongitude", "CheckInAccuracy", "CheckOutTime", "CheckOutLatitude", "CheckOutLongitude", "WorkDuration", "Status"],
      seed: []
    },
    {
      name: SHEETS.GPS_LOGS,
      headers: ["GPSLogID", "SessionID", "SalesID", "Timestamp", "Latitude", "Longitude", "Accuracy", "Speed", "ActivityStatus"],
      seed: []
    },
    {
      name: SHEETS.VISITS,
      headers: [
        "VisitID", "SalesID", "CustomerID", "SessionID",
        "CheckInTime", "CheckInLatitude", "CheckInLongitude", "CheckInAccuracy",
        "CheckOutTime", "Duration", "Result", "Note", "Status",
        // Care Details (4 Blocks)
        "DistributedQty", "InventoryQty", "ReorderDemand",
        "RecordedDebt", "DebtLimit", "PaymentStatus",
        "NewOrderQty", "ExpectedNextOrder", "ConsumptionRate",
        "DiscussionDetails", "CustomerIssues", "NextCareNeeds",
        "SelectedProduct", "DistributedUnit", "InventoryUnit", "ReorderUnit", "NewOrderUnit"
      ],
      seed: []
    },
    {
      name: SHEETS.SCHEDULES,
      headers: ["ScheduleID", "SalesID", "CustomerID", "Date", "StartTime", "EndTime", "Note", "Status"],
      seed: []
    },
    {
      name: SHEETS.SETTINGS,
      headers: ["Key", "Value", "Description"],
      seed: [
        ["GPS_INTERVAL", "5", "Chu kỳ ghi GPS (phút): 1, 5, 10, 15"],
        ["CUSTOMER_RADIUS", "200", "Bán kính cho phép check-in khách hàng (mét)"],
        ["MOVING_SPEED_THRESHOLD", "1.2", "Ngưỡng tốc độ xác định di chuyển (m/s)"],
        ["STATIONARY_DISTANCE_THRESHOLD", "30", "Ngưỡng khoảng cách tối đa coi là đứng yên (mét)"],
        ["STATIONARY_TIME", "15", "Thời gian đứng yên tối thiểu để cảnh báo (phút)"],
        ["GPS_ACCURACY_LIMIT", "80", "Giới hạn độ sai số GPS chấp nhận được (mét)"],
        ["CARE_CYCLE_VIP", "3", "Chu kỳ chăm sóc Khách lớn/VIP (ngày)"],
        ["CARE_CYCLE_NORMAL", "7", "Chu kỳ chăm sóc Khách thường (ngày)"],
        ["CARE_CYCLE_SMALL", "14", "Chu kỳ chăm sóc Khách nhỏ (ngày)"],
        ["OVERDUE_WARNING_DAYS", "1", "Số ngày cảnh báo sắp đến hạn (ngày)"]
      ]
    },
    {
      name: SHEETS.LOGS,
      headers: ["LogID", "Timestamp", "Level", "Source", "Message", "Payload"],
      seed: [
        ["LOG-" + new Date().getTime(), new Date().toISOString(), "INFO", "SETUP", "Hệ thống Quản lý Chăm sóc Khách hàng & Sales Field khởi tạo thành công", ""]
      ]
    }
  ];

  schemas.forEach(function(schema) {
    var sheet = ss.getSheetByName(schema.name);
    if (!sheet) {
      sheet = ss.insertSheet(schema.name);
    }
    
    // If sheet is new/empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(schema.headers);
      var headerRange = sheet.getRange(1, 1, 1, schema.headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#E8F0FE");
      
      if (schema.seed && schema.seed.length > 0) {
        sheet.getRange(2, 1, schema.seed.length, schema.headers.length).setValues(schema.seed);
      }
    } else {
      // Safe Migration: Add any missing header columns to the right
      var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var missingHeaders = [];
      schema.headers.forEach(function(h) {
        if (existingHeaders.indexOf(h) === -1) {
          missingHeaders.push(h);
        }
      });
      if (missingHeaders.length > 0) {
        var startCol = existingHeaders.length + 1;
        missingHeaders.forEach(function(mh, idx) {
          var colIdx = startCol + idx;
          sheet.getRange(1, colIdx).setValue(mh).setFontWeight("bold").setBackground("#E8F0FE");
        });
      }
    }
  });

  return { success: true, message: "Hệ thống CSDL và Schema Chăm sóc khách hàng đã được cấu hình thành công!" };
}

// ----------------------------------------------------
// UTILITY FUNCTIONS & HAVERSINE DISTANCE
// ----------------------------------------------------
function toRad(value) {
  return (value * Math.PI) / 180;
}

/**
 * Calculates distance in meters between two lat/lng pairs using Haversine formula
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 0;
  var R = 6371000; // Radius of the Earth in meters
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function formatDistanceKm(meters) {
  if (meters === null || meters === undefined || isNaN(meters)) return "0.00 km";
  var km = Number(meters) / 1000;
  return km.toFixed(2) + " km";
}

function generateId(prefix) {
  return (prefix || "ID") + "-" + new Date().getTime() + "-" + Math.floor(Math.random() * 1000);
}

function getTodayString() {
  var d = new Date();
  var month = "" + (d.getMonth() + 1);
  var day = "" + d.getDate();
  var year = d.getFullYear();
  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;
  return [year, month, day].join("-");
}

function logMessage(level, source, message, payload) {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.LOGS);
    if (sheet) {
      sheet.appendRow([
        generateId("LOG"),
        new Date().toISOString(),
        level || "INFO",
        source || "SYSTEM",
        message || "",
        typeof payload === "object" ? JSON.stringify(payload) : (payload || "")
      ]);
    }
  } catch (e) {
    Logger.log("Log error: " + e.toString());
  }
}

function getSettings() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.SETTINGS);
    var settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!sheet) return settings;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var key = data[i][0];
      var val = data[i][1];
      if (key && val !== undefined && val !== "") {
        settings[key] = isNaN(Number(val)) ? val : Number(val);
      }
    }
    return settings;
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

// ----------------------------------------------------
// DATA ACCESS LAYER (BATCH READ/WRITE OPTIMIZED)
// ----------------------------------------------------
function getSheetData(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = values[i][j];
    }
    row._rowIndex = i + 1; // 1-indexed row number in spreadsheet
    rows.push(row);
  }
  return rows;
}

// ----------------------------------------------------
// AUTH & USER SERVICES
// ----------------------------------------------------
function authenticateUser(email) {
  if (!email) return { success: false, message: "Email không được để trống" };
  var users = getSheetData(SHEETS.USERS);
  var user = users.find(function(u) {
    return (u.Email + "").toLowerCase().trim() === (email + "").toLowerCase().trim() && u.Status === "ACTIVE";
  });
  if (!user) {
    return { success: false, message: "Tài khoản không tồn tại hoặc đã bị vô hiệu hóa" };
  }
  return {
    success: true,
    user: {
      UserID: user.UserID,
      Name: user.Name,
      Email: user.Email,
      Role: user.Role,
      Phone: user.Phone,
      Team: user.Team
    }
  };
}

function getUsersList(requesterRole) {
  if (requesterRole !== "MANAGER" && requesterRole !== "ADMIN") {
    return { success: false, message: "Không có quyền truy cập" };
  }
  var users = getSheetData(SHEETS.USERS);
  return { success: true, users: users };
}

// ----------------------------------------------------
// WORK SESSIONS & WORKING STATE (START / END)
// ----------------------------------------------------
function getActiveSession(salesId) {
  var sessions = getSheetData(SHEETS.WORK_SESSIONS);
  var active = sessions.find(function(s) {
    return s.SalesID === salesId && s.Status === "WORKING";
  });
  return active || null;
}

function startWorkSession(salesId, lat, lng, accuracy) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    
    // Check if user already has an active session today
    var currentActive = getActiveSession(salesId);
    if (currentActive) {
      return { success: true, session: currentActive, message: "Bạn đang có phiên làm việc đang chạy" };
    }
    
    var settings = getSettings();
    if (accuracy && accuracy > settings.GPS_ACCURACY_LIMIT * 2) {
      logMessage("WARN", "START_WORK", "Độ chính xác GPS thấp khi bắt đầu", { salesId: salesId, accuracy: accuracy });
    }
    
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.WORK_SESSIONS);
    var sessionId = generateId("SESS");
    var todayStr = getTodayString();
    var nowIso = new Date().toISOString();
    
    var newRow = [
      sessionId,
      salesId,
      todayStr,
      nowIso,
      lat || 0,
      lng || 0,
      accuracy || 0,
      "", // CheckOutTime
      "", // CheckOutLatitude
      "", // CheckOutLongitude
      0,  // WorkDuration (minutes)
      "WORKING"
    ];
    
    sheet.appendRow(newRow);
    
    // Also record first GPS log
    if (lat && lng) {
      recordGpsLog(sessionId, salesId, lat, lng, accuracy, 0, "STATIONARY");
    }
    
    logMessage("INFO", "START_WORK", "Sales bắt đầu làm việc: " + salesId, { sessionId: sessionId, lat: lat, lng: lng });
    
    return {
      success: true,
      session: {
        SessionID: sessionId,
        SalesID: salesId,
        Date: todayStr,
        CheckInTime: nowIso,
        CheckInLatitude: lat,
        CheckInLongitude: lng,
        CheckInAccuracy: accuracy,
        Status: "WORKING"
      }
    };
  } catch (e) {
    logMessage("ERROR", "START_WORK", "Lỗi bắt đầu phiên: " + e.message, e);
    return { success: false, message: "Lỗi hệ thống: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

function endWorkSession(sessionId, salesId, lat, lng, accuracy) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.WORK_SESSIONS);
    var sessions = getSheetData(SHEETS.WORK_SESSIONS);
    var session = sessions.find(function(s) {
      return s.SessionID === sessionId && s.SalesID === salesId && s.Status === "WORKING";
    });
    
    if (!session) {
      return { success: false, message: "Không tìm thấy phiên làm việc đang hoạt động" };
    }
    
    // Check if there is an in-progress customer visit, complete it automatically or warn
    var visits = getSheetData(SHEETS.VISITS);
    var activeVisit = visits.find(function(v) {
      return v.SessionID === sessionId && v.Status === "IN_PROGRESS";
    });
    if (activeVisit) {
      checkoutCustomerVisit(activeVisit.VisitID, salesId, "Tự động kết thúc khi hết ca", "Hoàn thành ca làm việc");
    }
    
    var now = new Date();
    var nowIso = now.toISOString();
    var checkInDate = new Date(session.CheckInTime);
    var durationMinutes = Math.round((now.getTime() - checkInDate.getTime()) / (1000 * 60));
    
    // Row in sheet = session._rowIndex
    var rowIndex = session._rowIndex;
    sheet.getRange(rowIndex, 8).setValue(nowIso); // CheckOutTime
    sheet.getRange(rowIndex, 9).setValue(lat || 0); // CheckOutLatitude
    sheet.getRange(rowIndex, 10).setValue(lng || 0); // CheckOutLongitude
    sheet.getRange(rowIndex, 11).setValue(durationMinutes); // WorkDuration
    sheet.getRange(rowIndex, 12).setValue("COMPLETED"); // Status
    
    // Record final GPS log
    if (lat && lng) {
      recordGpsLog(sessionId, salesId, lat, lng, accuracy, 0, "STATIONARY");
    }
    
    logMessage("INFO", "END_WORK", "Sales kết thúc làm việc: " + salesId, { sessionId: sessionId, duration: durationMinutes });
    
    return {
      success: true,
      message: "Đã kết thúc phiên làm việc thành công",
      duration: durationMinutes
    };
  } catch (e) {
    logMessage("ERROR", "END_WORK", "Lỗi kết thúc ca: " + e.message, e);
    return { success: false, message: "Lỗi kết thúc ca: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------
// GPS TRACKING & MOVEMENT CLASSIFICATION ENGINE
// ----------------------------------------------------
/**
 * Calculates whether sales is MOVING, STATIONARY, or UNKNOWN
 * Based on speed, distance from previous point, elapsed time, and accuracy threshold
 */
function classifyActivity(lat, lng, accuracy, speed, prevLog, settings) {
  if (!accuracy || accuracy > settings.GPS_ACCURACY_LIMIT) {
    return "UNKNOWN";
  }
  
  // If reported speed from device GPS is above threshold
  if (speed !== null && speed !== undefined && speed >= settings.MOVING_SPEED_THRESHOLD) {
    return "MOVING";
  }
  
  if (!prevLog || !prevLog.Latitude || !prevLog.Longitude) {
    return "STATIONARY";
  }
  
  var distance = calculateDistanceMeters(prevLog.Latitude, prevLog.Longitude, lat, lng);
  var timeDiffSeconds = Math.max(1, (new Date().getTime() - new Date(prevLog.Timestamp).getTime()) / 1000);
  var calculatedSpeed = distance / timeDiffSeconds;
  
  if (calculatedSpeed >= settings.MOVING_SPEED_THRESHOLD && distance > settings.STATIONARY_DISTANCE_THRESHOLD) {
    return "MOVING";
  }
  
  return "STATIONARY";
}

function recordGpsLog(sessionId, salesId, lat, lng, accuracy, speed, forcedStatus) {
  try {
    // Only record if session is active
    var session = getActiveSession(salesId);
    if (!session && !forcedStatus) {
      return { success: false, message: "Không thể ghi nhận GPS ngoài phiên làm việc" };
    }
    
    var settings = getSettings();
    var status = forcedStatus;
    
    if (!status) {
      // Get last GPS log for this session to classify
      var allLogs = getSheetData(SHEETS.GPS_LOGS);
      var sessionLogs = allLogs.filter(function(l) { return l.SessionID === sessionId; });
      var prevLog = sessionLogs.length > 0 ? sessionLogs[sessionLogs.length - 1] : null;
      status = classifyActivity(lat, lng, accuracy, speed, prevLog, settings);
    }
    
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.GPS_LOGS);
    var logId = generateId("GPS");
    var nowIso = new Date().toISOString();
    
    sheet.appendRow([
      logId,
      sessionId,
      salesId,
      nowIso,
      lat,
      lng,
      accuracy || 0,
      speed || 0,
      status
    ]);
    
    return {
      success: true,
      log: {
        GPSLogID: logId,
        SessionID: sessionId,
        SalesID: salesId,
        Timestamp: nowIso,
        Latitude: lat,
        Longitude: lng,
        Accuracy: accuracy,
        Speed: speed,
        ActivityStatus: status
      }
    };
  } catch (e) {
    logMessage("ERROR", "RECORD_GPS", "Lỗi ghi GPS: " + e.message, e);
    return { success: false, message: e.message };
  }
}

// ----------------------------------------------------
// CUSTOMER MANAGEMENT & RADIUS CHECK-IN/OUT
// ----------------------------------------------------
// ----------------------------------------------------
// CUSTOMER CARE CYCLE ENGINE & PROXIMITY CHECKING
// ----------------------------------------------------
/**
 * Calculate Care Status: OVERDUE (Quá hạn), DUE_SOON (Sắp đến hạn), ON_TRACK (Đúng hạn), NEVER_VISITED (Chưa từng chăm sóc)
 */
function calculateCareStatus(lastCareDateStr, cycleDays, settings) {
  var cycle = Number(cycleDays || 7);
  var warningDays = Number(settings && settings.OVERDUE_WARNING_DAYS ? settings.OVERDUE_WARNING_DAYS : 1);
  
  if (!lastCareDateStr || lastCareDateStr.trim() === "") {
    return {
      status: "NEVER_VISITED",
      statusLabel: "Chưa từng chăm sóc",
      badgeColor: "#94a3b8",
      daysOverdue: 0,
      daysSinceLast: 999,
      nextCareDate: ""
    };
  }
  
  var lastDate = new Date(lastCareDateStr);
  var nextDate = new Date(lastDate.getTime() + cycle * 24 * 60 * 60 * 1000);
  var now = new Date();
  
  // Calculate difference in whole days
  var msPerDay = 24 * 60 * 60 * 1000;
  var diffToNextDays = Math.floor((nextDate.getTime() - now.getTime()) / msPerDay);
  var daysSinceLast = Math.floor((now.getTime() - lastDate.getTime()) / msPerDay);
  
  if (diffToNextDays < 0) {
    return {
      status: "OVERDUE",
      statusLabel: "Quá hạn",
      badgeColor: "#ef4444",
      daysOverdue: Math.abs(diffToNextDays),
      daysSinceLast: daysSinceLast,
      nextCareDate: nextDate.toISOString()
    };
  } else if (diffToNextDays <= warningDays) {
    return {
      status: "DUE_SOON",
      statusLabel: "Sắp đến hạn",
      badgeColor: "#f59e0b",
      daysRemaining: diffToNextDays,
      daysSinceLast: daysSinceLast,
      nextCareDate: nextDate.toISOString()
    };
  } else {
    return {
      status: "ON_TRACK",
      statusLabel: "Đúng hạn",
      badgeColor: "#10b981",
      daysRemaining: diffToNextDays,
      daysSinceLast: daysSinceLast,
      nextCareDate: nextDate.toISOString()
    };
  }
}

function getCustomers(salesId, role) {
  var customers = getSheetData(SHEETS.CUSTOMERS);
  var settings = getSettings();
  
  // Enrich all customers with calculated care status
  var enriched = customers.map(function(c) {
    var cycle = Number(c.CareCycleDays || (c.CustomerType === "VIP" ? 3 : (c.CustomerType === "SMALL" ? 14 : 7)));
    var careMeta = calculateCareStatus(c.LastCareDate, cycle, settings);
    return {
      CustomerID: c.CustomerID,
      CustomerName: c.CustomerName,
      ContactName: c.ContactName,
      Phone: c.Phone,
      Address: c.Address,
      Latitude: Number(c.Latitude) || 0,
      Longitude: Number(c.Longitude) || 0,
      AssignedSalesID: c.AssignedSalesID,
      Status: c.Status,
      Note: c.Note,
      CreatedAt: c.CreatedAt,
      CustomerType: c.CustomerType || "NORMAL",
      CareCycleDays: cycle,
      LastCareDate: c.LastCareDate || "",
      NextCareDate: c.NextCareDate || careMeta.nextCareDate,
      CurrentDebt: Number(c.CurrentDebt) || 0,
      CurrentStock: Number(c.CurrentStock) || 0,
      CareStatus: careMeta.status,
      CareStatusLabel: careMeta.statusLabel,
      BadgeColor: careMeta.badgeColor,
      DaysOverdue: careMeta.daysOverdue || 0,
      DaysRemaining: careMeta.daysRemaining !== undefined ? careMeta.daysRemaining : 0,
      DaysSinceLast: careMeta.daysSinceLast,
      _rowIndex: c._rowIndex
    };
  });
  
  if (role === "MANAGER" || role === "ADMIN") {
    return { success: true, customers: enriched };
  }
  
  // Sales sees only assigned active customers
  var assigned = enriched.filter(function(c) {
    var isAssigned = c.AssignedSalesID === salesId || !c.AssignedSalesID || c.AssignedSalesID === "ALL";
    var isActive = c.Status === "ACTIVE";
    return isAssigned && isActive;
  });
  return { success: true, customers: assigned };
}

function checkCustomerDuplicate(phone, lat, lng, excludeCustomerId) {
  var customers = getSheetData(SHEETS.CUSTOMERS);
  var dupPhone = null;
  var nearbyCustomer = null;
  var minDistance = 999999;
  var settings = getSettings();
  var proximityRadius = Number(settings.PROXIMITY_ALERT_RADIUS || 100);
  
  var cleanPhone = (phone || "").replace(/\D/g, "");
  
  for (var i = 0; i < customers.length; i++) {
    var c = customers[i];
    if (excludeCustomerId && c.CustomerID === excludeCustomerId) continue;
    
    // Check phone duplicate
    if (cleanPhone && c.Phone) {
      var cPhone = (c.Phone + "").replace(/\D/g, "");
      if (cPhone === cleanPhone) {
        dupPhone = c;
      }
    }
    
    // Check GPS proximity alert (< 100 meters)
    if (lat && lng && c.Latitude && c.Longitude) {
      var dist = calculateDistanceMeters(Number(lat), Number(lng), Number(c.Latitude), Number(c.Longitude));
      if (dist <= proximityRadius && dist < minDistance) {
        minDistance = dist;
        nearbyCustomer = { customer: c, distance: dist };
      }
    }
  }
  
  return {
    hasDuplicatePhone: !!dupPhone,
    duplicatePhoneCustomer: dupPhone,
    hasNearbyCustomer: !!nearbyCustomer,
    nearbyCustomer: nearbyCustomer ? nearbyCustomer.customer : null,
    nearbyDistance: nearbyCustomer ? nearbyCustomer.distance : null
  };
}

function createCustomer(data, creatorRole, creatorId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    
    if (!data.CustomerName || !data.CustomerName.trim()) {
      return { success: false, message: "Tên khách hàng không được để trống" };
    }
    
    // Check duplicate
    var dupCheck = checkCustomerDuplicate(data.Phone, data.Latitude, data.Longitude, null);
    if (dupCheck.hasDuplicatePhone) {
      return {
        success: false,
        isDuplicate: true,
        message: "Số điện thoại " + data.Phone + " đã tồn tại trên khách hàng: " + dupCheck.duplicatePhoneCustomer.CustomerName
      };
    }
    
    var settings = getSettings();
    var customerType = data.CustomerType || "NORMAL";
    var defaultCycle = customerType === "VIP" ? Number(settings.CARE_CYCLE_VIP || 3) : (customerType === "SMALL" ? Number(settings.CARE_CYCLE_SMALL || 14) : Number(settings.CARE_CYCLE_NORMAL || 7));
    var careCycleDays = Number(data.CareCycleDays || defaultCycle);
    
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
    var customerId = generateId("CUST");
    var nowIso = new Date().toISOString();
    
    var initialStatus = (creatorRole === "SALES") ? "PENDING_APPROVAL" : (data.Status || "ACTIVE");
    var assignedSales = data.AssignedSalesID || (creatorRole === "SALES" ? creatorId : "ALL");
    
    sheet.appendRow([
      customerId,
      data.CustomerName.trim(),
      data.ContactName || "",
      data.Phone || "",
      data.Address || "",
      Number(data.Latitude) || 0,
      Number(data.Longitude) || 0,
      assignedSales,
      initialStatus,
      data.Note || "",
      nowIso,
      customerType,
      careCycleDays,
      "", // LastCareDate
      "", // NextCareDate
      Number(data.CurrentDebt) || 0,
      Number(data.CurrentStock) || 0,
      data.StockUnit || "Thùng"
    ]);
    
    logMessage("INFO", "CREATE_CUSTOMER", "Tạo khách hàng mới: " + data.CustomerName, {
      customerId: customerId,
      creatorId: creatorId,
      customerType: customerType,
      careCycleDays: careCycleDays
    });
    
    var response = {
      success: true,
      message: initialStatus === "PENDING_APPROVAL" ? "Đã gửi thông tin khách hàng. Đang chờ Quản lý phê duyệt." : "Đã thêm khách hàng thành công!",
      customerId: customerId,
      status: initialStatus
    };
    
    if (dupCheck.hasNearbyCustomer) {
      response.nearbyWarning = "Đã có khách hàng '" + dupCheck.nearbyCustomer.CustomerName + "' cách vị trí hiện tại " + dupCheck.nearbyDistance + "m.";
    }
    
    return response;
  } catch (e) {
    logMessage("ERROR", "CREATE_CUSTOMER", e.message, e);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function updateCustomer(customerId, data, updaterRole) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
    var customers = getSheetData(SHEETS.CUSTOMERS);
    var customer = customers.find(function(c) { return c.CustomerID === customerId; });
    
    if (!customer) {
      return { success: false, message: "Không tìm thấy khách hàng cần sửa" };
    }
    
    if (data.Phone) {
      var dupCheck = checkCustomerDuplicate(data.Phone, data.Latitude, data.Longitude, customerId);
      if (dupCheck.hasDuplicatePhone) {
        return {
          success: false,
          isDuplicate: true,
          message: "Số điện thoại " + data.Phone + " đã tồn tại trên khách hàng: " + dupCheck.duplicatePhoneCustomer.CustomerName
        };
      }
    }
    
    var rowIndex = customer._rowIndex;
    if (data.CustomerName !== undefined) sheet.getRange(rowIndex, 2).setValue(data.CustomerName);
    if (data.ContactName !== undefined) sheet.getRange(rowIndex, 3).setValue(data.ContactName);
    if (data.Phone !== undefined) sheet.getRange(rowIndex, 4).setValue(data.Phone);
    if (data.Address !== undefined) sheet.getRange(rowIndex, 5).setValue(data.Address);
    if (data.Latitude !== undefined) sheet.getRange(rowIndex, 6).setValue(Number(data.Latitude));
    if (data.Longitude !== undefined) sheet.getRange(rowIndex, 7).setValue(Number(data.Longitude));
    if (data.AssignedSalesID !== undefined) sheet.getRange(rowIndex, 8).setValue(data.AssignedSalesID);
    if (data.Status !== undefined) sheet.getRange(rowIndex, 9).setValue(data.Status);
    if (data.Note !== undefined) sheet.getRange(rowIndex, 10).setValue(data.Note);
    if (data.CustomerType !== undefined) sheet.getRange(rowIndex, 12).setValue(data.CustomerType);
    if (data.CareCycleDays !== undefined) sheet.getRange(rowIndex, 13).setValue(Number(data.CareCycleDays));
    if (data.CurrentDebt !== undefined) sheet.getRange(rowIndex, 16).setValue(Number(data.CurrentDebt));
    if (data.CurrentStock !== undefined) sheet.getRange(rowIndex, 17).setValue(Number(data.CurrentStock));
    if (data.StockUnit !== undefined) sheet.getRange(rowIndex, 18).setValue(data.StockUnit);
    
    logMessage("INFO", "UPDATE_CUSTOMER", "Cập nhật khách hàng: " + customerId, data);
    return { success: true, message: "Cập nhật thông tin khách hàng thành công!" };
  } catch (e) {
    logMessage("ERROR", "UPDATE_CUSTOMER", e.message, e);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------
// FULL CUSTOMER CARE VISIT CHECK-OUT (4 BLOCKS)
// ----------------------------------------------------
function checkoutCustomerCareVisit(visitId, salesId, careData) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var visitSheet = ss.getSheetByName(SHEETS.VISITS);
    var customerSheet = ss.getSheetByName(SHEETS.CUSTOMERS);
    
    var visits = getSheetData(SHEETS.VISITS);
    var visit = visits.find(function(v) {
      return v.VisitID === visitId && v.SalesID === salesId && v.Status === "IN_PROGRESS";
    });
    
    if (!visit) {
      return { success: false, message: "Không tìm thấy buổi chăm sóc khách hàng đang tiến hành" };
    }
    
    var now = new Date();
    var nowIso = now.toISOString();
    var checkInDate = new Date(visit.CheckInTime);
    var durationMinutes = Math.max(1, Math.round((now.getTime() - checkInDate.getTime()) / (1000 * 60)));
    
    var data = careData || {};
    var rowIndex = visit._rowIndex;
    
    // Update VISITS row
    visitSheet.getRange(rowIndex, 9).setValue(nowIso); // CheckOutTime
    visitSheet.getRange(rowIndex, 10).setValue(durationMinutes); // Duration
    visitSheet.getRange(rowIndex, 11).setValue(data.Result || "Đã chăm sóc"); // Result
    visitSheet.getRange(rowIndex, 12).setValue(data.Note || ""); // Note
    visitSheet.getRange(rowIndex, 13).setValue("COMPLETED"); // Status
    
    // Care Details 4 Blocks
    visitSheet.getRange(rowIndex, 14).setValue(Number(data.DistributedQty) || 0); // DistributedQty
    visitSheet.getRange(rowIndex, 15).setValue(Number(data.InventoryQty) || 0); // InventoryQty
    visitSheet.getRange(rowIndex, 16).setValue(data.ReorderDemand || ""); // ReorderDemand
    visitSheet.getRange(rowIndex, 17).setValue(Number(data.RecordedDebt) || 0); // RecordedDebt
    visitSheet.getRange(rowIndex, 18).setValue(Number(data.DebtLimit) || 0); // DebtLimit
    visitSheet.getRange(rowIndex, 19).setValue(data.PaymentStatus || "Chưa thanh toán"); // PaymentStatus
    visitSheet.getRange(rowIndex, 20).setValue(Number(data.NewOrderQty) || 0); // NewOrderQty
    visitSheet.getRange(rowIndex, 21).setValue(data.ExpectedNextOrder || ""); // ExpectedNextOrder
    visitSheet.getRange(rowIndex, 22).setValue(data.ConsumptionRate || "Bình thường"); // ConsumptionRate
    visitSheet.getRange(rowIndex, 23).setValue(data.DiscussionDetails || ""); // DiscussionDetails
    visitSheet.getRange(rowIndex, 24).setValue(data.CustomerIssues || ""); // CustomerIssues
    visitSheet.getRange(rowIndex, 25).setValue(data.NextCareNeeds || ""); // NextCareNeeds
    visitSheet.getRange(rowIndex, 26).setValue(data.SelectedProduct || ""); // SelectedProduct
    visitSheet.getRange(rowIndex, 27).setValue(data.DistributedUnit || "Thùng"); // DistributedUnit
    visitSheet.getRange(rowIndex, 28).setValue(data.InventoryUnit || "Thùng"); // InventoryUnit
    visitSheet.getRange(rowIndex, 29).setValue(data.ReorderUnit || "Thùng"); // ReorderUnit
    visitSheet.getRange(rowIndex, 30).setValue(data.NewOrderUnit || "Thùng"); // NewOrderUnit
    
    // Automatically update CUSTOMERS table (LastCareDate, NextCareDate, CurrentDebt, CurrentStock, StockUnit)
    var customers = getSheetData(SHEETS.CUSTOMERS);
    var cust = customers.find(function(c) { return c.CustomerID === visit.CustomerID; });
    if (cust) {
      var custRow = cust._rowIndex;
      var cycleDays = Number(cust.CareCycleDays || 7);
      var nextCareIso = new Date(now.getTime() + cycleDays * 24 * 60 * 60 * 1000).toISOString();
      
      customerSheet.getRange(custRow, 14).setValue(nowIso); // LastCareDate
      customerSheet.getRange(custRow, 15).setValue(nextCareIso); // NextCareDate
      if (data.RecordedDebt !== undefined && data.RecordedDebt !== "") {
        customerSheet.getRange(custRow, 16).setValue(Number(data.RecordedDebt)); // CurrentDebt
      }
      if (data.InventoryQty !== undefined && data.InventoryQty !== "") {
        customerSheet.getRange(custRow, 17).setValue(Number(data.InventoryQty)); // CurrentStock
      }
      if (data.InventoryUnit) {
        customerSheet.getRange(custRow, 18).setValue(data.InventoryUnit); // StockUnit
      }
    }
    
    logMessage("INFO", "CARE_VISIT_CHECKOUT", "Hoàn tất chăm sóc khách hàng: " + visit.CustomerID, {
      visitId: visitId,
      salesId: salesId,
      duration: durationMinutes,
      inventory: data.InventoryQty,
      debt: data.RecordedDebt,
      newOrder: data.NewOrderQty
    });
    
    return {
      success: true,
      message: "Đã hoàn thành buổi chăm sóc và cập nhật dữ liệu khách hàng thành công!",
      duration: durationMinutes
    };
  } catch (e) {
    logMessage("ERROR", "CARE_VISIT_CHECKOUT", e.message, e);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function approveCustomer(customerId, approved, approverId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.CUSTOMERS);
    var customers = getSheetData(SHEETS.CUSTOMERS);
    var customer = customers.find(function(c) { return c.CustomerID === customerId; });
    
    if (!customer) {
      return { success: false, message: "Không tìm thấy khách hàng" };
    }
    
    var rowIndex = customer._rowIndex;
    var newStatus = approved ? "ACTIVE" : "INACTIVE";
    sheet.getRange(rowIndex, 9).setValue(newStatus);
    
    logMessage("INFO", "APPROVE_CUSTOMER", (approved ? "Phê duyệt" : "Từ chối") + " khách hàng: " + customerId, {
      approverId: approverId,
      newStatus: newStatus
    });
    
    return {
      success: true,
      message: approved ? "Đã phê duyệt khách hàng thành công!" : "Đã từ chối khách hàng.",
      newStatus: newStatus
    };
  } catch (e) {
    logMessage("ERROR", "APPROVE_CUSTOMER", e.message, e);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function getCustomerVisits(customerId) {
  var visits = getSheetData(SHEETS.VISITS).filter(function(v) {
    return v.CustomerID === customerId;
  });
  var users = getSheetData(SHEETS.USERS);
  
  var enrichedVisits = visits.map(function(v) {
    var salesUser = users.find(function(u) { return u.UserID === v.SalesID; });
    return {
      visitId: v.VisitID,
      salesId: v.SalesID,
      salesName: salesUser ? salesUser.Name : v.SalesID,
      checkInTime: v.CheckInTime,
      checkOutTime: v.CheckOutTime,
      duration: v.Duration,
      result: v.Result,
      note: v.Note,
      status: v.Status
    };
  });
  
  enrichedVisits.sort(function(a, b) {
    return new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime();
  });
  
  return { success: true, visits: enrichedVisits };
}


function checkinCustomerVisit(salesId, customerId, sessionId, currentLat, currentLng, accuracy) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    
    var session = getActiveSession(salesId);
    if (!session) {
      return { success: false, message: "Bạn cần BẮT ĐẦU LÀM trước khi check-in khách hàng." };
    }
    
    // Check if there is already an in-progress visit
    var visits = getSheetData(SHEETS.VISITS);
    var activeVisit = visits.find(function(v) {
      return v.SalesID === salesId && v.Status === "IN_PROGRESS";
    });
    if (activeVisit) {
      if (activeVisit.CustomerID === customerId) {
        return { success: true, visit: activeVisit };
      }
      // Auto-complete previous open visit to avoid deadlock
      checkoutCustomerVisit(activeVisit.VisitID, salesId, "Tự động chuyển sang chăm sóc khách mới");
    }
    
    var customers = getSheetData(SHEETS.CUSTOMERS);
    var customer = customers.find(function(c) { return c.CustomerID === customerId; });
    if (!customer) {
      return { success: false, message: "Không tìm thấy thông tin khách hàng" };
    }
    
    var settings = getSettings();
    var allowedRadius = settings.CUSTOMER_RADIUS || 200;
    
    // Calculate distance for manager audit & route tracking (non-blocking for Sales)
    var distance = calculateDistanceMeters(currentLat, currentLng, Number(customer.Latitude), Number(customer.Longitude));
    var isWithinGeofence = (distance <= allowedRadius);
    
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.VISITS);
    var visitId = generateId("VIS");
    var nowIso = new Date().toISOString();
    
    sheet.appendRow([
      visitId,
      salesId,
      customerId,
      session.SessionID,
      nowIso,
      currentLat,
      currentLng,
      accuracy || 0,
      "", // CheckOutTime
      0,  // Duration (minutes)
      "", // Result
      "", // Note
      "IN_PROGRESS"
    ]);
    
    logMessage("INFO", "CUSTOMER_CHECKIN", "Check-in khách hàng " + customer.CustomerName, {
      salesId: salesId,
      customerId: customerId,
      distance: distance
    });
    
    return {
      success: true,
      visit: {
        VisitID: visitId,
        SalesID: salesId,
        CustomerID: customerId,
        CustomerName: customer.CustomerName,
        SessionID: session.SessionID,
        CheckInTime: nowIso,
        CheckInLatitude: currentLat,
        CheckInLongitude: currentLng,
        Status: "IN_PROGRESS"
      }
    };
  } catch (e) {
    logMessage("ERROR", "CUSTOMER_CHECKIN", e.message, e);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function checkoutCustomerVisit(visitId, salesId, result, note) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.VISITS);
    var visits = getSheetData(SHEETS.VISITS);
    var visit = visits.find(function(v) {
      return v.VisitID === visitId && v.SalesID === salesId && v.Status === "IN_PROGRESS";
    });
    
    if (!visit) {
      return { success: false, message: "Không tìm thấy lượt gặp khách đang tiến hành" };
    }
    
    var now = new Date();
    var nowIso = now.toISOString();
    var checkInDate = new Date(visit.CheckInTime);
    var durationMinutes = Math.max(1, Math.round((now.getTime() - checkInDate.getTime()) / (1000 * 60)));
    
    var rowIndex = visit._rowIndex;
    sheet.getRange(rowIndex, 9).setValue(nowIso); // CheckOutTime
    sheet.getRange(rowIndex, 10).setValue(durationMinutes); // Duration
    sheet.getRange(rowIndex, 11).setValue(result || "Hoàn thành"); // Result
    sheet.getRange(rowIndex, 12).setValue(note || ""); // Note
    sheet.getRange(rowIndex, 13).setValue("COMPLETED"); // Status
    
    logMessage("INFO", "CUSTOMER_CHECKOUT", "Hoàn tất gặp khách hàng", {
      visitId: visitId,
      salesId: salesId,
      duration: durationMinutes,
      result: result
    });
    
    return {
      success: true,
      message: "Check-out thành công!",
      duration: durationMinutes
    };
  } catch (e) {
    logMessage("ERROR", "CUSTOMER_CHECKOUT", e.message, e);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------
// MANAGER DASHBOARD & REALTIME STATS (WITH CARE KPIs)
// ----------------------------------------------------
function getManagerDashboard(dateStr) {
  var targetDate = dateStr || getTodayString();
  var users = getSheetData(SHEETS.USERS).filter(function(u) { return u.Role === "SALES" && u.Status === "ACTIVE"; });
  var sessions = getSheetData(SHEETS.WORK_SESSIONS).filter(function(s) { return s.Date === targetDate; });
  var gpsLogs = getSheetData(SHEETS.GPS_LOGS);
  var visits = getSheetData(SHEETS.VISITS);
  var customersRes = getCustomers(null, "MANAGER");
  var customers = customersRes.customers || [];
  
  var totalSales = users.length;
  var workingCount = 0;
  var completedCount = 0;
  var notStartedCount = 0;
  var totalVisitsToday = 0;
  var inProgressVisitsToday = 0;
  
  var salesList = users.map(function(user) {
    var session = sessions.find(function(s) { return s.SalesID === user.UserID; });
    var status = "CHƯA BẮT ĐẦU";
    var checkInTime = "--";
    var checkOutTime = "--";
    var activeVisitCustomer = null;
    var visitCount = 0;
    var currentActivity = "OFFLINE";
    var lastGps = null;
    
    // Customer care counts for this sales rep
    var assignedCusts = customers.filter(function(c) { return c.AssignedSalesID === user.UserID; });
    var overdueCusts = assignedCusts.filter(function(c) { return c.CareStatus === "OVERDUE"; });
    var dueSoonCusts = assignedCusts.filter(function(c) { return c.CareStatus === "DUE_SOON"; });
    
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
      
      var userGps = gpsLogs.filter(function(g) { return g.SessionID === session.SessionID; });
      if (userGps.length > 0) {
        lastGps = userGps[userGps.length - 1];
        currentActivity = session.Status === "WORKING" ? lastGps.ActivityStatus : "COMPLETED";
      }
      
      var userVisits = visits.filter(function(v) { return v.SessionID === session.SessionID; });
      visitCount = userVisits.length;
      totalVisitsToday += visitCount;
      
      var ongoingVisit = userVisits.find(function(v) { return v.Status === "IN_PROGRESS"; });
      if (ongoingVisit) {
        var cust = customers.find(function(c) { return c.CustomerID === ongoingVisit.CustomerID; });
        activeVisitCustomer = cust ? cust.CustomerName : "Khách hàng";
        inProgressVisitsToday++;
        currentActivity = "GẶP KHÁCH (" + activeVisitCustomer + ")";
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
  
  // Categorize All Customers for Manager Care Dashboard
  var overdueCustomers = customers.filter(function(c) { return c.CareStatus === "OVERDUE"; });
  var dueSoonCustomers = customers.filter(function(c) { return c.CareStatus === "DUE_SOON"; });
  var onTrackCustomers = customers.filter(function(c) { return c.CareStatus === "ON_TRACK"; });
  var neverVisitedCustomers = customers.filter(function(c) { return c.CareStatus === "NEVER_VISITED"; });
  
  // Aggregate Goods & Debt Totals
  var totalDebt = 0;
  var totalStock = 0;
  var highDebtCustomers = [];
  var lowStockCustomers = [];
  
  customers.forEach(function(c) {
    var debt = Number(c.CurrentDebt || 0);
    var stock = Number(c.CurrentStock || 0);
    totalDebt += debt;
    totalStock += stock;
    
    if (debt >= 20000000) {
      highDebtCustomers.push(c);
    }
    if (stock > 0 && stock <= 50) {
      lowStockCustomers.push(c);
    }
  });
  
  return {
    success: true,
    date: targetDate,
    stats: {
      totalSales: totalSales,
      workingCount: workingCount,
      notStartedCount: notStartedCount,
      completedCount: completedCount,
      totalVisits: totalVisitsToday,
      inProgressVisits: inProgressVisitsToday,
      // Care Retention Stats
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

// ----------------------------------------------------
// SALES DETAIL & INTERACTIVE TIMELINE BUILDER
// ----------------------------------------------------
function getSalesDetailTimeline(salesId, dateStr) {
  var targetDate = dateStr || getTodayString();
  var users = getSheetData(SHEETS.USERS);
  var user = users.find(function(u) { return u.UserID === salesId; });
  if (!user) return { success: false, message: "Không tìm thấy Sales" };
  
  var sessions = getSheetData(SHEETS.WORK_SESSIONS).filter(function(s) {
    return s.SalesID === salesId && s.Date === targetDate;
  });
  
  if (sessions.length === 0) {
    return {
      success: true,
      user: user,
      hasData: false,
      message: "Không có dữ liệu làm việc trong ngày " + targetDate
    };
  }
  
  var session = sessions[0];
  var gpsLogs = getSheetData(SHEETS.GPS_LOGS).filter(function(g) {
    return g.SessionID === session.SessionID;
  });
  
  var visits = getSheetData(SHEETS.VISITS).filter(function(v) {
    return v.SessionID === session.SessionID;
  });
  var customers = getSheetData(SHEETS.CUSTOMERS);
  
  // Calculate durations
  var movingTimeMinutes = 0;
  var stationaryTimeMinutes = 0;
  var settings = getSettings();
  var intervalMin = Number(settings.GPS_INTERVAL || 5);
  
  gpsLogs.forEach(function(g) {
    if (g.ActivityStatus === "MOVING") movingTimeMinutes += intervalMin;
    else if (g.ActivityStatus === "STATIONARY") stationaryTimeMinutes += intervalMin;
  });
  
  // Build Unified Chronological Timeline Events
  var timelineEvents = [];
  
  if (session.CheckInTime) {
    timelineEvents.push({
      time: session.CheckInTime,
      displayTime: session.CheckInTime.substring(11, 16),
      type: "START_WORK",
      title: "Bắt đầu làm việc",
      description: "Tọa độ: " + session.CheckInLatitude + ", " + session.CheckInLongitude,
      lat: session.CheckInLatitude,
      lng: session.CheckInLongitude
    });
  }
  
  // Add Visits to timeline
  visits.forEach(function(v) {
    var cust = customers.find(function(c) { return c.CustomerID === v.CustomerID; });
    var custName = cust ? cust.CustomerName : "Khách hàng " + v.CustomerID;
    
    timelineEvents.push({
      time: v.CheckInTime,
      displayTime: v.CheckInTime.substring(11, 16),
      type: "VISIT_CHECKIN",
      title: "Gặp khách: " + custName,
      description: "Thời gian: " + (v.Duration || "Đang gặp") + " phút | Kết quả: " + (v.Result || "--") + " | Ghi chú: " + (v.Note || "--"),
      duration: v.Duration,
      result: v.Result,
      note: v.Note,
      lat: v.CheckInLatitude,
      lng: v.CheckInLongitude,
      customerName: custName,
      address: cust ? cust.Address : ""
    });
  });
  
  // Add significant GPS state transitions to timeline
  var lastStatus = null;
  gpsLogs.forEach(function(g) {
    if (g.ActivityStatus !== lastStatus) {
      timelineEvents.push({
        time: g.Timestamp,
        displayTime: g.Timestamp.substring(11, 16),
        type: g.ActivityStatus === "MOVING" ? "MOVING" : "STATIONARY",
        title: g.ActivityStatus === "MOVING" ? "Đang di chuyển" : "Đứng yên",
        description: "Tốc độ: " + (g.Speed ? g.Speed.toFixed(1) : "0") + " m/s | Sai số: " + Math.round(g.Accuracy || 0) + "m",
        lat: g.Latitude,
        lng: g.Longitude
      });
      lastStatus = g.ActivityStatus;
    }
  });
  
  if (session.CheckOutTime) {
    timelineEvents.push({
      time: session.CheckOutTime,
      displayTime: session.CheckOutTime.substring(11, 16),
      type: "END_WORK",
      title: "Kết thúc làm",
      description: "Tổng thời gian: " + session.WorkDuration + " phút",
      lat: session.CheckOutLatitude,
      lng: session.CheckOutLongitude
    });
  }
  
  // Sort timeline chronologically
  timelineEvents.sort(function(a, b) {
    return new Date(a.time).getTime() - new Date(b.time).getTime();
  });
  
  // Identify potential Anomalies / Alerts (Data-driven, non-judgmental)
  var anomalies = [];
  if (gpsLogs.length === 0 && session.Status === "WORKING") {
    anomalies.push({ type: "NO_GPS", message: "Chưa ghi nhận được điểm GPS nào trong ca" });
  }
  if (stationaryTimeMinutes >= 120) {
    anomalies.push({ type: "LONG_STATIONARY", message: "Thời gian đứng yên tích lũy trên " + Math.round(stationaryTimeMinutes / 60) + " giờ" });
  }
  if (visits.length === 0 && session.WorkDuration > 180) {
    anomalies.push({ type: "NO_VISIT", message: "Chưa có lượt ghé thăm khách hàng nào sau " + Math.round(session.WorkDuration / 60) + " giờ làm việc" });
  }
  
  return {
    success: true,
    user: user,
    hasData: true,
    session: session,
    summary: {
      checkIn: session.CheckInTime ? session.CheckInTime.substring(11, 16) : "--",
      checkOut: session.CheckOutTime ? session.CheckOutTime.substring(11, 16) : "--",
      workDuration: session.WorkDuration || 0,
      visitCount: visits.length,
      movingTime: movingTimeMinutes,
      stationaryTime: stationaryTimeMinutes,
      gpsRecordCount: gpsLogs.length
    },
    gpsRoute: gpsLogs,
    visits: visits,
    timeline: timelineEvents,
    anomalies: anomalies
  };
}

function getPerformanceReportsData(targetSalesId, period, date) {
  var today = date || getTodayString();
  var users = getSheetData(SHEETS.USERS);
  var salesUsers = users.filter(function(u) {
    return u.Role === "SALES" && u.Status === "ACTIVE" && (!targetSalesId || targetSalesId === "ALL" || u.UserID === targetSalesId);
  });
  
  var custRes = getCustomers(null, "MANAGER");
  var allCusts = (custRes && custRes.customers) || [];
  var allVisits = getSheetData(SHEETS.VISITS);
  var allSessions = getSheetData(SHEETS.WORK_SESSIONS);
  
  var repReports = salesUsers.map(function(user) {
    var assignedCusts = allCusts.filter(function(c) {
      return c.AssignedSalesID === user.UserID || c.AssignedSalesID === "ALL";
    });
    var overdueCusts = assignedCusts.filter(function(c) { return c.CareStatus === "OVERDUE"; });
    var dueSoonCusts = assignedCusts.filter(function(c) { return c.CareStatus === "DUE_SOON"; });
    var onTrackCusts = assignedCusts.filter(function(c) { return c.CareStatus === "ON_TRACK" || c.CareStatus === "DUE_SOON"; });
    
    var userVisits = allVisits.filter(function(v) { return v.SalesID === user.UserID; });
    var userSessions = allSessions.filter(function(s) { return s.SalesID === user.UserID; });
    
    var totalDistributed = 0;
    var totalNewOrders = 0;
    var totalVisitDuration = 0;
    var completedVisitsCount = 0;
    
    userVisits.forEach(function(v) {
      totalDistributed += Number(v.DistributedQty || 0);
      totalNewOrders += Number(v.NewOrderQty || 0);
      totalVisitDuration += Number(v.Duration || 0);
      if (v.Status === "COMPLETED" || (v.Duration && Number(v.Duration) > 0)) {
        completedVisitsCount++;
      }
    });
    
    var totalWorkMinutes = 0;
    userSessions.forEach(function(s) {
      totalWorkMinutes += Number(s.WorkDuration || 0);
    });
    
    var targetVisits = Math.max(1, assignedCusts.length > 0 ? assignedCusts.length : 5);
    var routeCompletionRate = Math.min(100, Math.round((completedVisitsCount / targetVisits) * 100));
    var careComplianceRate = assignedCusts.length > 0 ? Math.round((onTrackCusts.length / assignedCusts.length) * 100) : 100;
    var avgTimePerVisit = completedVisitsCount > 0 ? Math.round(totalVisitDuration / completedVisitsCount) : 0;
    var totalFieldHours = (totalWorkMinutes / 60).toFixed(1);
    
    var performanceRating = "ĐẠT";
    var ratingBadge = "badge-working";
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
  
  var totalVisits = repReports.reduce(function(acc, r) { return acc + r.completedVisits; }, 0);
  var totalOrders = repReports.reduce(function(acc, r) { return acc + r.totalNewOrders; }, 0);
  var totalDistributed = repReports.reduce(function(acc, r) { return acc + r.totalDistributed; }, 0);
  var totalHours = repReports.reduce(function(acc, r) { return acc + Number(r.totalFieldHours); }, 0).toFixed(1);
  var avgRouteRate = repReports.length > 0 ? Math.round(repReports.reduce(function(acc, r) { return acc + r.routeCompletionRate; }, 0) / repReports.length) : 0;
  var totalOverdue = repReports.reduce(function(acc, r) { return acc + r.overdueCount; }, 0);
  
  return {
    success: true,
    period: period || "today",
    salesId: targetSalesId || "ALL",
    date: today,
    summary: {
      totalSalesCount: repReports.length,
      totalVisits: totalVisits,
      totalOrders: totalOrders,
      totalDistributed: totalDistributed,
      totalFieldHours: totalHours,
      avgRouteCompletionRate: avgRouteRate,
      totalOverdueCount: totalOverdue
    },
    reports: repReports
  };
}

// ----------------------------------------------------
// WEB APP API ROUTER (GET / POST)
// ----------------------------------------------------
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  
  // Return HTML app for root or view requests
  if (!action || action === "view") {
    return HtmlService.createHtmlOutputFromFile("index")
      .setTitle("Sales Field Management")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
  }
  
  // JSON API Handler
  var result = handleApiAction(action, e.parameter);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var postData = {};
  try {
    if (e && e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    postData = e.parameter || {};
  }
  
  var action = postData.action || (e && e.parameter && e.parameter.action);
  var result = handleApiAction(action, postData);
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleApiAction(action, params) {
  try {
    switch (action) {
      case "setup":
        return setupSheets();
      case "getSettings":
        return { success: true, settings: getSettings() };
      case "login":
        return authenticateUser(params.email);
      case "getUsers":
        return getUsersList(params.role);
      case "getActiveSession":
        return { success: true, session: getActiveSession(params.salesId) };
      case "startWork":
        return startWorkSession(params.salesId, Number(params.lat), Number(params.lng), Number(params.accuracy));
      case "endWork":
        return endWorkSession(params.sessionId, params.salesId, Number(params.lat), Number(params.lng), Number(params.accuracy));
      case "recordGps":
        return recordGpsLog(params.sessionId, params.salesId, Number(params.lat), Number(params.lng), Number(params.accuracy), Number(params.speed), params.forcedStatus);
      case "getCustomers":
        return getCustomers(params.salesId, params.role);
      case "createCustomer":
        return createCustomer(params.data || params, params.role, params.creatorId);
      case "updateCustomer":
        return updateCustomer(params.customerId, params.data || params, params.role);
      case "approveCustomer":
        return approveCustomer(params.customerId, params.approved, params.approverId);
      case "getCustomerVisits":
        return getCustomerVisits(params.customerId);
      case "checkinVisit":
        return checkinCustomerVisit(params.salesId, params.customerId, params.sessionId, Number(params.lat), Number(params.lng), Number(params.accuracy));
      case "checkoutVisit":
        return checkoutCustomerVisit(params.visitId, params.salesId, params.result, params.note);
      case "checkoutCareVisit":
        return checkoutCustomerCareVisit(params.visitId, params.salesId, params.careData || params);
      case "getManagerDashboard":
        return getManagerDashboard(params.date);
      case "getSalesTimeline":
        return getSalesDetailTimeline(params.salesId, params.date);
      case "getPerformanceReports":
        return getPerformanceReportsData(params.salesId, params.period, params.date);
      default:
        return { success: false, message: "Action không hợp lệ: " + action };
    }
  } catch (err) {
    return { success: false, message: "Lỗi thực thi API: " + err.message };
  }
}
