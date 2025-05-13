const express = require("express");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
const port = 3000;

let serverProcess = null;
const serverDir = path.join(__dirname, "server");
const serverJar = path.join(serverDir, "server.jar");

// Ensure the server directory exists
if (!fs.existsSync(serverDir)) {
  fs.mkdirSync(serverDir);
}

// Function to download the latest Minecraft server jar
async function downloadServerJar() {
  try {
    // Get version manifest
    const manifestUrl = "https://piston-meta.mojang.com/mc/game/version_manifest.json";
    const manifestRes = await axios.get(manifestUrl);
    const latestVersion = manifestRes.data.latest.release;

    // Get download URL for latest version
    const versionDataUrl = manifestRes.data.versions.find(v => v.id === latestVersion).url;
    const versionDataRes = await axios.get(versionDataUrl);
    const serverJarUrl = versionDataRes.data.downloads.server.url;

    console.log(`Downloading Minecraft server ${latestVersion}...`);

    const response = await axios({
      url: serverJarUrl,
      method: "GET",
      responseType: "stream"
    });

    const writer = fs.createWriteStream(serverJar);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  } catch (error) {
    console.error("Failed to download the server jar:", error.message);
    throw error;
  }
}

// Middleware
app.use(express.static("public"));
app.use(express.json());

// WebSocket setup
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  ws.send("Connected to Minecraft Web Panel");
});

function broadcast(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message.toString());
    }
  });
}

// Start server
app.post("/start", async (req, res) => {
  if (serverProcess) return res.send("Server already running!");

  if (!fs.existsSync(serverJar)) {
    try {
      await downloadServerJar();
      console.log("Minecraft server jar downloaded.");
    } catch (error) {
      return res.status(500).send("Failed to download the server jar.");
    }
  }

  const ram = req.body.ram || "1G";
  serverProcess = spawn("java", [
    `-Xmx${ram}`,
    `-Xms${ram}`,
    "-jar",
    "server.jar",
    "nogui"
  ], {
    cwd: serverDir,
    shell: true
  });

  serverProcess.stdout.on("data", data => {
    broadcast(data.toString());
  });

  serverProcess.stderr.on("data", data => {
    broadcast(data.toString());
  });

  serverProcess.on("close", code => {
    broadcast("Server stopped.");
    serverProcess = null;
  });

  res.send("Server started!");
});

// Stop server
app.post("/stop", (req, res) => {
  if (!serverProcess) return res.send("Server not running!");
  serverProcess.stdin.write("stop\n");
  res.send("Stop signal sent.");
});

// Send command
app.post("/command", (req, res) => {
  const cmd = req.body.command;
  if (serverProcess && cmd) {
    serverProcess.stdin.write(cmd + "\n");
    res.send("Command sent.");
  } else {
    res.send("Server not running or command missing.");
  }
});

// Start Express server
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
