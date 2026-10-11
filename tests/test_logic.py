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

if __name__ == "__main__":
    unittest.main()
