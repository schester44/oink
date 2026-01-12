
## APIs

Pinky exposes two primary APIs:


  - [tRPC API](/api-reference/trpc) - 
    Type-safe API for management operations
  
  - [WebSocket API](/api-reference/websocket) - 
    Real-time chat and streaming
  


## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 4445 | WebSocket | Real-time chat (Socket.IO) |
| 4446 | HTTP | tRPC API |

## Authentication

Currently, both APIs are unauthenticated (designed for local use). For production deployments, add authentication at the network layer or via a reverse proxy.

## Quick Reference

### Send a Chat Message

```typescript
// WebSocket
socket.emit("chat", {
  instanceId: "default",
  sessionId: "session-123",  // optional
  message: {
    id: "msg-uuid",
    role: "user",
    content: "Hello!"
  }
});
```

### List Sessions

```typescript
// tRPC
const sessions = await trpc.sessions.list.query({ 
  instanceId: "default" 
});
```

### Check Health

```typescript
// tRPC
const health = await trpc.health.check.query();
// { status: "ok", version: "0.1.0", uptime: 3600, timestamp: "..." }
```
