
## Overview

The TUI (Terminal User Interface) provides a command-line way to chat with Pinky directly from your terminal. It connects to the gateway via WebSocket.

## Quick Start

```bash
# Make sure the gateway is running first
cd apps/gateway && yarn dev

# In another terminal, start the TUI
node apps/gateway/tui-client.mjs
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--port` | `4445` | WebSocket port to connect to |
| `--instance` | `default` | Pinky instance to use |

**Examples:**

```bash
# Connect with defaults
node apps/gateway/tui-client.mjs

# Connect to specific port
node apps/gateway/tui-client.mjs --port 3001

# Use a different instance
node apps/gateway/tui-client.mjs --instance work
```

## Commands

Type these during a chat session:

| Command | Description |
|---------|-------------|
| `/quit` | Exit the TUI |
| `/exit` | Exit the TUI (alias) |
| `/new` | Start a new conversation session |
| `/session` | Show current session ID |
| `/help` | Show available commands |

## Features

### Real-time Streaming

Responses stream in real-time, character by character, as Pinky generates them.

### Session Persistence

Your conversation is saved to a session. Use `/session` to see the session ID, which you can use to continue the conversation later.

### Multi-Instance Support

Connect to different Pinky instances using the `--instance` flag. Each instance has its own brain, memory, and conversation history.

### Colorized Output

The TUI uses ANSI colors for a better terminal experience:
- **Green**: Your input prompt
- **Blue**: Pinky's responses  
- **Yellow**: System messages
- **Magenta**: Notifications

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Ctrl+C` | Exit the TUI |
| `Ctrl+D` | Exit the TUI |

## Troubleshooting

### Connection Failed

If you see "Connection failed", make sure:

1. The gateway is running: `cd apps/gateway && yarn dev`
2. You're using the correct port (default: 4445)
3. No firewall is blocking the connection

### Session Not Persisting

Sessions are managed by the gateway. If your session isn't persisting:

1. Check the gateway logs for errors
2. Ensure `~/.pinky/instances/default/sessions/` is writable
3. Don't use `/new` unless you want a fresh conversation
