const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, "frontend");

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  let filePath = path.join(PUBLIC_DIR, req.url === "/" ? "index.html" : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "text/plain";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("500 Server Error: " + err.code);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType + "; charset=utf-8" });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
