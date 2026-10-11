/**
 * ROLE-BASED ACCESS CONTROL (RBAC) & PERMISSIONS MODULE
 * Defines roles, permissions matrix, access guards, and data filtering helpers.
 */

const ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  SALES: "SALES"
};

const PERMISSIONS = {
  // System Administration
  MANAGE_SYSTEM_SETTINGS: [ROLES.ADMIN],
  RESET_DATABASE: [ROLES.ADMIN],
  MANAGE_USERS: [ROLES.ADMIN],
  VIEW_SYSTEM_CONFIG: [ROLES.ADMIN],

  // Supervisory & Management
  VIEW_ALL_SALES: [ROLES.ADMIN, ROLES.MANAGER],
  VIEW_ALL_CUSTOMERS: [ROLES.ADMIN, ROLES.MANAGER],
  VIEW_ALL_REPORTS: [ROLES.ADMIN, ROLES.MANAGER],
  VIEW_TEAM_TIMELINE: [ROLES.ADMIN, ROLES.MANAGER],
  APPROVE_CUSTOMER: [ROLES.ADMIN, ROLES.MANAGER],
  REASSIGN_CUSTOMER: [ROLES.ADMIN, ROLES.MANAGER],
  EXPORT_DATA: [ROLES.ADMIN, ROLES.MANAGER],

  // Product Catalog Management
  MANAGE_PRODUCTS: [ROLES.ADMIN, ROLES.MANAGER],
  VIEW_PRODUCTS: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES],

  // Customer Info Approval Flow
  REQUEST_CUSTOMER_UPDATE: [ROLES.SALES, ROLES.MANAGER, ROLES.ADMIN],
  APPROVE_CUSTOMER_UPDATE: [ROLES.ADMIN, ROLES.MANAGER],

  // Field Operations
  VIEW_OWN_CUSTOMERS: [ROLES.SALES, ROLES.MANAGER, ROLES.ADMIN],
  VIEW_OWN_TIMELINE: [ROLES.SALES, ROLES.MANAGER, ROLES.ADMIN],
  FIELD_CHECKIN_CHECKOUT: [ROLES.SALES, ROLES.ADMIN],
  UPDATE_CARE_DETAILS: [ROLES.SALES, ROLES.ADMIN],
  CREATE_PROSPECT: [ROLES.SALES, ROLES.MANAGER, ROLES.ADMIN],
  SIMULATE_GPS: [ROLES.SALES, ROLES.MANAGER, ROLES.ADMIN],

  // Workspace Navigations
  ACCESS_MANAGER_WORKSPACE: [ROLES.ADMIN, ROLES.MANAGER],
  ACCESS_SALES_WORKSPACE: [ROLES.SALES, ROLES.ADMIN]
};

const TAB_PERMISSIONS = {
  dashboard: [ROLES.ADMIN, ROLES.MANAGER],
  map: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES],
  timeline: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES],
  customers: [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES],
  approvals: [ROLES.ADMIN, ROLES.MANAGER], // Tab Phê Duyệt Thay Đổi
  products: [ROLES.ADMIN, ROLES.MANAGER],  // Tab Quản Lý Danh Mục Hàng Hóa
  reports: [ROLES.ADMIN, ROLES.MANAGER],
  users: [ROLES.ADMIN] // Dedicated personnel & route allocation tab
};

const ROLE_METADATA = {
  [ROLES.ADMIN]: {
    label: "Admin Hệ Thống",
    badgeClass: "role-admin",
    icon: "shield-check",
    color: "#7e22ce",
    bg: "#f3e8ff",
    description: "Toàn quyền cấu hình GAS, quản lý người dùng, phân bổ tuyến và giám sát toàn bộ hệ thống."
  },
  [ROLES.MANAGER]: {
    label: "Quản Lý Vùng",
    badgeClass: "role-manager",
    icon: "briefcase",
    color: "#b45309",
    bg: "#fef3c7",
    description: "Giám sát thời gian thực đội ngũ Sales, xem bản đồ lộ trình, timeline, báo cáo và duyệt điểm bán."
  },
  [ROLES.SALES]: {
    label: "Sales Thị Trường",
    badgeClass: "role-sales",
    icon: "user",
    color: "#0369a1",
    bg: "#e0f2fe",
    description: "Tác nghiệp đi tuyến, chấm công phiên làm việc, ghé thăm khách hàng, cập nhật 4 khối dữ liệu chăm sóc."
  }
};

const PermissionService = {
  ROLES,
  PERMISSIONS,
  TAB_PERMISSIONS,
  ROLE_METADATA,

  /**
   * Check if a specific role possesses a given permission
   */
  hasPermission(role, permissionKey) {
    if (!role) return false;
    const allowedRoles = PERMISSIONS[permissionKey];
    if (!allowedRoles) {
      console.warn(`[PermissionService] Undefined permission key: ${permissionKey}`);
      return false;
    }
    return allowedRoles.includes(role);
  },

  /**
   * Check if a role can access a specific manager tab
   */
  canAccessTab(role, tabKey) {
    if (!role) return false;
    const allowed = TAB_PERMISSIONS[tabKey];
    if (!allowed) return true; // Default to allow if not explicitly restricted
    return allowed.includes(role);
  },

  /**
   * Enforce permission with user-friendly alert/toast if unauthorized
   */
  guard(user, permissionKey, customMessage) {
    const role = (user && user.Role) || "";
    if (this.hasPermission(role, permissionKey)) {
      return true;
    }

    const defaultMsg = `Từ chối truy cập: Vai trò ${role || 'Ẩn danh'} không có quyền thực hiện thao tác này.`;
    const message = customMessage || defaultMsg;
    if (typeof UI !== "undefined" && UI.showToast) {
      UI.showToast(message, "danger");
    } else {
      alert(message);
    }
    return false;
  },

  /**
   * Filter customer list based on role scope
   */
  filterCustomers(customers, user) {
    if (!Array.isArray(customers) || !user) return [];
    if (user.Role === ROLES.ADMIN || user.Role === ROLES.MANAGER) {
      return customers;
    }
    // Sales only sees assigned customers or unassigned prospects created
    return customers.filter(c => !c.AssignedSalesID || c.AssignedSalesID === user.UserID);
  },

  /**
   * Filter sales rep list accessible to the current user
   */
  filterSalesList(salesList, user) {
    if (!Array.isArray(salesList) || !user) return [];
    if (user.Role === ROLES.ADMIN || user.Role === ROLES.MANAGER) {
      return salesList;
    }
    // Sales rep only sees themselves
    return salesList.filter(s => s.UserID === user.UserID);
  },

  /**
   * Get metadata information for display
   */
  getMeta(role) {
    return ROLE_METADATA[role] || {
      label: role,
      badgeClass: "role-pill",
      icon: "user",
      color: "#64748b",
      bg: "#f1f5f9",
      description: "Người dùng hệ thống"
    };
  }
};

// Export to window for global browser access
window.ROLES = ROLES;
window.PERMISSIONS = PERMISSIONS;
window.PermissionService = PermissionService;
