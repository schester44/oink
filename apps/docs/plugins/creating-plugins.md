
## Overview

This guide walks you through creating a custom plugin for Pinky. By the end, you'll understand how to connect any external service to Pinky.

## Plugin Structure

Create a new directory in `apps/gateway/src/plugins/adapters/`:

```
apps/gateway/src/plugins/adapters/my-plugin/
├── index.ts      # Main plugin file (required)
├── handlers.ts   # Event handlers (optional)
└── types.ts      # Type definitions (optional)
```

## Basic Plugin Template

```typescript
// apps/gateway/src/plugins/adapters/my-plugin/index.ts

import { v4 as uuid } from "uuid";
import { eventBus } from "../../event-bus.js";
import { logger } from "../../../lib/logger.js";
import type {
  MessagePlugin,
  PluginConfig,
  OutgoingMessage,
  NormalizedMessage,
  PluginNotification,
} from "../../types.js";

const PLUGIN_ID = "my-plugin";

export interface MyPluginConfig extends PluginConfig {
  // Add your config options here
  apiKey?: string;
  webhookUrl?: string;
}

export function create(
  pluginConfig: MyPluginConfig,
  _eventBus: typeof eventBus
): MessagePlugin {
  // Store handler references for cleanup
  let outgoingHandler: ((msg: OutgoingMessage) => void) | null = null;
  let chunkHandler: ((msg: OutgoingMessage) => void) | null = null;

  return {
    id: PLUGIN_ID,

    async start(): Promise<void> {
      // 1. Initialize your service connection
      logger.info("Starting my-plugin...");

      // 2. Set up outgoing message handler
      outgoingHandler = (message: OutgoingMessage) => {
        if (message.pluginId !== PLUGIN_ID) return;
        
        // Handle complete messages
        if (message.isComplete) {
          const text = message.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map((c) => c.text)
            .join("");
          
          // Send to your service
          sendToService(message.chatId, text);
        }
      };

      // 3. Set up streaming chunk handler
      chunkHandler = (message: OutgoingMessage) => {
        if (message.pluginId !== PLUGIN_ID) return;
        
        // Handle streaming chunks
        if (message.rawChunk) {
          const chunk = message.rawChunk as { type?: string; delta?: string };
          if (chunk.type === "text-delta" && chunk.delta) {
            streamToService(message.chatId, chunk.delta);
          }
        }
      };

      // 4. Subscribe to events
      eventBus.on("outgoing", outgoingHandler);
      eventBus.on("outgoing-chunk", chunkHandler);

      // 5. Start listening for incoming messages
      startListening();

      logger.info("my-plugin started");
    },

    async stop(): Promise<void> {
      // 1. Unsubscribe from events
      if (outgoingHandler) eventBus.off("outgoing", outgoingHandler);
      if (chunkHandler) eventBus.off("outgoing-chunk", chunkHandler);

      // 2. Cleanup your service connection
      stopListening();

      logger.info("my-plugin stopped");
    },

    async send(chatId: string, message: OutgoingMessage): Promise<void> {
      // Direct send (used by some internal systems)
      const text = message.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("");
      
      sendToService(chatId, text);
    },
  };
}

// Your service integration functions
function startListening() {
  // Listen for messages from your service
  // When a message arrives, emit to event bus:
  
  onMessageFromService((chatId, text, userId) => {
    const normalized: NormalizedMessage = {
      id: uuid(),
      pluginId: PLUGIN_ID,
      chatId,
      sessionId: `${PLUGIN_ID}:${chatId}`,
      instanceId: "default",
      sender: { id: userId },
      content: [{ type: "text", text }],
      timestamp: new Date(),
    };
    
    eventBus.emit("incoming", normalized);
  });
}

function stopListening() {
  // Stop listening to your service
}

function sendToService(chatId: string, text: string) {
  // Send message to your service
}

function streamToService(chatId: string, chunk: string) {
  // Stream chunk to your service (if supported)
}

function onMessageFromService(
  callback: (chatId: string, text: string, userId: string) => void
) {
  // Set up callback for incoming messages
}
```

## Configuration

Add your plugin to `~/.pinky/plugins.json`:

```json
{
  "plugins": {
    "my-plugin": {
      "enabled": true,
      "apiKey": "${MY_PLUGIN_API_KEY}",
      "webhookUrl": "https://example.com/webhook"
    }
  }
}
```

## Handling Different Content Types

### Images

```typescript
// Receiving images
const normalized: NormalizedMessage = {
  // ...
  content: [
    { type: "text", text: "What's in this image?" },
    { 
      type: "image", 
      localPath: "/tmp/image.jpg",
      mimeType: "image/jpeg"
    }
  ],
};
```

### Audio (Voice Messages)

```typescript
// Receiving audio - transcription handled automatically
const normalized: NormalizedMessage = {
  // ...
  content: [
    { 
      type: "audio", 
      localPath: "/tmp/voice.ogg",
      mimeType: "audio/ogg",
      transcription: "Hello, Pinky!"  // Set by transcription service
    }
  ],
  hasVoice: true,  // Triggers TTS response if enabled
};
```

### Files

```typescript
const normalized: NormalizedMessage = {
  // ...
  content: [
    { 
      type: "file", 
      localPath: "/tmp/document.pdf",
      filename: "report.pdf",
      mimeType: "application/pdf"
    }
  ],
};
```

## Handling Notifications

Subscribe to scheduled task notifications:

```typescript
eventBus.on("notification", (notification: PluginNotification) => {
  if (notification.pluginId !== PLUGIN_ID) return;
  
  const text = notification.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");
  
  sendNotificationToService(notification.chatId, {
    title: notification.title,
    message: text,
    priority: notification.priority,
  });
});
```

## Session Management

### External Channel Pattern

For services where each user should have isolated sessions:

```typescript
// Use a predictable session ID pattern
const sessionId = `${PLUGIN_ID}:${chatId}`;

// This creates a subdirectory per user:
// ~/.pinky/instances/default/sessions/my-plugin_user123/
```

### Web-like Pattern

For services where users can manage multiple sessions:

```typescript
// Let users specify session or create new
const sessionId = userProvidedSessionId || undefined;

// undefined = new session, server returns actual ID
```

## Error Handling

```typescript
try {
  await someOperation();
} catch (error) {
  logger.error({ error, pluginId: PLUGIN_ID }, "Operation failed");
  
  // Optionally notify user
  sendToService(chatId, "Sorry, something went wrong. Please try again.");
}
```

## Testing Your Plugin

1. Add your plugin to `plugins.json` with `enabled: true`
2. Start the gateway: `yarn dev`
3. Watch logs: `yarn dev | npx pino-pretty`
4. Send test messages from your service

## Example: Discord Plugin

Here's a sketch of a Discord bot plugin:

```typescript
import { Client, GatewayIntentBits } from "discord.js";

export function create(config: DiscordPluginConfig): MessagePlugin {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  return {
    id: "discord",
    
    async start() {
      client.on("messageCreate", (message) => {
        if (message.author.bot) return;
        
        eventBus.emit("incoming", {
          id: message.id,
          pluginId: "discord",
          chatId: message.channelId,
          sessionId: `discord:${message.channelId}`,
          instanceId: config.instanceId || "default",
          sender: {
            id: message.author.id,
            name: message.author.username,
          },
          content: [{ type: "text", text: message.content }],
          timestamp: message.createdAt,
        });
      });

      await client.login(config.botToken);
    },

    async stop() {
      await client.destroy();
    },

    async send(chatId, message) {
      const channel = await client.channels.fetch(chatId);
      if (channel?.isTextBased()) {
        const text = message.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("");
        await channel.send(text);
      }
    },
  };
}
```

## Best Practices


  
**Always check pluginId**

    Filter events by `pluginId` to avoid handling other plugins' messages.
  
  
  
**Clean up on stop**

    Unsubscribe from all events and close connections in `stop()`.
  
  
  
**Use structured logging**

    Include `pluginId` in all log entries for easy debugging.
  
  
  
**Handle errors gracefully**

    Don't let errors crash the gateway. Log and continue.
  
  
  
**Support streaming when possible**

    Listen to `outgoing-chunk` for real-time response delivery.
  

