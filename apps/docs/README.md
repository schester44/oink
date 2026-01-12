# 🐽 Pinky

Pinky is a personal AI assistant designed to be genuinely helpful, not just performatively helpful. No "Great question!" fluff - just real assistance with your daily tasks, projects, and digital life.

## What Makes Pinky Different?

- **Actually Useful** - Skips the corporate chatbot nonsense and gets straight to helping you
- **Resourceful** - Tries to figure things out before asking you endless clarifying questions
- **Persistent Memory** - Remembers who you are and what matters to you across sessions
- **Multi-Channel** - Chat via web, Telegram, terminal, or any custom interface

## Architecture Overview

Pinky is built as a modular system with several key components:

```
┌─────────────────────────────────────────────────────────────┐
│                         Clients                              │
│   ┌─────────┐   ┌──────────┐   ┌─────┐   ┌─────────────┐   │
│   │   Web   │   │ Telegram │   │ TUI │   │   Custom    │   │
│   └────┬────┘   └────┬─────┘   └──┬──┘   └──────┬──────┘   │
└────────┼─────────────┼────────────┼─────────────┼──────────┘
         │             │            │             │
         └─────────────┴─────┬──────┴─────────────┘
                             │
                    ┌────────▼────────┐
                    │     Gateway     │
                    │  ┌───────────┐  │
                    │  │ Event Bus │  │
                    │  └─────┬─────┘  │
                    │        │        │
                    │  ┌─────▼─────┐  │
                    │  │   Agent   │  │
                    │  │  Service  │  │
                    │  └─────┬─────┘  │
                    │        │        │
                    │  ┌─────▼─────┐  │
                    │  │   Brain   │  │
                    │  │ (Skills,  │  │
                    │  │  Memory)  │  │
                    │  └───────────┘  │
                    └─────────────────┘
```

## Philosophy

Pinky believes in:

- **Being a guest in your digital space** - Respectful access, no overstepping
- **Earning trust through competence** - Not cheerfulness or empty validation
- **Having opinions and personality** - Because bland assistants are boring
- **Getting stuff done** - Instead of just talking about it

## Quick Links

- [Quickstart](quickstart.md) - Get Pinky running in 5 minutes
- [Architecture](architecture.md) - Deep dive into how Pinky works
- [Gateway](gateway/overview.md) - Learn about the core gateway service
- [Plugins](plugins/overview.md) - Extend Pinky with custom integrations
