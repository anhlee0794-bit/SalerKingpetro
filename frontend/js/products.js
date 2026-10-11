/**
 * PRODUCT & MULTI-UNIT MANAGEMENT SERVICE
 * Manages product catalog, measurement units (Thùng, Xô, Chai, Bình, Phuy),
 * and automated unit conversion factors for sales reporting & stock auditing.
 */

const ProductService = {
  UNITS: [
    { id: "THUNG", name: "Thùng", baseRatio: 24, baseUnit: "Chai", description: "1 Thùng = 24 Chai (hoặc Lon)" },
    { id: "XO",    name: "Xô",    baseRatio: 18, baseUnit: "Chai", description: "1 Xô tiêu chuẩn = 18 Lít (~18 Chai)" },
    { id: "CHAI",  name: "Chai",  baseRatio: 1,  baseUnit: "Chai", description: "Đơn vị cơ sở (Chai / Lon / Hộp)" },
    { id: "BINH",  name: "Bình",  baseRatio: 4,  baseUnit: "Chai", description: "1 Bình = 4 Chai tiêu chuẩn" },
    { id: "PHUY",  name: "Phuy",  baseRatio: 200, baseUnit: "Chai", description: "1 Phuy = 200 Chai (~8.33 Thùng)" }
  ],

  CATALOG: [
    { id: "PRD-001", name: "Sơn Ngoại Thất Cao Cấp SuperShield", category: "Sơn Phủ", defaultUnit: "Thùng", ratio: 24, baseUnit: "Chai" },
    { id: "PRD-002", name: "Dung Dịch Phủ Bóng Nano Pro", category: "Phụ Gia", defaultUnit: "Chai", ratio: 1, baseUnit: "Chai" },
    { id: "PRD-003", name: "Sơn Lót Kháng Kiềm Chống Kiềm Hóa", category: "Sơn Lót", defaultUnit: "Xô", ratio: 18, baseUnit: "Chai" },
    { id: "PRD-004", name: "Keo Chống Thấm Polyurethane Công Nghiệp", category: "Chống Thấm", defaultUnit: "Phuy", ratio: 200, baseUnit: "Chai" },
    { id: "PRD-005", name: "Dung Môi Tẩy Rửa & Pha Sơn Eco", category: "Dung Môi", defaultUnit: "Bình", ratio: 4, baseUnit: "Chai" }
  ],

  getUnitList() {
    return this.UNITS.map(u => u.name);
  },

  getUnitByName(name) {
    return this.UNITS.find(u => u.name.toLowerCase() === (name || "").toLowerCase()) || this.UNITS[0];
  },

  getCatalog() {
    if (typeof MockDatabase !== "undefined") {
      try {
        const db = MockDatabase.getDB();
        if (db && db.PRODUCTS && db.PRODUCTS.length > 0) {
          return db.PRODUCTS;
        }
      } catch (e) {}
    }
    return this.CATALOG;
  },

  getProductById(id) {
    return this.getCatalog().find(p => p.id === id);
  },

  /**
   * Convert a quantity from one unit to base units (Chai) and other units
   * @param {number} qty 
   * @param {string} fromUnit 
   * @param {number} customRatio 
   */
  calculateConversion(qty, fromUnit, customRatio = null) {
    const num = Number(qty) || 0;
    if (num <= 0) return null;

    const unitObj = this.getUnitByName(fromUnit);
    const ratio = customRatio || unitObj.baseRatio || 1;
    const baseChai = num * ratio;

    let thungEquiv = (baseChai / 24).toFixed(1);
    if (thungEquiv.endsWith(".0")) thungEquiv = thungEquiv.substring(0, thungEquiv.length - 2);

    let hint = "";
    if (unitObj.name === "Thùng") {
      hint = `≈ ${baseChai} Chai (1 Thùng = 24 Chai)`;
    } else if (unitObj.name === "Phuy") {
      hint = `≈ ${baseChai} Chai (~${thungEquiv} Thùng)`;
    } else if (unitObj.name === "Xô") {
      hint = `≈ ${baseChai} Chai / Lít`;
    } else if (unitObj.name === "Bình") {
      hint = `≈ ${baseChai} Chai (1 Bình = 4 Chai)`;
    } else {
      hint = `≈ ${thungEquiv} Thùng`;
    }

    return {
      qty: num,
      fromUnit: unitObj.name,
      baseQty: baseChai,
      baseUnit: "Chai",
      thungEquiv: Number(thungEquiv),
      hint: hint
    };
  },

  renderUnitOptions(selectedUnit = "Thùng") {
    return this.UNITS.map(u => {
      const isSel = (u.name === selectedUnit) ? "selected" : "";
      return `<option value="${u.name}" ${isSel}>${u.name}</option>`;
    }).join("");
  },

  renderProductOptions(selectedId = "") {
    let html = `<option value="">-- Chọn mặt hàng từ danh mục --</option>`;
    const activeList = this.getCatalog().filter(p => p.status !== "INACTIVE");
    html += activeList.map(p => {
      const isSel = (p.id === selectedId || p.name === selectedId) ? "selected" : "";
      return `<option value="${p.name}" data-unit="${p.defaultUnit}" data-ratio="${p.ratio}" ${isSel}>${p.name} [ĐVT: ${p.defaultUnit}]</option>`;
    }).join("");
    html += `<option value="Sản phẩm khác">-- Sản phẩm khác / Nhập ngoài --</option>`;
    return html;
  }
};
