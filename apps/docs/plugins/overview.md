
## What are Plugins?

Plugins are adapters that connect external services to Pinky. They translate between the service's protocol and Pinky's internal event system.

## Built-in Plugins


  - [WebSocket](/plugins/websocket) - 
    Real-time connections for web clients
  
  - [Telegram](/plugins/telegram) - 
    Telegram bot with voice support
  
  - [TUI](/plugins/tui) - 
    Terminal interface client
  


## Plugin Architecture

All plugins follow the same pattern:

```
External Service ◄──► Plugin ◄──► Event Bus ◄──► Chat Handler
```

### Key Responsibilities

| Responsibility | Description |
|---------------|-------------|
| **Connection Management** | Handle client connects/disconnects |
| **Message Normalization** | Convert service messages to `NormalizedMessage` |
| **Response Delivery** | Send responses back to clients |
| **Media Handling** | Process images, audio, files |
| **Error Recovery** | Handle network issues gracefully |

## Plugin Interface

```typescript
interface MessagePlugin {
  id: string;
  
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  
  // Send a message to a specific client
  send(chatId: string, message: OutgoingMessage): Promise<void>;
  
  // Optional: Send notifications (scheduled tasks)
  sendNotification?(chatId: string, notification: PluginNotification): Promise<void>;
}
```

## Event Bus Integration

Plugins communicate via the typed event bus:

### Emitting Messages

```typescript
// When a message arrives from external service
eventBus.emit("incoming", {
  id: uuid(),
  pluginId: "my-plugin",
  chatId: "client-123",
  sessionId: "session-456",
  instanceId: "default",
  sender: { id: "user-789" },
  content: [{ type: "text", text: "Hello!" }],
  timestamp: new Date(),
});
```

### Receiving Responses

```typescript
// Subscribe to outgoing messages
eventBus.on("outgoing", (message) => {
  if (message.pluginId !== "my-plugin") return;
  // Deliver to client
});

// Subscribe to streaming chunks
eventBus.on("outgoing-chunk", (message) => {
  if (message.pluginId !== "my-plugin") return;
  // Stream to client
});

// Subscribe to notifications
eventBus.on("notification", (notification) => {
  if (notification.pluginId !== "my-plugin") return;
  // Deliver notification
});
```

## Configuration

Plugins are configured in `~/.pinky/plugins.json`:

```json
{
  "plugins": {
    "websocket": {
      "enabled": true
    },
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "instanceId": "default"
    },
    "my-custom-plugin": {
      "enabled": true,
      "apiKey": "${MY_API_KEY}",
      "customOption": "value"
    }
  }
}
```

> **Note:** 
Environment variables in `${VAR}` format are automatically resolved at startup.


## Creating Custom Plugins

Ready to build your own? Check out the guide:

- [Creating Plugins](/plugins/creating-plugins) - 
  Step-by-step guide to building custom plugins

