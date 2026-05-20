const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8080;
const clients = new Set();

let latestSensor = {
    type: "phoneOrientation",
    yaw: 0,
    yawDeg: 0,
    alpha: 0,
    beta: 0,
    gamma: 0,
    absolute: false,
    timestamp: 0
};

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader(
        "Permissions-Policy",
        "accelerometer=*, gyroscope=*, magnetometer=*"
    );

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    // Phone writes sensor data here
    if (pathname === "/sensor" && req.method === "POST") {
        let body = "";

        req.on("data", chunk => {
            body += chunk.toString();
        });

        req.on("end", () => {
            try {
                const data = JSON.parse(body);

                if (data.type === "phoneOrientation") {
                    latestSensor = {
                        type: "phoneOrientation",
                        yaw: Number(data.yaw) || 0,
                        yawDeg: Number(data.yawDeg) || 0,
                        alpha: Number(data.alpha) || 0,
                        beta: Number(data.beta) || 0,
                        gamma: Number(data.gamma) || 0,
                        absolute: Boolean(data.absolute),
                        timestamp: Date.now()
                    };

                    console.log(
                        `Sensor updated: yawDeg=${latestSensor.yawDeg.toFixed(2)}, alpha=${latestSensor.alpha.toFixed(2)}`
                    );
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true }));
            } catch (err) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        });

        return;
    }

    // WebGL page reads sensor data here
    if (pathname === "/sensor" && req.method === "GET") {
        // console.log("Sensor read by WebGL:", latestSensor.yawDeg.toFixed(2));

        res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
        });
        res.end(JSON.stringify(latestSensor));
        return;
    }

    // Static files
    let filePath = "." + pathname;
    if (filePath === "./") filePath = "./index.html";

    const ext = path.extname(filePath).toLowerCase();
    const types = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".gpu": "application/javascript",
        ".jpg": "image/jpeg",
        ".png": "image/png"
    };

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }

        res.writeHead(200, {
            "Content-Type": types[ext] || "text/plain",
            "Cache-Control": "no-store"
        });
        res.end(content);
    });
});

// Старий WebSocket залишаємо тільки як додатковий debug / fallback
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
    clients.add(ws);

    console.log("WS client connected:", req.url);
    console.log("WS clients total:", clients.size);

    ws.on("message", (message) => {
        const text = message.toString();

        try {
            const data = JSON.parse(text);

            if (data.type === "phoneOrientation") {
                latestSensor = {
                    type: "phoneOrientation",
                    yaw: Number(data.yaw) || 0,
                    yawDeg: Number(data.yawDeg) || 0,
                    alpha: Number(data.alpha) || 0,
                    beta: Number(data.beta) || 0,
                    gamma: Number(data.gamma) || 0,
                    absolute: Boolean(data.absolute),
                    timestamp: Date.now()
                };
            }
        } catch (err) {
            console.warn("Invalid WS message:", text);
        }
    });

    ws.on("close", () => {
        clients.delete(ws);
        console.log("WS client disconnected");
        console.log("WS clients total:", clients.size);
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open via localtunnel for phone sensors.`);
});