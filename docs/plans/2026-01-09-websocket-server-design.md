# WebSocket Server with Socket.io

## Overview

Add a WebSocket channel for server-to-client push messages, separate from the existing HTTP-based chat flow. Enables server-initiated messages like notifications, chat injections, and data updates.

## Server Setup

In `server.ts`, attach Socket.io to the existing Express HTTP server:

```ts
import { createServer } from "http";
import { Server } from "socket.io";

const server = createServer(app);
const io = new Server(server, {
  path: "/ws",
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("join", (room: string) => {
    socket.join(room);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

## Client Setup

In `chat/index.tsx`, connect via Socket.io client:

```tsx
import { io, Socket } from "socket.io-client";

const socket = io({
  path: "/ws",
  transports: ["websocket"],
});

socket.on("connect", () => {
  socket.emit("join", sessionId);
});

socket.on("pong", () => {
  console.log("Received pong");
});
```

## Dependencies

- `socket.io` - Server
- `socket.io-client` - Client

## Files Modified

- `apps/web/server.ts`
- `apps/web/src/routes/_authed/chat/index.tsx`

## Future Extensibility

- Export `io` instance for use in API routes
- Add typed events with shared types
- Lift socket to React context if needed across components
