const express = require("express");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;

let serverProcess = null;

app.use(express.static("public"));
app.use(express.json());

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

app.post("/start", (req, res) => {
  if (serverProcess) return res.send("Server already running!");
  const ram = req.body.ram || "1G";
  serverProcess = spawn("java", [
    `-Xmx${ram}`,
    `-Xms${ram}`,
    "-jar",
    "server.jar",
    "nogui"
  ], {
    cwd: path.join(__dirname, "server"),
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

app.post("/stop", (req, res) => {
  if (!serverProcess) return res.send("Server not running!");
  serverProcess.stdin.write("stop\n");
  res.send("Stop signal sent.");
});

app.post("/command", (req, res) => {
  const cmd = req.body.command;
  if (serverProcess && cmd) {
    serverProcess.stdin.write(cmd + "\n");
    res.send("Command sent.");
  } else {
    res.send("Server not running or command missing.");
  }
});

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
