import math
import unittest
from datetime import datetime, timedelta

def calculate_distance_meters(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2):
        return 0
    R = 6371000 # Earth radius in meters
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c)

def classify_activity(accuracy, speed, prev_lat, prev_lng, cur_lat, cur_lng, time_delta_sec, accuracy_limit=80, speed_threshold=1.2, stationary_dist_limit=30):
    if accuracy is None or accuracy > accuracy_limit:
        return "UNKNOWN"
    if speed is not None and speed >= speed_threshold:
        return "MOVING"
    if prev_lat is None or prev_lng is None:
        return "STATIONARY"
    dist = calculate_distance_meters(prev_lat, prev_lng, cur_lat, cur_lng)
    calculated_speed = dist / max(1, time_delta_sec)
    if calculated_speed >= speed_threshold and dist > stationary_dist_limit:
        return "MOVING"
    return "STATIONARY"

def check_customer_duplicate(new_phone, new_lat, new_lng, existing_customers, proximity_threshold_m=100):
    clean_new_phone = "".join(filter(str.isdigit, str(new_phone or "")))
    dup_phone = None
    dup_gps = None

    for c in existing_customers:
        # Check phone duplicate
        c_phone = "".join(filter(str.isdigit, str(c.get("Phone") or "")))
        if clean_new_phone and c_phone and clean_new_phone == c_phone:
            dup_phone = c

        # Check GPS proximity (< proximity_threshold_m meters)
        if new_lat is not None and new_lng is not None and c.get("Latitude") is not None and c.get("Longitude") is not None:
            dist = calculate_distance_meters(float(new_lat), float(new_lng), float(c["Latitude"]), float(c["Longitude"]))
            if dist <= proximity_threshold_m:
                dup_gps = {"customer": c, "distance": dist}

    return {
        "hasDuplicatePhone": bool(dup_phone),
        "duplicatePhoneCustomer": dup_phone,
        "hasDuplicateGps": bool(dup_gps),
        "duplicateGpsCustomer": dup_gps["customer"] if dup_gps else None,
        "gpsDistance": dup_gps["distance"] if dup_gps else None
    }

def calculate_care_status(last_care_date_iso, cycle_days, reference_now_iso=None, warning_days=1):
    cycle = int(cycle_days or 7)
    now = datetime.fromisoformat(reference_now_iso.replace("Z", "+00:00")) if reference_now_iso else datetime.utcnow()
    
    if not last_care_date_iso:
        return {
            "status": "NEVER_VISITED",
            "statusLabel": "Chưa từng chăm sóc",
            "daysOverdue": 0,
            "daysRemaining": 0,
            "daysSinceLast": 999
        }
    
    last_date = datetime.fromisoformat(last_care_date_iso.replace("Z", "+00:00"))
    next_date = last_date + timedelta(days=cycle)
    diff_days = (next_date.date() - now.date()).days
    days_since_last = (now.date() - last_date.date()).days

    if diff_days < 0:
        return {
            "status": "OVERDUE",
            "statusLabel": "Quá hạn",
            "daysOverdue": abs(diff_days),
            "daysRemaining": 0,
            "daysSinceLast": days_since_last
        }
    elif diff_days <= warning_days:
        return {
            "status": "DUE_SOON",
            "statusLabel": "Sắp đến hạn",
            "daysOverdue": 0,
            "daysRemaining": diff_days,
            "daysSinceLast": days_since_last
        }
    else:
        return {
            "status": "ON_TRACK",
            "statusLabel": "Đúng hạn",
            "daysOverdue": 0,
            "daysRemaining": diff_days,
            "daysSinceLast": days_since_last
        }

from decimal import Decimal, ROUND_HALF_UP

def format_distance_km(meters):
    if meters is None:
        return "0.00 km"
    km = Decimal(str(meters)) / Decimal("1000")
    formatted = km.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{formatted} km"

def validate_geofence_checkin(sales_lat, sales_lng, cust_lat, cust_lng, max_radius_m=50):
    if None in (sales_lat, sales_lng, cust_lat, cust_lng):
        return {"isValid": False, "distance": None, "message": "Tọa độ GPS không hợp lệ"}
    dist = calculate_distance_meters(sales_lat, sales_lng, cust_lat, cust_lng)
    is_valid = dist <= max_radius_m
    return {
        "isValid": is_valid,
        "distance": dist,
        "maxRadius": max_radius_m,
        "message": "Hợp lệ trong bán kính" if is_valid else f"Cách {dist}m (Vượt quá bán kính cho phép {max_radius_m}m)"
    }

class TestSalesFieldLogic(unittest.TestCase):
    def setUp(self):
        self.customers = [
            {"CustomerID": "CUST-001", "CustomerName": "Đại lý Tạp Hóa Minh Phát", "Phone": "0912345601", "Latitude": 10.7685, "Longitude": 106.6892, "Status": "ACTIVE"},
            {"CustomerID": "CUST-002", "CustomerName": "Siêu Thị Mini VinaMart", "Phone": "0912345602", "Latitude": 10.7769, "Longitude": 106.7009, "Status": "ACTIVE"},
        ]

    def test_format_distance_km(self):
        self.assertEqual(format_distance_km(125), "0.13 km")
        self.assertEqual(format_distance_km(350), "0.35 km")
        self.assertEqual(format_distance_km(850), "0.85 km")
        self.assertEqual(format_distance_km(1250), "1.25 km")
        self.assertEqual(format_distance_km(12500), "12.50 km")
        self.assertEqual(format_distance_km(200), "0.20 km")
        self.assertEqual(format_distance_km(50), "0.05 km")
        self.assertEqual(format_distance_km(0), "0.00 km")

    def test_geofence_validation_50m(self):
        cust_lat, cust_lng = 10.76850, 106.68920
        # Exactly ~35m away
        sales_near = (10.76875, 106.68935)
        res_near = validate_geofence_checkin(sales_near[0], sales_near[1], cust_lat, cust_lng, max_radius_m=50)
        self.assertTrue(res_near["isValid"])
        self.assertLessEqual(res_near["distance"], 50)

        # ~120m away -> Out of geofence
        sales_far = (10.76950, 106.68980)
        res_far = validate_geofence_checkin(sales_far[0], sales_far[1], cust_lat, cust_lng, max_radius_m=50)
        self.assertFalse(res_far["isValid"])
        self.assertGreater(res_far["distance"], 50)

    def test_haversine_distance_accurate(self):
        dist = calculate_distance_meters(10.7725, 106.6980, 10.7716, 106.7044)
        self.assertTrue(600 <= dist <= 900, f"Distance was {dist}m, expected ~700-800m")

    def test_checkin_radius_threshold(self):
        cust_lat, cust_lng = 10.7685, 106.6892
        near_sales = (10.7688, 106.6894)
        dist_near = calculate_distance_meters(cust_lat, cust_lng, near_sales[0], near_sales[1])
        self.assertLessEqual(dist_near, 200)

        far_sales = (10.7800, 106.7000)
        dist_far = calculate_distance_meters(cust_lat, cust_lng, far_sales[0], far_sales[1])
        self.assertGreater(dist_far, 200)

    def test_movement_classification(self):
        status1 = classify_activity(accuracy=120, speed=2.0, prev_lat=10.7, prev_lng=106.6, cur_lat=10.71, cur_lng=106.61, time_delta_sec=60)
        self.assertEqual(status1, "UNKNOWN")

        status2 = classify_activity(accuracy=10, speed=5.5, prev_lat=10.7, prev_lng=106.6, cur_lat=10.705, cur_lng=106.605, time_delta_sec=60)
        self.assertEqual(status2, "MOVING")

        status3 = classify_activity(accuracy=8, speed=0.1, prev_lat=10.7000, prev_lng=106.6000, cur_lat=10.70002, cur_lng=106.60001, time_delta_sec=300)
        self.assertEqual(status3, "STATIONARY")

    def test_duplicate_phone_detection(self):
        res1 = check_customer_duplicate(new_phone="0912-345-601", new_lat=10.8000, new_lng=106.8000, existing_customers=self.customers)
        self.assertTrue(res1["hasDuplicatePhone"])
        self.assertEqual(res1["duplicatePhoneCustomer"]["CustomerID"], "CUST-001")

        res2 = check_customer_duplicate(new_phone="0988776655", new_lat=10.8000, new_lng=106.8000, existing_customers=self.customers)
        self.assertFalse(res2["hasDuplicatePhone"])

    def test_duplicate_gps_proximity_detection(self):
        # 85m proximity alert check
        res1 = check_customer_duplicate(new_phone="0988000111", new_lat=10.7689, new_lng=106.6896, existing_customers=self.customers, proximity_threshold_m=100)
        self.assertTrue(res1["hasDuplicateGps"])
        self.assertLessEqual(res1["gpsDistance"], 100)

    def test_care_status_overdue_calculation(self):
        now_str = "2026-09-19T00:00:00Z"
        
        # 1. VIP Customer (cycle 3 days), last care was 8 days ago (2026-09-11) -> OVERDUE 5 days
        res_overdue = calculate_care_status("2026-09-11T00:00:00Z", cycle_days=3, reference_now_iso=now_str)
        self.assertEqual(res_overdue["status"], "OVERDUE")
        self.assertEqual(res_overdue["daysOverdue"], 5)

        # 2. Normal Customer (cycle 7 days), last care was 6 days ago (2026-09-13) -> DUE_SOON (1 day left)
        res_due_soon = calculate_care_status("2026-09-13T00:00:00Z", cycle_days=7, reference_now_iso=now_str, warning_days=1)
        self.assertEqual(res_due_soon["status"], "DUE_SOON")
        self.assertEqual(res_due_soon["daysRemaining"], 1)

        # 3. Customer visited yesterday (2026-09-18), cycle 7 days -> ON_TRACK (6 days left)
        res_on_track = calculate_care_status("2026-09-18T00:00:00Z", cycle_days=7, reference_now_iso=now_str)
        self.assertEqual(res_on_track["status"], "ON_TRACK")
        self.assertEqual(res_on_track["daysRemaining"], 6)

        # 4. Brand new customer with no care history -> NEVER_VISITED
        res_never = calculate_care_status("", cycle_days=14, reference_now_iso=now_str)
        self.assertEqual(res_never["status"], "NEVER_VISITED")

UNIT_RATIOS = {
    "Chai": 1,      # Base unit
    "Bình": 4,      # 1 Bình = 4 Chai
    "Xô": 18,       # 1 Xô = 18 Chai
    "Thùng": 24,    # 1 Thùng = 24 Chai
    "Phuy": 200     # 1 Phuy = 200 Chai
}

def convert_to_base_unit(qty, from_unit):
    ratio = UNIT_RATIOS.get(from_unit, 1)
    return round(float(qty) * ratio, 2)

def convert_to_carton(qty, from_unit):
    base_qty = convert_to_base_unit(qty, from_unit)
    return round(base_qty / UNIT_RATIOS["Thùng"], 2)

class TestProductUnitConversions(unittest.TestCase):
    def test_units_exist(self):
        expected_units = {"Thùng", "Xô", "Chai", "Bình", "Phuy"}
        self.assertTrue(expected_units.issubset(set(UNIT_RATIOS.keys())))

    def test_thung_to_chai_conversion(self):
        # 1 Thùng = 24 Chai
        self.assertEqual(convert_to_base_unit(1, "Thùng"), 24)
        self.assertEqual(convert_to_base_unit(5, "Thùng"), 120)

    def test_xo_to_chai_conversion(self):
        # 1 Xô = 18 Chai
        self.assertEqual(convert_to_base_unit(1, "Xô"), 18)
        self.assertEqual(convert_to_base_unit(2, "Xô"), 36)

    def test_binh_to_chai_conversion(self):
        # 1 Bình = 4 Chai
        self.assertEqual(convert_to_base_unit(1, "Bình"), 4)
        self.assertEqual(convert_to_base_unit(6, "Bình"), 24)

    def test_phuy_to_chai_conversion(self):
        # 1 Phuy = 200 Chai
        self.assertEqual(convert_to_base_unit(1, "Phuy"), 200)

    def test_carton_equivalent(self):
        # 24 Chai = 1 Thùng
        self.assertEqual(convert_to_carton(24, "Chai"), 1.0)
        # 48 Chai = 2 Thùng
        self.assertEqual(convert_to_carton(48, "Chai"), 2.0)
        # 4 Xô (4 * 18 = 72 Chai) = 3 Thùng
        self.assertEqual(convert_to_carton(4, "Xô"), 3.0)

# ====================================================
# RBAC PERMISSIONS & FILTERING LOGIC
# ====================================================
ROLES = {
    "ADMIN": "ADMIN",
    "MANAGER": "MANAGER",
    "SALES": "SALES"
}

PERMISSIONS = {
    "MANAGE_SYSTEM_SETTINGS": [ROLES["ADMIN"]],
    "RESET_DATABASE": [ROLES["ADMIN"]],
    "MANAGE_USERS": [ROLES["ADMIN"]],
    "VIEW_ALL_CUSTOMERS": [ROLES["ADMIN"], ROLES["MANAGER"]],
    "VIEW_ALL_REPORTS": [ROLES["ADMIN"], ROLES["MANAGER"]],
    "APPROVE_CUSTOMER": [ROLES["ADMIN"], ROLES["MANAGER"]],
    "FIELD_CHECKIN_CHECKOUT": [ROLES["SALES"], ROLES["ADMIN"]],
    "UPDATE_CARE_DETAILS": [ROLES["SALES"], ROLES["ADMIN"]],
    "REQUEST_CUSTOMER_UPDATE": [ROLES["SALES"], ROLES["MANAGER"], ROLES["ADMIN"]],
    "APPROVE_CUSTOMER_UPDATE": [ROLES["MANAGER"], ROLES["ADMIN"]],
    "MANAGE_PRODUCTS": [ROLES["MANAGER"], ROLES["ADMIN"]],
    "VIEW_PRODUCTS": [ROLES["SALES"], ROLES["MANAGER"], ROLES["ADMIN"]],
    "SIMULATE_GPS": [ROLES["ADMIN"]]
}

TAB_ACCESS = {
    "dashboard": [ROLES["ADMIN"], ROLES["MANAGER"]],
    "map": [ROLES["ADMIN"], ROLES["MANAGER"], ROLES["SALES"]],
    "timeline": [ROLES["ADMIN"], ROLES["MANAGER"], ROLES["SALES"]],
    "customers": [ROLES["ADMIN"], ROLES["MANAGER"], ROLES["SALES"]],
    "approvals": [ROLES["ADMIN"], ROLES["MANAGER"]],
    "products": [ROLES["ADMIN"], ROLES["MANAGER"]],
    "reports": [ROLES["ADMIN"], ROLES["MANAGER"]],
    "users": [ROLES["ADMIN"]],
    "settings": [ROLES["ADMIN"]]
}

def check_permission(role, permission_key):
    allowed = PERMISSIONS.get(permission_key, [])
    return role in allowed

def can_access_tab(role, tab_key):
    allowed = TAB_ACCESS.get(tab_key, [])
    return role in allowed

def filter_customers_by_role(customers, user):
    role = user.get("Role")
    user_id = user.get("UserID")
    if role in (ROLES["ADMIN"], ROLES["MANAGER"]):
        return customers
    return [c for c in customers if not c.get("AssignedSalesID") or c.get("AssignedSalesID") == user_id]

# ====================================================
# CUSTOMER APPROVAL WORKFLOW SIMULATOR
# ====================================================
class CustomerApprovalService:
    @staticmethod
    def create_update_request(customer, new_data, sales_user, reason=""):
        old_data = {
            "Phone": customer.get("Phone", ""),
            "Address": customer.get("Address", ""),
            "ContactPerson": customer.get("ContactPerson", ""),
            "CustomerType": customer.get("CustomerType", "NORMAL")
        }
        req_id = f"REQ-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        request_obj = {
            "RequestID": req_id,
            "CustomerID": customer["CustomerID"],
            "CustomerName": customer["CustomerName"],
            "SalesID": sales_user["UserID"],
            "SalesName": sales_user["Name"],
            "OldData": old_data,
            "NewData": new_data,
            "Reason": reason,
            "Status": "PENDING",
            "CreatedAt": datetime.utcnow().isoformat()
        }
        return request_obj

    @staticmethod
    def resolve_request(customer, request_obj, action, approver_user, reject_reason=""):
        if not check_permission(approver_user["Role"], "APPROVE_CUSTOMER_UPDATE"):
            raise PermissionError("User does not have permission to resolve customer update requests")

        if action == "APPROVE":
            # Apply changes to actual customer profile
            new_data = request_obj["NewData"]
            for k, v in new_data.items():
                if v is not None and str(v).strip():
                    customer[k] = v
            request_obj["Status"] = "APPROVED"
            request_obj["ApprovedBy"] = approver_user["UserID"]
            request_obj["ApprovedByName"] = approver_user["Name"]
            request_obj["ApprovedAt"] = datetime.utcnow().isoformat()
            return True, customer
        elif action == "REJECT":
            request_obj["Status"] = "REJECTED"
            request_obj["RejectReason"] = reject_reason
            request_obj["ApprovedBy"] = approver_user["UserID"]
            request_obj["ApprovedByName"] = approver_user["Name"]
            request_obj["ApprovedAt"] = datetime.utcnow().isoformat()
            return False, customer
        else:
            raise ValueError(f"Unknown action: {action}")

# ====================================================
# PRODUCT SERVICE SIMULATOR
# ====================================================
class ProductService:
    @staticmethod
    def save_product(product_list, product_data, actor_user):
        if not check_permission(actor_user["Role"], "MANAGE_PRODUCTS"):
            raise PermissionError("Only Manager and Admin can manage products")
        
        idx = next((i for i, p in enumerate(product_list) if p["ProductID"] == product_data["ProductID"]), -1)
        if idx >= 0:
            product_list[idx] = {**product_list[idx], **product_data}
        else:
            product_list.append(product_data)
        return product_list

    @staticmethod
    def toggle_status(product_list, product_id, actor_user):
        if not check_permission(actor_user["Role"], "MANAGE_PRODUCTS"):
            raise PermissionError("Only Manager and Admin can manage products")
        for p in product_list:
            if p["ProductID"] == product_id:
                p["Status"] = "INACTIVE" if p.get("Status") == "ACTIVE" else "ACTIVE"
                return p
        return None

class TestRoleBasedAccessControl(unittest.TestCase):
    def setUp(self):
        self.admin = {"UserID": "USR-000", "Name": "Admin", "Role": "ADMIN"}
        self.manager = {"UserID": "USR-001", "Name": "Manager", "Role": "MANAGER"}
        self.sales_a = {"UserID": "USR-002", "Name": "Sales A", "Role": "SALES"}
        self.sales_b = {"UserID": "USR-003", "Name": "Sales B", "Role": "SALES"}
        self.mock_customers = [
            {"CustomerID": "CUST-001", "CustomerName": "Minh Phat", "Phone": "0912345601", "Address": "123 Ly Thuong Kiet", "ContactPerson": "Anh Minh", "CustomerType": "NORMAL", "AssignedSalesID": "USR-002"},
            {"CustomerID": "CUST-002", "CustomerName": "VinaMart", "Phone": "0912345602", "Address": "456 Nguyen Trai", "ContactPerson": "Chi Hoa", "CustomerType": "VIP", "AssignedSalesID": "USR-002"},
            {"CustomerID": "CUST-003", "CustomerName": "Bach Hoa A Chau", "Phone": "0912345603", "Address": "789 Le Loi", "ContactPerson": "Chu Tam", "CustomerType": "NORMAL", "AssignedSalesID": "USR-003"},
            {"CustomerID": "CUST-004", "CustomerName": "Sao Mai", "Phone": "0912345604", "Address": "12 Tran Hung Dao", "ContactPerson": "Co Huong", "CustomerType": "NORMAL", "AssignedSalesID": ""},
        ]
        self.mock_products = [
            {"ProductID": "PROD-001", "ProductName": "Kingpetro Moto 4T 10W40", "CategoryID": "DMN_XE_MAY", "Unit": "Thùng", "Packaging": "24 chai x 0.8L", "BasePrice": 1450000, "Status": "ACTIVE"},
            {"ProductID": "PROD-002", "ProductName": "Kingpetro HD Truck 15W40", "CategoryID": "DMN_OTO", "Unit": "Xô", "Packaging": "Xô 18L", "BasePrice": 1650000, "Status": "ACTIVE"},
            {"ProductID": "PROD-003", "ProductName": "Kingpetro Industrial Hydraulic 68", "CategoryID": "DMN_CONG_NGHIEP", "Unit": "Phuy", "Packaging": "Phuy 200L", "BasePrice": 14500000, "Status": "INACTIVE"}
        ]

    def test_admin_has_full_permissions(self):
        self.assertTrue(check_permission(self.admin["Role"], "MANAGE_SYSTEM_SETTINGS"))
        self.assertTrue(check_permission(self.admin["Role"], "RESET_DATABASE"))
        self.assertTrue(check_permission(self.admin["Role"], "MANAGE_USERS"))
        self.assertTrue(check_permission(self.admin["Role"], "VIEW_ALL_CUSTOMERS"))
        self.assertTrue(check_permission(self.admin["Role"], "APPROVE_CUSTOMER_UPDATE"))
        self.assertTrue(check_permission(self.admin["Role"], "MANAGE_PRODUCTS"))
        self.assertTrue(can_access_tab(self.admin["Role"], "users"))
        self.assertTrue(can_access_tab(self.admin["Role"], "dashboard"))
        self.assertTrue(can_access_tab(self.admin["Role"], "approvals"))
        self.assertTrue(can_access_tab(self.admin["Role"], "products"))

    def test_manager_has_monitoring_and_approvals_and_products(self):
        self.assertTrue(check_permission(self.manager["Role"], "VIEW_ALL_CUSTOMERS"))
        self.assertTrue(check_permission(self.manager["Role"], "VIEW_ALL_REPORTS"))
        self.assertTrue(check_permission(self.manager["Role"], "APPROVE_CUSTOMER"))
        self.assertTrue(check_permission(self.manager["Role"], "APPROVE_CUSTOMER_UPDATE"))
        self.assertTrue(check_permission(self.manager["Role"], "MANAGE_PRODUCTS"))
        self.assertTrue(can_access_tab(self.manager["Role"], "approvals"))
        self.assertTrue(can_access_tab(self.manager["Role"], "products"))
        # Core settings restricted
        self.assertFalse(check_permission(self.manager["Role"], "MANAGE_SYSTEM_SETTINGS"))
        self.assertFalse(check_permission(self.manager["Role"], "RESET_DATABASE"))
        self.assertFalse(check_permission(self.manager["Role"], "MANAGE_USERS"))
        self.assertFalse(can_access_tab(self.manager["Role"], "users"))
        self.assertTrue(can_access_tab(self.manager["Role"], "dashboard"))

    def test_sales_permissions_isolated_to_field_work(self):
        self.assertTrue(check_permission(self.sales_a["Role"], "FIELD_CHECKIN_CHECKOUT"))
        self.assertTrue(check_permission(self.sales_a["Role"], "UPDATE_CARE_DETAILS"))
        self.assertTrue(check_permission(self.sales_a["Role"], "REQUEST_CUSTOMER_UPDATE"))
        self.assertTrue(check_permission(self.sales_a["Role"], "VIEW_PRODUCTS"))
        # Sales cannot approve requests, manage products, or simulate GPS
        self.assertFalse(check_permission(self.sales_a["Role"], "SIMULATE_GPS"))
        self.assertFalse(check_permission(self.manager["Role"], "SIMULATE_GPS"))
        self.assertTrue(check_permission(self.admin["Role"], "SIMULATE_GPS"))
        self.assertFalse(check_permission(self.sales_a["Role"], "APPROVE_CUSTOMER_UPDATE"))
        self.assertFalse(check_permission(self.sales_a["Role"], "MANAGE_PRODUCTS"))
        self.assertFalse(check_permission(self.sales_a["Role"], "VIEW_ALL_CUSTOMERS"))
        self.assertFalse(check_permission(self.sales_a["Role"], "MANAGE_SYSTEM_SETTINGS"))
        self.assertFalse(can_access_tab(self.sales_a["Role"], "approvals"))
        self.assertFalse(can_access_tab(self.sales_a["Role"], "products"))
        self.assertFalse(can_access_tab(self.sales_a["Role"], "users"))
        self.assertFalse(can_access_tab(self.sales_a["Role"], "reports"))

    def test_customer_update_approval_workflow_approve(self):
        target_cust = dict(self.mock_customers[0])
        new_data = {
            "Phone": "0988777999",
            "Address": "888 CMT8, P.5, Q.Tân Bình, TP.HCM",
            "ContactPerson": "Anh Minh Chủ Điểm",
            "CustomerType": "VIP"
        }
        
        # 1. Sales creates update request
        req = CustomerApprovalService.create_update_request(target_cust, new_data, self.sales_a, reason="Chủ tiệm đổi SĐT và lên VIP")
        self.assertEqual(req["Status"], "PENDING")
        self.assertEqual(req["OldData"]["Phone"], "0912345601")
        self.assertEqual(req["NewData"]["Phone"], "0988777999")

        # 2. Manager approves request -> Customer data is officially updated
        approved, updated_cust = CustomerApprovalService.resolve_request(target_cust, req, "APPROVE", self.manager)
        self.assertTrue(approved)
        self.assertEqual(req["Status"], "APPROVED")
        self.assertEqual(req["ApprovedBy"], self.manager["UserID"])
        self.assertEqual(updated_cust["Phone"], "0988777999")
        self.assertEqual(updated_cust["Address"], "888 CMT8, P.5, Q.Tân Bình, TP.HCM")
        self.assertEqual(updated_cust["CustomerType"], "VIP")

    def test_customer_update_approval_workflow_reject(self):
        target_cust = dict(self.mock_customers[1])
        original_phone = target_cust["Phone"]
        new_data = {"Phone": "0900000000"}

        req = CustomerApprovalService.create_update_request(target_cust, new_data, self.sales_a, reason="Sửa nhầm")
        self.assertEqual(req["Status"], "PENDING")

        # Manager rejects -> Customer profile remains untouched
        approved, cust_result = CustomerApprovalService.resolve_request(target_cust, req, "REJECT", self.manager, reject_reason="Thông tin sai thực tế")
        self.assertFalse(approved)
        self.assertEqual(req["Status"], "REJECTED")
        self.assertEqual(req["RejectReason"], "Thông tin sai thực tế")
        self.assertEqual(cust_result["Phone"], original_phone)

    def test_sales_cannot_resolve_approval_request(self):
        target_cust = dict(self.mock_customers[0])
        req = CustomerApprovalService.create_update_request(target_cust, {"Phone": "0999999999"}, self.sales_a)
        
        with self.assertRaises(PermissionError):
            CustomerApprovalService.resolve_request(target_cust, req, "APPROVE", self.sales_a)

    def test_product_management_by_manager(self):
        prods = list(self.mock_products)
        new_prod = {
            "ProductID": "PROD-999",
            "ProductName": "Kingpetro Coolant X",
            "CategoryID": "PHU_GIA",
            "Unit": "Can",
            "Packaging": "Can 4L",
            "BasePrice": 250000,
            "Status": "ACTIVE"
        }
        # Manager can add product
        prods = ProductService.save_product(prods, new_prod, self.manager)
        self.assertEqual(len(prods), 4)
        self.assertEqual(prods[-1]["ProductID"], "PROD-999")

        # Manager can toggle status
        toggled = ProductService.toggle_status(prods, "PROD-001", self.manager)
        self.assertEqual(toggled["Status"], "INACTIVE")

        # Sales attempting to add product raises PermissionError
        with self.assertRaises(PermissionError):
            ProductService.save_product(prods, new_prod, self.sales_a)

    def test_customer_filtering_for_sales_isolation(self):
        # Sales A should only see CUST-001, CUST-002, and unassigned CUST-004 (total 3)
        custs_a = filter_customers_by_role(self.mock_customers, self.sales_a)
        self.assertEqual(len(custs_a), 3)
        self.assertIn("CUST-001", [c["CustomerID"] for c in custs_a])
        self.assertIn("CUST-002", [c["CustomerID"] for c in custs_a])
        self.assertNotIn("CUST-003", [c["CustomerID"] for c in custs_a])

        # Sales B should only see CUST-003 and unassigned CUST-004 (total 2)
        custs_b = filter_customers_by_role(self.mock_customers, self.sales_b)
        self.assertEqual(len(custs_b), 2)
        self.assertIn("CUST-003", [c["CustomerID"] for c in custs_b])
        self.assertNotIn("CUST-001", [c["CustomerID"] for c in custs_b])

        # Admin and Manager see all 4
        self.assertEqual(len(filter_customers_by_role(self.mock_customers, self.admin)), 4)
        self.assertEqual(len(filter_customers_by_role(self.mock_customers, self.manager)), 4)

    def test_password_authentication_and_change_flow(self):
        users = [
            {"UserID": "USR-000", "Name": "Admin", "Email": "admin@company.com", "Role": "ADMIN", "Status": "ACTIVE"},
            {"UserID": "USR-002", "Name": "Sales A", "Email": "sales.a@company.com", "Role": "SALES", "Status": "ACTIVE"}
        ]
        
        # 1. Default password is '123456'
        login_res = AuthService.verify_login(users, "admin@company.com", "123456")
        self.assertTrue(login_res["success"])
        self.assertEqual(login_res["user"]["UserID"], "USR-000")

        # 2. Wrong password fails
        login_fail = AuthService.verify_login(users, "admin@company.com", "wrong_pass")
        self.assertFalse(login_fail["success"])
        self.assertIn("Mật khẩu không chính xác", login_fail["message"])

        # 3. Change password with incorrect old password fails
        change_fail = AuthService.change_password(users, "USR-000", "wrong_old", "new_secret_123")
        self.assertFalse(change_fail["success"])

        # 4. Change password with short password fails (< 6 chars)
        short_fail = AuthService.change_password(users, "USR-000", "123456", "123")
        self.assertFalse(short_fail["success"])

        # 5. Change password successfully
        change_ok = AuthService.change_password(users, "USR-000", "123456", "new_secret_123")
        self.assertTrue(change_ok["success"])

        # 6. Login with new password succeeds, old password fails
        self.assertFalse(AuthService.verify_login(users, "admin@company.com", "123456")["success"])
        self.assertTrue(AuthService.verify_login(users, "admin@company.com", "new_secret_123")["success"])

    def test_jwt_token_3_day_persistence_and_expiry(self):
        user = {"UserID": "USR-002", "Name": "Nguyễn Văn A", "Email": "sales.a@company.com", "Role": "SALES", "Status": "ACTIVE"}
        now_ts = 1795690000

        # 1. Generate 3-day token (259200s)
        tok_data = AuthService.generate_jwt(user, ttl_seconds=3 * 86400, now_ts=now_ts)
        self.assertIn("token", tok_data)
        self.assertEqual(tok_data["expiresAt"], (now_ts + 3 * 86400) * 1000)

        # 2. Verify valid within 3 days (e.g. after 2 days 23 hours)
        payload_ok = AuthService.verify_jwt(tok_data["token"], now_ts=now_ts + 2 * 86400 + 82800)
        self.assertIsNotNone(payload_ok)
        self.assertEqual(payload_ok["sub"], "USR-002")
        self.assertEqual(payload_ok["role"], "SALES")

        # 3. Expired exactly at or after 3 days (259200s)
        payload_expired = AuthService.verify_jwt(tok_data["token"], now_ts=now_ts + 3 * 86400)
        self.assertIsNone(payload_expired)

        # 4. Tampered signature must be rejected immediately
        parts = tok_data["token"].split(".")
        tampered_token = f"{parts[0]}.{parts[1]}.tampered_sig_xyz"
        self.assertIsNone(AuthService.verify_jwt(tampered_token, now_ts=now_ts + 60))

    def test_admin_user_crud_and_settings_protection(self):
        # 1. Only ADMIN can access 'settings' and 'users' tabs
        self.assertTrue(can_access_tab("ADMIN", "settings"))
        self.assertFalse(can_access_tab("MANAGER", "settings"))
        self.assertFalse(can_access_tab("SALES", "settings"))

        users = [
            {"UserID": "USR-000", "Name": "Admin Gốc", "Email": "admin@company.com", "Role": "ADMIN", "Status": "ACTIVE"},
            {"UserID": "USR-001", "Name": "Quản Lý Nguyễn", "Email": "manager@company.com", "Role": "MANAGER", "Status": "ACTIVE"},
            {"UserID": "USR-002", "Name": "Sales A", "Email": "sales.a@company.com", "Role": "SALES", "Status": "ACTIVE"}
        ]
        customers = [dict(c) for c in self.mock_customers]

        # 2. Admin edits Manager info (Name, Phone, Team)
        res_edit = UserManagementSimulator.save_user(users, {
            "UserID": "USR-001",
            "Name": "Trưởng Phòng Kinh Doanh Minh",
            "Email": "manager.minh@hiepphucduc.vn",
            "Role": "MANAGER",
            "Status": "ACTIVE"
        }, caller_role="ADMIN")
        self.assertTrue(res_edit["success"])
        self.assertEqual(users[1]["Name"], "Trưởng Phòng Kinh Doanh Minh")

        # 3. Manager cannot edit users
        with self.assertRaises(PermissionError):
            UserManagementSimulator.save_user(users, {"UserID": "USR-002", "Name": "Hack", "Email": "x@y.com"}, caller_role="MANAGER")

        # 4. Cannot demote or delete the sole active ADMIN
        demote_sole_admin = UserManagementSimulator.save_user(users, {
            "UserID": "USR-000",
            "Name": "Admin Gốc",
            "Email": "admin@company.com",
            "Role": "SALES",
            "Status": "ACTIVE"
        }, caller_role="ADMIN")
        self.assertFalse(demote_sole_admin["success"])
        self.assertFalse(UserManagementSimulator.delete_user(users, customers, "USR-000", caller_role="ADMIN")["success"])

        # 5. Deleting a Sales rep unassigns their customer routes cleanly
        del_sales = UserManagementSimulator.delete_user(users, customers, "USR-002", caller_role="ADMIN")
        self.assertTrue(del_sales["success"])
        self.assertEqual(len(users), 2)
        self.assertEqual(customers[0]["AssignedSalesID"], "")

    def test_geocoding_result_normalization_osm_and_photon(self):
        # 1. Normalize Nominatim OSM payload
        osm_raw = [{"display_name": "128 Nguyễn Trãi, Quận 1, TP.HCM, Việt Nam", "lat": "10.768512", "lon": "106.689234"}]
        osm_parsed = GeocodingNormalizer.parse_nominatim(osm_raw)
        self.assertEqual(len(osm_parsed), 1)
        self.assertAlmostEqual(osm_parsed[0]["lat"], 10.768512, places=5)
        self.assertAlmostEqual(osm_parsed[0]["lng"], 106.689234, places=5)
        self.assertEqual(osm_parsed[0]["source"], "OSM")

        # 2. Fallback Photon GeoJSON payload ([lon, lat] order!)
        photon_raw = {
            "features": [{
                "geometry": {"coordinates": [106.700911, 10.776889]},
                "properties": {"housenumber": "45", "street": "Lê Lợi", "district": "Quận 1", "city": "TP.HCM", "country": "Việt Nam"}
            }]
        }
        ph_parsed = GeocodingNormalizer.parse_photon(photon_raw)
        self.assertEqual(len(ph_parsed), 1)
        self.assertAlmostEqual(ph_parsed[0]["lat"], 10.776889, places=5)
        self.assertAlmostEqual(ph_parsed[0]["lng"], 106.700911, places=5)
        self.assertIn("Lê Lợi", ph_parsed[0]["displayName"])

    def test_checkout_care_visit_nested_pascal_and_flat_camel_mapping(self):
        # 1. Nested careData payload from SalesApp (PascalCase)
        nested_payload = {
            "visitId": "VIS-101",
            "salesId": "USR-002",
            "careData": {
                "SelectedProduct": "KingPetro 20W50",
                "DistributedQty": "12",
                "DistributedUnit": "Xô",
                "InventoryQty": "35",
                "InventoryUnit": "Xô",
                "ReorderDemand": "Thêm 5 xô tuần sau",
                "RecordedDebt": "18500000",
                "NewOrderQty": "8",
                "NewOrderUnit": "Thùng",
                "Result": "Có nhu cầu",
                "DiscussionDetails": "Đại lý bán tốt dòng xe tải"
            }
        }
        mapped = CarePayloadNormalizer.normalize(nested_payload, existing_stock=40, existing_unit="Thùng", existing_debt=28000000)
        self.assertEqual(mapped["distributed_qty"], 12)
        self.assertEqual(mapped["inventory_qty"], 35)
        self.assertEqual(mapped["inventory_unit"], "Xô")
        self.assertEqual(mapped["reorder_demand"], "Thêm 5 xô tuần sau")
        self.assertEqual(mapped["recorded_debt"], 18500000.0)
        self.assertEqual(mapped["new_order_qty"], 8)
        self.assertEqual(mapped["customer_stock"], 35)
        self.assertEqual(mapped["customer_debt"], 18500000.0)

        # 2. Blank optional stock/debt preserves existing customer stock & debt instead of wiping to 0
        blank_payload = {
            "visitId": "VIS-102",
            "careData": {"DistributedQty": "2", "InventoryQty": "", "RecordedDebt": "", "Result": "Đã chăm sóc tốt"}
        }
        mapped_blank = CarePayloadNormalizer.normalize(blank_payload, existing_stock=40, existing_unit="Thùng", existing_debt=28000000)
        self.assertEqual(mapped_blank["customer_stock"], 40)
        self.assertEqual(mapped_blank["customer_unit"], "Thùng")
        self.assertEqual(mapped_blank["customer_debt"], 28000000.0)

    def test_offline_queue_no_mock_fallback_and_fifo_flush(self):
        dispatcher = OfflineQueueSimulator()

        # 1. Admin action while offline does NOT silently mutate fake MockDatabase — returns explicit offline error
        admin_res = dispatcher.dispatch("saveUser", {"userData": {"Name": "Test"}}, is_online=False)
        self.assertFalse(admin_res["success"])
        self.assertTrue(admin_res["offline"])

        # 2. Field Sales actions while offline queue cleanly with temporary IDs
        s_res = dispatcher.dispatch("startWork", {"salesId": "USR-002", "lat": 10.77, "lng": 106.69}, is_online=False)
        self.assertTrue(s_res["success"])
        self.assertTrue(s_res["queuedOffline"])
        temp_sid = s_res["SessionID"]
        self.assertTrue(temp_sid.startswith("SES-OFFLINE-"))

        g_res = dispatcher.dispatch("recordGps", {"sessionId": temp_sid, "salesId": "USR-002", "lat": 10.78, "lng": 106.70}, is_online=False)
        self.assertTrue(g_res["queuedOffline"])
        self.assertEqual(len(dispatcher.queue), 2)

        # 3. Reconnecting flushes FIFO and remaps SES-OFFLINE-* -> real server SessionID
        flush_res = dispatcher.flush(is_online=True)
        self.assertEqual(flush_res["synced"], 2)
        self.assertEqual(flush_res["remaining"], 0)
        self.assertEqual(dispatcher.server_log[0]["action"], "startWork")
        real_sid = dispatcher.server_log[0]["assignedSessionId"]
        self.assertEqual(dispatcher.server_log[1]["sessionId"], real_sid)

    def test_gps_logs_90_day_retention_cleanup_preserves_visits(self):
        now_ts = 1795690000
        gps_logs = [
            {"id": 1, "ts": now_ts - 120 * 86400},  # 120 days old -> purge
            {"id": 2, "ts": now_ts - 91 * 86400},   # 91 days old  -> purge
            {"id": 3, "ts": now_ts - 89 * 86400},   # 89 days old  -> keep
            {"id": 4, "ts": now_ts - 300}           # 5 mins old   -> keep
        ]
        visits = [
            {"visit_id": "VIS-OLD", "ts": now_ts - 365 * 86400, "new_order_qty": 20}
        ]
        res = GpsRetentionCleaner.purge(gps_logs, visits, retention_days=90, now_ts=now_ts)
        self.assertEqual(res["deletedCount"], 2)
        self.assertEqual([g["id"] for g in gps_logs], [3, 4])
        # Visits history (1 year old) is 100% preserved forever
        self.assertEqual(len(visits), 1)

class CarePayloadNormalizer:
    @staticmethod
    def normalize(params, existing_stock=0, existing_unit="Thùng", existing_debt=0.0):
        care = params.get("careData") if isinstance(params.get("careData"), dict) else params

        def pick(p_key, c_key, default=""):
            if care.get(p_key, "") != "":
                return care[p_key]
            if care.get(c_key, "") != "":
                return care[c_key]
            if params.get(p_key, "") != "":
                return params[p_key]
            if params.get(c_key, "") != "":
                return params[c_key]
            return default

        raw_inv = pick("InventoryQty", "inventoryQty", "")
        raw_debt = pick("RecordedDebt", "recordedDebt", "")
        inv_qty = int(raw_inv) if raw_inv != "" else 0
        inv_unit = pick("InventoryUnit", "inventoryUnit", "Thùng") or "Thùng"
        rec_debt = float(raw_debt) if raw_debt != "" else 0.0
        return {
            "distributed_qty": int(pick("DistributedQty", "distributedQty", 0)),
            "inventory_qty": inv_qty,
            "inventory_unit": inv_unit,
            "reorder_demand": str(pick("ReorderDemand", "reorderDemand", "")),
            "recorded_debt": rec_debt,
            "new_order_qty": int(pick("NewOrderQty", "newOrderQty", 0)),
            "customer_stock": inv_qty if raw_inv != "" else existing_stock,
            "customer_unit": inv_unit if raw_inv != "" else existing_unit,
            "customer_debt": rec_debt if raw_debt != "" else existing_debt
        }

class OfflineQueueSimulator:
    QUEUEABLE = {"startWork", "endWork", "recordGps", "checkinVisit", "cancelVisit", "checkoutVisit", "checkoutCareVisit", "requestCustomerUpdate"}

    def __init__(self):
        self.queue = []
        self.server_log = []

    def dispatch(self, action, params, is_online=True):
        if not is_online:
            if action in self.QUEUEABLE:
                p = dict(params)
                res = {"success": True, "queuedOffline": True}
                if action == "startWork":
                    temp_sid = f"SES-OFFLINE-{len(self.queue) + 1}"
                    p["tempSessionId"] = temp_sid
                    res["SessionID"] = temp_sid
                self.queue.append({"action": action, "params": p})
                return res
            return {"success": False, "offline": True, "message": "Mất sóng mạng"}
        return {"success": True}

    def flush(self, is_online=True):
        if not is_online:
            return {"synced": 0, "remaining": len(self.queue)}
        sid_map = {}
        synced = 0
        while self.queue:
            entry = self.queue.pop(0)
            p = dict(entry["params"])
            if p.get("sessionId") in sid_map:
                p["sessionId"] = sid_map[p["sessionId"]]
            if entry["action"] == "startWork":
                real_sid = f"SES-REAL-{synced + 100}"
                if p.get("tempSessionId"):
                    sid_map[p["tempSessionId"]] = real_sid
                self.server_log.append({"action": "startWork", "assignedSessionId": real_sid})
            else:
                self.server_log.append({"action": entry["action"], "sessionId": p.get("sessionId")})
            synced += 1
        return {"synced": synced, "remaining": 0}

class GpsRetentionCleaner:
    @staticmethod
    def purge(gps_logs, visits, retention_days=90, now_ts=1795690000):
        cutoff = now_ts - max(7, int(retention_days)) * 86400
        before = len(gps_logs)
        gps_logs[:] = [g for g in gps_logs if g["ts"] >= cutoff]
        return {"deletedCount": before - len(gps_logs), "preservedVisits": len(visits)}

class GeocodingNormalizer:
    @staticmethod
    def parse_nominatim(items):
        out = []
        for it in (items or []):
            try:
                lat, lng = float(it["lat"]), float(it["lon"])
                out.append({"displayName": it.get("display_name", ""), "lat": lat, "lng": lng, "source": "OSM"})
            except (KeyError, ValueError, TypeError):
                pass
        return out

    @staticmethod
    def parse_photon(geojson):
        out = []
        for f in (geojson or {}).get("features", []):
            coords = (f.get("geometry") or {}).get("coordinates") or []
            if len(coords) >= 2:
                p = f.get("properties") or {}
                parts = [p.get(k) for k in ("name", "housenumber", "street", "district", "city", "country") if p.get(k)]
                out.append({
                    "displayName": ", ".join(parts),
                    "lat": float(coords[1]),
                    "lng": float(coords[0]),
                    "source": "Photon"
                })
        return out

class UserManagementSimulator:
    @staticmethod
    def save_user(users, u_data, caller_role="ADMIN"):
        if not check_permission(caller_role, "MANAGE_USERS"):
            raise PermissionError("Only ADMIN can manage users")
        uid = u_data.get("UserID", "")
        target = next((u for u in users if u["UserID"] == uid), None)
        if target:
            new_role = u_data.get("Role", target["Role"])
            new_status = u_data.get("Status", target["Status"])
            if target["Role"] == "ADMIN" and (new_role != "ADMIN" or new_status != "ACTIVE"):
                active_admins = sum(1 for u in users if u["Role"] == "ADMIN" and u["Status"] == "ACTIVE")
                if active_admins <= 1:
                    return {"success": False, "message": "Cannot demote or lock the last active ADMIN"}
            target.update({
                "Name": u_data["Name"],
                "Email": u_data["Email"],
                "Role": new_role,
                "Status": new_status
            })
            return {"success": True, "user": target}
        users.append(u_data)
        return {"success": True, "user": u_data}

    @staticmethod
    def delete_user(users, customers, target_uid, caller_role="ADMIN"):
        if not check_permission(caller_role, "MANAGE_USERS"):
            raise PermissionError("Only ADMIN can delete users")
        idx = next((i for i, u in enumerate(users) if u["UserID"] == target_uid), -1)
        if idx < 0:
            return {"success": False}
        if users[idx]["Role"] == "ADMIN" and sum(1 for u in users if u["Role"] == "ADMIN") <= 1:
            return {"success": False, "message": "Cannot delete sole ADMIN"}
        users.pop(idx)
        for c in customers:
            if c.get("AssignedSalesID") == target_uid:
                c["AssignedSalesID"] = ""
        return {"success": True}

import base64
import hashlib
import hmac
import json

class AuthService:
    SECRET = b"KingPetro_Test_JWT_Secret"

    @staticmethod
    def _b64url_encode(raw_bytes):
        return base64.urlsafe_b64encode(raw_bytes).rstrip(b"=").decode("ascii")

    @staticmethod
    def _b64url_decode(text):
        pad = "=" * ((4 - len(text) % 4) % 4)
        return base64.urlsafe_b64decode((text + pad).encode("ascii"))

    @classmethod
    def generate_jwt(cls, user, ttl_seconds=3 * 86400, now_ts=1795690000):
        exp_ts = now_ts + int(ttl_seconds)
        header_b64 = cls._b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
        payload_b64 = cls._b64url_encode(json.dumps({
            "sub": user["UserID"],
            "email": user["Email"],
            "role": user["Role"],
            "iat": now_ts,
            "exp": exp_ts
        }).encode("utf-8"))
        sig = hmac.new(cls.SECRET, f"{header_b64}.{payload_b64}".encode("ascii"), hashlib.sha256).digest()
        token = f"{header_b64}.{payload_b64}.{cls._b64url_encode(sig)}"
        return {"token": token, "expiresAt": exp_ts * 1000}

    @classmethod
    def verify_jwt(cls, token, now_ts=1795690000):
        if not token or token.count(".") != 2:
            return None
        header_b64, payload_b64, sig_b64 = token.split(".")
        expected_sig = cls._b64url_encode(
            hmac.new(cls.SECRET, f"{header_b64}.{payload_b64}".encode("ascii"), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(expected_sig, sig_b64):
            return None
        payload = json.loads(cls._b64url_decode(payload_b64).decode("utf-8"))
        if int(payload.get("exp", 0)) <= now_ts:
            return None
        return payload

    @staticmethod
    def verify_login(users, email, password):
        user = next((u for u in users if u["Email"].lower() == email.lower() and u.get("Status") == "ACTIVE"), None)
        if not user:
            return {"success": False, "message": "Email không tồn tại hoặc đã bị khóa"}
        stored = user.get("Password", "123456")
        if password != stored:
            return {"success": False, "message": "Mật khẩu không chính xác"}
        return {"success": True, "user": user}

    @staticmethod
    def change_password(users, user_id, old_pass, new_pass):
        user = next((u for u in users if u["UserID"] == user_id and u.get("Status") == "ACTIVE"), None)
        if not user:
            return {"success": False, "message": "Người dùng không tồn tại"}
        stored = user.get("Password", "123456")
        if old_pass != stored:
            return {"success": False, "message": "Mật khẩu cũ không chính xác"}
        if len(new_pass) < 6:
            return {"success": False, "message": "Mật khẩu mới phải có tối thiểu 6 ký tự"}
        user["Password"] = new_pass
        return {"success": True, "message": "Đổi mật khẩu thành công"}

if __name__ == "__main__":
    unittest.main()


