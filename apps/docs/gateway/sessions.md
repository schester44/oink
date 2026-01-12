
## Overview

Sessions are the core of Pinky's memory. Each session represents a conversation with:

- Complete message history
- Token usage tracking
- Tool execution logs
- Context for the AI

## Session Types

### Web Sessions

Web clients can:

- **Create new sessions**: No `sessionId` in request
- **Continue existing sessions**: Provide `sessionId` to resume

```typescript
// New session
{ instanceId: "default", message: {...} }

// Continue session
{ instanceId: "default", sessionId: "abc123", message: {...} }
```

### External Channel Sessions

External channels (Telegram, Discord) get **isolated session directories**:

```
~/.pinky/instances/default/sessions/
├── session-2024-01-15-abc123.jsonl    # Web session
├── session-2024-01-15-def456.jsonl    # Web session
└── telegram_123456789/                 # Telegram user's sessions
    └── session-2024-01-15-xyz789.jsonl
```

This isolation ensures:
- Each Telegram user has their own context
- Sessions don't leak between users
- Easy cleanup per user

## Session Storage

Sessions are stored as JSONL (JSON Lines) files:

```jsonl
{"type":"session_start","timestamp":"2024-01-15T10:00:00Z","cwd":"/path/to/workspace"}
{"type":"message","role":"user","parts":[{"type":"text","text":"Hello!"}]}
{"type":"message","role":"assistant","parts":[{"type":"text","text":"Hi there!"}],"usage":{"input":100,"output":50}}
```

### Message Events

| Type | Description |
|------|-------------|
| `session_start` | Session initialization |
| `message` | User or assistant message |
| `tool_use` | Tool was invoked |
| `tool_result` | Tool execution result |

## Session Caching

Active sessions are cached in memory for performance:

```typescript
const activeSessions = new Map<string, SessionInfo>();

interface SessionInfo {
  session: AgentSession;
  instanceId: string;
  lastUsed: number;
}
```

### Cache Lifecycle

1. **Cache Hit**: Return existing session (update `lastUsed`)
2. **Cache Miss**: Load from disk or create new
3. **Cleanup**: Remove sessions inactive for 30 minutes

```typescript
// Cleanup runs every 15 minutes
setInterval(cleanupSessions, SESSION_TIMEOUT_MS / 2);

function cleanupSessions() {
  const now = Date.now();
  for (const [key, info] of activeSessions) {
    if (now - info.lastUsed > SESSION_TIMEOUT_MS) {
      info.session.dispose();
      activeSessions.delete(key);
    }
  }
}
```

## Session Management API

### List Sessions

```typescript
// tRPC call
const sessions = await trpc.sessions.list.query({ instanceId: "default" });

// Returns
[
  {
    id: "session-2024-01-15-abc123",
    path: "/path/to/session.jsonl",
    created: "2024-01-15T10:00:00Z",
    modified: "2024-01-15T10:30:00Z",
    messageCount: 42,
    firstMessage: "Hello, can you help me with...",
    allMessagesText: "..."
  }
]
```

### Get Session Messages

```typescript
const messages = await trpc.sessions.get.query({
  sessionId: "session-2024-01-15-abc123",
  instanceId: "default"
});
```

### Delete Session

```typescript
await trpc.sessions.delete.mutate({
  sessionId: "session-2024-01-15-abc123",
  instanceId: "default"
});
```

## Session ID Format

Session IDs follow a predictable format:

```
session-{date}-{uuid}

Examples:
- session-2024-01-15-a1b2c3d4
- web:socketId:uuid (temporary, replaced on first response)
- telegram:123456789 (external channel key)
```

## Context Window Management

Pinky uses `@mariozechner/pi-coding-agent` for session management, which handles:

- **Context Pruning**: Old messages compressed or removed when context is full
- **Tool Results**: Large outputs summarized
- **System Prompt**: Always included at the start

## Best Practices


  
**Session Isolation**

    Use separate instances for different contexts (work vs personal).
    Each instance has completely isolated sessions.
  
  
  
**Session Cleanup**

    Old sessions are automatically cleaned from memory but persist on disk.
    Manually delete old sessions via the API or web UI to save disk space.
  
  
  
**Long Conversations**

    For very long conversations, start a new session and summarize the context.
    This keeps responses fast and reduces token usage.
  

