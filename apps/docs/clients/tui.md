
## Overview

The TUI client provides a simple terminal interface for chatting with Pinky. It connects via WebSocket and streams responses in real-time.

## Quick Start

```bash
# Make sure the gateway is running
cd apps/gateway && yarn dev

# In another terminal
node apps/gateway/tui-client.mjs
```

## Usage

See the [TUI Plugin documentation](/plugins/tui) for detailed usage instructions.

## Building Your Own

The TUI client is a simple Node.js script. You can use it as a starting point for custom CLI tools:

```typescript
import { io } from "socket.io-client";
import readline from "readline";
import { randomUUID } from "crypto";

const socket = io("http://localhost:4445", {
  query: { instance: "default" },
  transports: ["websocket"],
});

let sessionId: string | null = null;

socket.on("session-id", (data) => {
  sessionId = data.sessionId;
});

socket.on("chat-chunk", (chunk) => {
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.delta);
  }
});

socket.on("chat-complete", () => {
  console.log("\n");
});

function sendMessage(text: string) {
  socket.emit("chat", {
    sessionId,
    message: {
      id: randomUUID(),
      role: "user",
      content: text,
    },
  });
}

// Example: send a message
sendMessage("Hello, Pinky!");
```

## Features

- Colorized output
- Session persistence
- Streaming responses
- Simple commands (`/quit`, `/new`, `/session`, `/help`)

## Limitations

- No rich text rendering (markdown shows as-is)
- No image support
- No voice/audio support
- Single-line input only
