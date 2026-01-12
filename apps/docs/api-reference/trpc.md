
## Overview

The tRPC API provides type-safe endpoints for managing Pinky. It runs on port `4446` by default.

## Client Setup

```typescript
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@pinky/trpc";
import superjson from "superjson";

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "http://localhost:4446",
      transformer: superjson,
    }),
  ],
});
```

## Endpoints

### Health

#### `health.check`

Check gateway health status.

```typescript
const health = await trpc.health.check.query();

// Response
{
  status: "ok" | "degraded" | "error",
  version: "0.1.0",
  uptime: 3600,  // seconds
  timestamp: "2024-01-15T10:00:00Z"
}
```


### Instances

#### `instances.list`

List all instances.

```typescript
const instances = await trpc.instances.list.query();

// Response
[
  { id: "default", name: "Default" },
  { id: "work", name: "Work" }
]
```

#### `instances.create`

Create a new instance.

```typescript
const instance = await trpc.instances.create.mutate({
  name: "Work Projects"
});

// Response
{ id: "work-projects", name: "Work Projects" }
```

#### `instances.rename`

Rename an instance.

```typescript
const instance = await trpc.instances.rename.mutate({
  id: "work-projects",
  name: "Work"
});
```

#### `instances.delete`

Delete an instance.

```typescript
await trpc.instances.delete.mutate({
  id: "work-projects"
});

// Response
{ success: true }
```


### Sessions

#### `sessions.list`

List sessions for an instance.

```typescript
const sessions = await trpc.sessions.list.query({
  instanceId: "default"  // optional
});

// Response
[
  {
    path: "/path/to/session.jsonl",
    id: "session-2024-01-15-abc123",
    created: "2024-01-15T10:00:00Z",
    modified: "2024-01-15T10:30:00Z",
    messageCount: 42,
    firstMessage: "Hello, can you help me...",
    allMessagesText: "..."
  }
]
```

#### `sessions.get`

Get messages from a session.

```typescript
const messages = await trpc.sessions.get.query({
  sessionId: "session-2024-01-15-abc123",
  instanceId: "default"  // optional
});

// Response
[
  {
    type: "message",
    id: "msg-1",
    timestamp: "2024-01-15T10:00:00Z",
    cwd: "/path/to/workspace",
    role: "user",
    parts: [{ type: "text", text: "Hello!" }]
  },
  {
    type: "message",
    id: "msg-2",
    timestamp: "2024-01-15T10:00:05Z",
    cwd: "/path/to/workspace",
    role: "assistant",
    parts: [{ type: "text", text: "Hi there!" }],
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
  }
]
```

#### `sessions.delete`

Delete a session.

```typescript
await trpc.sessions.delete.mutate({
  sessionId: "session-2024-01-15-abc123",
  instanceId: "default"  // optional
});

// Response
{ success: true }
```


### Metrics

#### `metrics.get`

Get usage metrics.

```typescript
const metrics = await trpc.metrics.get.query();

// Response
{
  requestCount: 150,
  totalInputTokens: 50000,
  totalOutputTokens: 30000,
  totalTokens: 80000,
  avgInputTokensPerRequest: 333,
  avgOutputTokensPerRequest: 200,
  avgTokensPerRequest: 533,
  totalCacheCreationTokens: 1000,
  totalCacheReadTokens: 5000,
  cacheHitRate: 0.75,
  lastUpdated: "2024-01-15T10:00:00Z",
  histogram: {
    inputTokens: [100, 200, 300, ...],
    outputTokens: [50, 100, 150, ...],
    totalTokens: [150, 300, 450, ...]
  }
}
```

#### `metrics.reset`

Reset metrics.

```typescript
await trpc.metrics.reset.mutate();

// Response
{ success: true }
```


### Settings

#### `settings.get`

Get user settings.

```typescript
const settings = await trpc.settings.get.query();

// Response
{
  timezone: "America/New_York"
}
```

#### `settings.update`

Update user settings.

```typescript
const settings = await trpc.settings.update.mutate({
  timezone: "America/Los_Angeles"
});

// Response
{
  timezone: "America/Los_Angeles"
}
```


### Plugins

#### `plugins.list`

List plugin configurations.

```typescript
const config = await trpc.plugins.list.query();

// Response
{
  plugins: {
    websocket: { enabled: true },
    telegram: { enabled: true, botToken: "...", instanceId: "default" }
  },
  transcription: {
    provider: "auto",
    localWhisper: { modelSize: "base.en" }
  },
  tts: {
    enabled: true,
    provider: "elevenlabs"
  }
}
```

#### `plugins.update`

Enable/disable a plugin.

```typescript
const config = await trpc.plugins.update.mutate({
  pluginId: "telegram",
  enabled: false
});
```

#### `plugins.updateTranscription`

Update transcription settings.

```typescript
const config = await trpc.plugins.updateTranscription.mutate({
  provider: "openai-whisper",
  openaiWhisper: {
    model: "whisper-1"
  }
});
```

#### `plugins.updateTTS`

Update TTS settings.

```typescript
const config = await trpc.plugins.updateTTS.mutate({
  enabled: true,
  provider: "openai",
  openai: {
    voice: "nova",
    model: "tts-1"
  }
});
```

## Error Handling

tRPC errors include helpful information:

```typescript
try {
  await trpc.sessions.get.query({ sessionId: "nonexistent" });
} catch (error) {
  if (error instanceof TRPCClientError) {
    console.log(error.message);  // "Session not found"
    console.log(error.data?.code);  // "NOT_FOUND"
  }
}
```

## Type Safety

The tRPC client is fully typed. Your IDE will provide autocomplete and type checking:

```typescript
// TypeScript knows the exact shape of the response
const sessions = await trpc.sessions.list.query({});
sessions.forEach(session => {
  console.log(session.messageCount);  // number
  console.log(session.created);       // Date
});
```
