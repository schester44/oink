
## Overview

The web client provides a modern chat interface for Pinky. Built with React, it connects to the gateway via WebSocket for real-time communication.

## Quick Start

```bash
# Start the gateway first
cd apps/gateway && yarn dev

# Start the web client
cd apps/web && yarn dev
```

Open http://localhost:4444 in your browser.

## Features

- **Real-time streaming**: See responses as they're generated
- **Session management**: Create, switch, and delete sessions
- **Tool visibility**: See when Pinky uses tools
- **Markdown rendering**: Rich text formatting

## Architecture

```
┌─────────────────────────────────────────┐
│              Web Client                  │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │         React App                │    │
│  │  ┌─────────┐  ┌──────────────┐  │    │
│  │  │ TanStack│  │  Socket.IO   │  │    │
│  │  │  Query  │  │   Client     │  │    │
│  │  └────┬────┘  └──────┬───────┘  │    │
│  └───────┼──────────────┼──────────┘    │
│          │              │               │
└──────────┼──────────────┼───────────────┘
           │              │
      tRPC API      WebSocket
       :4446          :4445
           │              │
           └──────┬───────┘
                  │
           ┌──────▼──────┐
           │   Gateway   │
           └─────────────┘
```

## Development

### Prerequisites

- Node.js 22+
- Gateway running on ports 4445/4446

### Setup

```bash
cd apps/web
yarn install
yarn dev
```

### Build

```bash
yarn build
```

Output is in `dist/` ready for static hosting.

## Configuration

The web client expects the gateway at:
- WebSocket: `ws://localhost:4445`
- tRPC: `http://localhost:4446`

For production, configure via environment or update the client config.

## Tech Stack

- **React 18**: UI framework
- **TanStack Query**: Server state management
- **Socket.IO Client**: WebSocket communication
- **Tailwind CSS**: Styling
- **Vite**: Build tool
