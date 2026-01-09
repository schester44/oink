# Scheduled Tasks System Design

A file-based cron system for the gateway that enables background task scheduling. The LLM can create scheduled tasks (reminders, recurring prompts) that execute automatically and notify users via WebSocket (extensible to other channels).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Gateway                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Scheduler  │───▶│   Executor   │───▶│  Dispatcher  │   │
│  │              │    │              │    │              │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                   │                   │            │
│         ▼                   ▼                   ▼            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  Task Files  │    │   Workspace  │    │  WebSocket   │   │
│  │   (JSON)     │    │   (brain)    │    │  (+ future)  │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Components

| Component | Responsibility |
|-----------|----------------|
| Scheduler | File watching, cron jobs (node-cron), 1-minute poller for one-shots |
| Executor | Run notification or LLM invocation with full workspace context |
| Dispatcher | Route output to websocket (extensible to telegram, sms, etc.) |

### Multi-Instance Support

The gateway serves multiple assistant instances. Tasks and clients are scoped by instance.

```
data/
  instances/
    default/
      tasks/
        active/       # Tasks waiting to run
        archive/      # Completed one-shot tasks
      config/
        channels.json # Channel defaults for this instance
    work/
      tasks/
        active/
        archive/
      config/
        channels.json
```

## Task Schema

Each task is a JSON file: `data/instances/{instance}/tasks/active/{id}.json`

```json
{
  "id": "abc123",
  "instance": "default",
  "name": "Sunday Dinner Planning",
  "description": "Help me plan dinner for the week",

  "schedule": {
    "type": "recurring",
    "cron": "0 18 * * 0"
  },

  "execution": {
    "type": "llm",
    "prompt": "Help me plan dinner for tonight. Consider what's in season and my preferences."
  },

  "notifications": {
    "channels": ["websocket"],
    "priority": "normal"
  },

  "metadata": {
    "createdAt": "2025-01-09T10:00:00Z",
    "createdBy": "chat:session-xyz",
    "lastRun": null,
    "runCount": 0,
    "lastError": null
  }
}
```

### Schedule Types

**Recurring** (node-cron):
```json
{ "type": "recurring", "cron": "0 8 * * *" }
```

**One-shot** (1-minute poller):
```json
{ "type": "once", "at": "2025-01-10T08:00:00Z" }
```

### Execution Types

**Simple notification:**
```json
{ "type": "notification", "message": "Wake up!" }
```

**LLM-assisted** (full workspace context):
```json
{ "type": "llm", "prompt": "Help me plan dinner..." }
```

## Scheduler Implementation

### Startup
1. Load all `*.json` from `active/` for each instance
2. For recurring tasks: create node-cron job
3. Start 1-minute interval for one-shot poller
4. Start file watcher on `active/` directories

### File Watcher
- **Created**: Parse, validate, add timer
- **Modified**: Cancel existing timer, re-add
- **Deleted**: Cancel timer, remove from memory

### One-Shot Poller (every 60 seconds)
```typescript
for (const task of tasks.values()) {
  if (task.schedule.type === "once" && isPast(task.schedule.at)) {
    await execute(task)
    await archiveTask(task)
  }
}
```

### Timer Fires
1. Pass task to Executor
2. Update metadata (`lastRun`, `runCount`)
3. If one-shot: move file to `archive/`

## Executor

### Notification Type
Pass through the message directly.

### LLM Type
```typescript
// 1. Load workspace context (memories, user profile, etc.)
const workspace = await loadWorkspace(task.instance)

// 2. Build system prompt (same brain as chat)
const systemPrompt = buildSystemPrompt(workspace)

// 3. Invoke LLM
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5-20250514",
  system: systemPrompt,
  messages: [{ role: "user", content: task.execution.prompt }]
})
```

Scheduled LLM tasks are first-class citizens with full workspace access.

## Dispatcher

### Channel Configuration

`data/instances/{instance}/config/channels.json`:
```json
{
  "defaults": {
    "channels": ["websocket"],
    "fallbackOrder": ["websocket"]
  },

  "channels": {
    "websocket": {
      "enabled": true,
      "requiresConnection": true
    }
  }
}
```

### Dispatch Logic
1. Task fires → Executor produces output
2. Check task's `notifications.channels` (or use defaults)
3. For each channel: attempt delivery, stop on success
4. If `priority: "high"`: send to ALL channels

### WebSocket Channel
```typescript
const websocketChannel: Channel = {
  name: "websocket",
  isAvailable: (instance) => getClientsForInstance(instance).length > 0,
  send: async (result, instance) => {
    for (const client of getClientsForInstance(instance)) {
      io.to(client.socketId).emit("scheduled-task", result)
    }
  }
}
```

## WebSocket Integration

Clients connect to gateway with instance scope:
```typescript
socket.on("connect", (instanceId = "default") => {
  clients.set(socket.id, { socketId: socket.id, instance: instanceId })
})
```

Message format to client:
```json
{
  "type": "scheduled-task",
  "taskId": "abc123",
  "taskName": "Sunday Dinner Planning",
  "output": "Based on your preferences, here are some dinner ideas...",
  "executedAt": "2025-01-09T18:00:00Z"
}
```

## LLM Tools

### create_scheduled_task
```typescript
{
  name: "create_scheduled_task",
  parameters: {
    name: string,
    description: string,
    schedule: { type: "cron", cron: string } | { type: "once", at: string },
    execution: { type: "notification", message: string } | { type: "llm", prompt: string },
    channels?: string[]
  }
}
```

### list_scheduled_tasks
```typescript
{
  name: "list_scheduled_tasks",
  parameters: {
    status: "active" | "archived" | "all"  // default: "active"
  }
}
```

### update_scheduled_task
```typescript
{
  name: "update_scheduled_task",
  parameters: {
    taskId: string,
    updates: Partial<Task>
  }
}
```

### delete_scheduled_task
```typescript
{
  name: "delete_scheduled_task",
  parameters: {
    taskId: string
  }
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Task execution fails | Log error, update `lastError`, don't archive one-shots |
| No clients connected | Execute anyway, log output, future: queue or fallback |
| Invalid task file | Log error, skip file, don't crash scheduler |
| Server restart | Reload all tasks, poller catches past-due one-shots |
| Clock/timezone | Store all times as UTC, convert for display only |

## Future Extensions

- Additional channels: Telegram, SMS, email
- Task templates for common patterns
- Web UI for task management
- Task dependencies (run B after A completes)
- Retry policies with backoff
