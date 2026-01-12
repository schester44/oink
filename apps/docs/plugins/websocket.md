
## Overview

The WebSocket plugin provides real-time bidirectional communication using [Socket.IO](https://socket.io/). It's the primary connection method for the web frontend.

## Configuration

```json
{
  "plugins": {
    "websocket": {
      "enabled": true
    }
  }
}
```

The WebSocket server runs on `GATEWAY_WS_PORT` (default: 4445).

## Client Connection

### JavaScript/TypeScript

```typescript
import { io } from "socket.io-client";

const socket = io("http://localhost:4445", {
  query: { instance: "default" },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("Connected!");
});
```

### Connection Options

| Option | Description |
|--------|-------------|
| `instance` | Target instance (query param) |
| `transports` | Use `["websocket"]` for best performance |

## Client Events

### Sending Messages

```typescript
// Send a chat message
socket.emit("chat", {
  instanceId: "default",      // Optional, uses connection default
  sessionId: "session-123",   // Optional, creates new if omitted
  message: {
    id: "msg-uuid",
    role: "user",
    content: "Hello, Pinky!"
  }
});
```

### Receiving Responses

```typescript
// Session ID assignment (from server)
socket.on("session-id", (data) => {
  console.log("Session:", data.sessionId);
});

// Streaming chunks (AI SDK compatible)
socket.on("chat-chunk", (chunk) => {
  switch (chunk.type) {
    case "start":
      // Response starting
      break;
    case "text-delta":
      // Append text
      process.stdout.write(chunk.delta);
      break;
    case "tool-input-available":
      // Tool being called
      console.log(`Tool: ${chunk.toolName}`, chunk.input);
      break;
    case "finish":
      // Response complete
      break;
  }
});

// Response complete signal
socket.on("chat-complete", (data) => {
  console.log("Complete:", data.sessionId);
});

// Non-streamed messages (from tasks)
socket.on("chat-message", (data) => {
  console.log(`${data.role}: ${data.content}`);
});
```

### Notifications

```typescript
// Scheduled task notifications
socket.on("notification", (data) => {
  console.log(`[${data.title}] ${data.message}`);
});
```

### Instance Switching

```typescript
// Switch to a different instance
socket.emit("switch-instance", "work");

socket.on("instance-switched", (data) => {
  console.log("Now using instance:", data.instance);
});
```

### Health Check

```typescript
socket.emit("ping");

socket.on("pong", (data) => {
  console.log("Server time:", data.timestamp);
});
```

## Chunk Types (AI SDK Compatible)

The WebSocket plugin emits chunks compatible with the AI SDK's `UIMessageChunk`:

| Type | Fields | Description |
|------|--------|-------------|
| `start` | `messageId`, `sessionId` | Response starting |
| `text-start` | `id` | Text block starting |
| `text-delta` | `id`, `delta` | Text content chunk |
| `text-end` | `id` | Text block complete |
| `start-step` | - | New turn starting |
| `finish-step` | - | Turn complete |
| `tool-input-start` | `toolCallId`, `toolName` | Tool invocation starting |
| `tool-input-available` | `toolCallId`, `toolName`, `input` | Tool input ready |
| `tool-output-available` | `toolCallId`, `output` | Tool result |
| `finish` | `finishReason` | Response complete |
| `error` | `errorText` | Error occurred |

## Example: Complete Client

```typescript
import { io } from "socket.io-client";
import { randomUUID } from "crypto";

const socket = io("http://localhost:4445", {
  query: { instance: "default" },
  transports: ["websocket"],
});

let sessionId: string | null = null;

socket.on("connect", () => {
  console.log("Connected to Pinky");
});

socket.on("session-id", (data) => {
  sessionId = data.sessionId;
});

socket.on("chat-chunk", (chunk) => {
  if (chunk.type === "text-delta") {
    process.stdout.write(chunk.delta);
  }
});

socket.on("chat-complete", () => {
  console.log("\n---");
});

// Send a message
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

// Example usage
sendMessage("What's the weather like?");
```

## TUI Client

A ready-to-use TUI client is available:

```bash
node apps/gateway/tui-client.mjs
```

See [TUI Client](/clients/tui) for details.
