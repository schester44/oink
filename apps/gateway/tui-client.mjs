#!/usr/bin/env node
// Simple TUI client that connects to the gateway via WebSocket
// Usage: node tui-client.mjs [--port 3001] [--instance default]

import { io } from "socket.io-client";
import readline from "readline";
import { randomUUID } from "crypto";

// Parse args
const args = process.argv.slice(2);
let port = 4445;
let instance = "default";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) port = parseInt(args[i + 1]);
  if (args[i] === "--instance" && args[i + 1]) instance = args[i + 1];
}

// Colors
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

// State
let sessionId = null;
let isStreaming = false;
let streamBuffer = "";

console.log(
  `\n${c.cyan}${c.bold}╔════════════════════════════════════════╗${c.reset}`,
);
console.log(
  `${c.cyan}${c.bold}║       🐷 Oink TUI Chat Client          ║${c.reset}`,
);
console.log(
  `${c.cyan}${c.bold}╚════════════════════════════════════════╝${c.reset}\n`,
);
console.log(`${c.dim}Connecting to ws://localhost:${port}...${c.reset}\n`);

// Connect to gateway WebSocket
const socket = io(`http://localhost:${port}`, {
  query: { instance },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log(
    `${c.green}✓ Connected${c.reset} ${c.dim}(instance: ${instance})${c.reset}`,
  );
  console.log(`${c.dim}Commands: /quit, /new, /session, /help${c.reset}\n`);
  prompt();
});

socket.on("connect_error", (err) => {
  console.log(`${c.red}✗ Connection failed: ${err.message}${c.reset}`);
  console.log(
    `${c.dim}Make sure the gateway is running: cd apps/gateway && yarn dev${c.reset}\n`,
  );
  process.exit(1);
});

socket.on("disconnect", () => {
  console.log(`\n${c.yellow}Disconnected from server${c.reset}`);
});

// Handle session ID updates from server
socket.on("session-id", (data) => {
  if (data.sessionId) {
    sessionId = data.sessionId;
  }
});

// Handle streaming chunks
socket.on("chat-chunk", (chunk) => {
  if (chunk.type === "text-delta" && chunk.delta) {
    process.stdout.write(chunk.delta);
    streamBuffer += chunk.delta;
  }
  if (chunk.type === "start" && chunk.sessionId) {
    sessionId = chunk.sessionId;
  }
});

// Handle chat completion
socket.on("chat-complete", () => {
  if (streamBuffer) {
    console.log("\n");
  }
  isStreaming = false;
  streamBuffer = "";
  prompt();
});

// Handle direct messages (non-streamed)
socket.on("chat-message", (data) => {
  if (data.content) {
    console.log(`${c.blue}Assistant: ${c.reset}${data.content}\n`);
  }
  prompt();
});

// Handle notifications
socket.on("notification", (data) => {
  console.log(
    `\n${c.magenta}📢 [${data.title || "Notification"}]: ${data.message}${c.reset}\n`,
  );
  prompt();
});

// Handle errors
socket.on("error", (err) => {
  console.log(`${c.red}Error: ${err}${c.reset}\n`);
  prompt();
});

// Setup readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

function prompt() {
  if (!isStreaming) {
    process.stdout.write(`${c.green}You: ${c.reset}`);
  }
}

function sendMessage(text) {
  isStreaming = true;
  streamBuffer = "";

  const message = {
    id: randomUUID(),
    role: "user",
    content: text,
  };

  process.stdout.write(`\n${c.blue}Assistant: ${c.reset}`);

  socket.emit("chat", {
    instanceId: instance,
    sessionId: sessionId,
    message,
  });
}

rl.on("line", (input) => {
  const trimmed = input.trim();

  // Handle commands
  if (trimmed.startsWith("/")) {
    const cmd = trimmed.toLowerCase();
    switch (cmd) {
      case "/quit":
      case "/exit":
        console.log(`\n${c.dim}Goodbye! 👋${c.reset}\n`);
        socket.disconnect();
        process.exit(0);
      case "/new":
        sessionId = null;
        console.log(`${c.yellow}Started new session${c.reset}\n`);
        prompt();
        break;
      case "/session":
        console.log(`${c.yellow}Session: ${sessionId || "(new)"}${c.reset}\n`);
        prompt();
        break;
      case "/help":
        console.log(`\n${c.dim}Commands:${c.reset}`);
        console.log(`${c.dim}  /quit    - Exit the TUI${c.reset}`);
        console.log(`${c.dim}  /new     - Start a new session${c.reset}`);
        console.log(`${c.dim}  /session - Show current session ID${c.reset}`);
        console.log(`${c.dim}  /help    - Show this help${c.reset}\n`);
        prompt();
        break;
      default:
        console.log(`${c.dim}Unknown command: ${trimmed}${c.reset}\n`);
        prompt();
    }
    return;
  }

  if (!trimmed) {
    prompt();
    return;
  }

  sendMessage(trimmed);
});

rl.on("close", () => {
  console.log(`\n${c.dim}Bye!${c.reset}`);
  socket.disconnect();
  process.exit(0);
});

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log(`\n${c.dim}Goodbye! 👋${c.reset}\n`);
  socket.disconnect();
  process.exit(0);
});
