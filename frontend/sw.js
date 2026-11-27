/**
 * SERVICE WORKER - KINGPETRO SALES FIELD PWA
 * Chiến lược Network-First cho App Shell:
 * - Khi có mạng: luôn tải bản HTML/CSS/JS mới nhất từ Server để cập nhật tính năng tức thì.
 * - Khi mất sóng 4G hoàn toàn: mở giao diện từ bộ nhớ đệm để nhân viên Sales vẫn thao tác Offline Queue được.
 * - Tuyệt đối KHÔNG can thiệp các request POST hoặc /api/ (để ApiService Offline Queue xử lý chuẩn xác).
 */

const CACHE_NAME = "kingpetro-saler-shell-v20261127c";
const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./css/style.css?v=20261127c",
  "./js/icons.js?v=20261127c",
  "./js/geo.js?v=20261127c",
  "./js/products.js?v=20261127c",
  "./js/permissions.js?v=20261127c",
  "./js/api.js?v=20261127c",
  "./js/sales_app.js?v=20261127c",
  "./js/manager_app.js?v=20261127c",
  "./js/app.js?v=20261127c"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/api/")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});
