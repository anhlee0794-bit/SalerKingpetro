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

  liveCatalog: null,

  syncCatalog(list) {
    if (Array.isArray(list) && list.length > 0) {
      this.liveCatalog = list.map(p => ({
        id: p.id || p.ProductID,
        name: p.name || p.ProductName,
        category: p.category || p.CategoryName || p.CategoryID,
        defaultUnit: p.defaultUnit || p.Unit || "Thùng",
        ratio: Number(p.ratio) || 24,
        baseUnit: p.baseUnit || "Chai",
        price: Number(p.price !== undefined ? p.price : (p.BasePrice || 0)),
        status: p.status || p.Status || "ACTIVE",
        spec: p.spec || p.Packaging || ""
      }));
    }
  },

  getCatalog() {
    if (Array.isArray(this.liveCatalog) && this.liveCatalog.length > 0) {
      return this.liveCatalog;
    }
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
      const priceVal = Number(p.price !== undefined ? p.price : (p.BasePrice || 0));
      const priceText = priceVal > 0 ? ` - ${priceVal.toLocaleString("vi-VN")}đ/${p.defaultUnit || "Thùng"}` : "";
      return `<option value="${p.name}" data-unit="${p.defaultUnit || "Thùng"}" data-ratio="${p.ratio || 24}" data-price="${priceVal}" ${isSel}>${p.name} [${p.defaultUnit || "Thùng"}${priceText}]</option>`;
    }).join("");
    html += `<option value="Sản phẩm khác" data-unit="Thùng" data-ratio="24" data-price="0">-- Sản phẩm khác / Nhập ngoài --</option>`;
    return html;
  },

  estimateUnitPrice(productName, chosenUnit = "Thùng") {
    if (!productName) return 0;
    const prod = this.getCatalog().find(p => p.name === productName || p.id === productName);
    if (!prod) return 0;
    const basePrice = Number(prod.price !== undefined ? prod.price : (prod.BasePrice || 0));
    if (basePrice <= 0) return 0;
    const defUnitName = prod.defaultUnit || prod.Unit || "Thùng";
    if (defUnitName.toLowerCase() === (chosenUnit || "").toLowerCase()) {
      return basePrice;
    }
    const defUnitObj = this.getUnitByName(defUnitName);
    const chosenUnitObj = this.getUnitByName(chosenUnit);
    const defRatio = Number(prod.ratio) || defUnitObj.baseRatio || 1;
    const pricePerBase = basePrice / Math.max(1, defRatio);
    return Math.round(pricePerBase * (chosenUnitObj.baseRatio || 1));
  }
};
