import { io } from "socket.io-client";
import * as readline from "readline";

const socket = io("http://localhost:4445", {
  query: { instance: "default" },
});

let currentResponse = "";
let sessionId = null;

socket.on("connect", () => {
  console.log("✅ Connected to gateway!");
  console.log(
    "📝 Type a message to chat, or wait for scheduled task notifications...",
  );
  console.log("   Commands: /quit, /new (new session)\n");
  startPrompt();
});

// Scheduled task notifications
socket.on("scheduled-task", (data) => {
  console.log("\n🔔 SCHEDULED TASK NOTIFICATION:");
  console.log(JSON.stringify(data, null, 2));
  console.log("");
});

// Chat streaming events - handles UIMessageChunk format from AI SDK
socket.on("chat-chunk", (chunk) => {
  // Text streaming (AI SDK uses text-delta with delta property)
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.delta);
    currentResponse += chunk.delta;
  }
  // Tool calls (AI SDK uses tool-input-available)
  else if (chunk.type === "tool-input-available") {
    console.log(`\n🔧 Tool call: ${chunk.toolName}`);
  }
  // Tool results
  else if (chunk.type === "tool-result") {
    console.log(`   Tool result received`);
  }
  // Errors
  else if (chunk.type === "error") {
    console.error(`\n❌ Error: ${chunk.error || chunk.errorText}`);
  }
  // Step markers
  else if (chunk.type === "start-step") {
    // New reasoning step started
  } else if (chunk.type === "finish-step") {
    // Reasoning step finished
  }
  // Message lifecycle
  else if (chunk.type === "start") {
    // Message started
  } else if (chunk.type === "finish") {
    // Message finished (handled by chat-complete event)
  }
});

socket.on("chat-complete", (data) => {
  console.log("\n");
  if (data.finishReason) {
    console.log(`✅ Finished: ${data.finishReason}`);
  }
  currentResponse = "";
  startPrompt();
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected");
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err.message);
});

// Interactive prompt
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function startPrompt() {
  rl.question("> ", (input) => {
    const trimmed = input.trim();

    if (trimmed === "/quit" || trimmed === "/exit") {
      socket.disconnect();
      rl.close();
      process.exit(0);
    }

    if (trimmed === "/new") {
      sessionId = null;
      console.log("🆕 Starting new session\n");
      startPrompt();
      return;
    }

    if (!trimmed) {
      startPrompt();
      return;
    }

    // Send chat message
    console.log("\n🤖 ");
    socket.emit("chat", {
      sessionId,
      message: {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      },
    });
  });
}

// Keep running
process.on("SIGINT", () => {
  socket.disconnect();
  rl.close();
  process.exit(0);
});
