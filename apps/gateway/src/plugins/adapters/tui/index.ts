// apps/gateway/src/plugins/adapters/tui/index.ts
// TUI Plugin - A terminal interface for chatting with the LLM gateway

import { v4 as uuid } from "uuid";
import readline from "readline";
import { eventBus } from "../../event-bus.js";
import { logger } from "../../../lib/logger.js";
import { config } from "../../../lib/config.js";
import type {
  MessagePlugin,
  PluginConfig,
  OutgoingMessage,
  NormalizedMessage,
  PluginNotification,
} from "../../types.js";

const PLUGIN_ID = "tui";

export interface TUIPluginConfig extends PluginConfig {
  instanceId?: string;
}

interface TUIState {
  sessionId: string;
  instanceId: string;
  isStreaming: boolean;
  streamBuffer: string;
}

// ANSI color helpers
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

export function create(
  pluginConfig: TUIPluginConfig,
  _eventBus: typeof eventBus
): MessagePlugin {
  let rl: readline.Interface | null = null;
  let state: TUIState | null = null;
  let outgoingHandler: ((msg: OutgoingMessage) => void) | null = null;
  let chunkHandler: ((msg: OutgoingMessage) => void) | null = null;
  let notificationHandler: ((notification: PluginNotification) => void) | null = null;

  const chatId = `tui:${uuid()}`;

  function clearLine() {
    process.stdout.write("\r\x1b[K");
  }

  function printHeader() {
    console.log(`\n${colors.cyan}${colors.bold}╔════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}║       🐷 Oink TUI Chat Interface       ║${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}╚════════════════════════════════════════╝${colors.reset}\n`);
    console.log(`${colors.dim}Commands:${colors.reset}`);
    console.log(`${colors.dim}  /quit    - Exit the TUI${colors.reset}`);
    console.log(`${colors.dim}  /new     - Start a new session${colors.reset}`);
    console.log(`${colors.dim}  /session - Show current session ID${colors.reset}`);
    console.log(`${colors.dim}  /help    - Show this help${colors.reset}\n`);
  }

  function prompt() {
    if (!state?.isStreaming) {
      process.stdout.write(`${colors.green}You: ${colors.reset}`);
    }
  }

  function handleUserInput(input: string) {
    if (!state) return;

    const trimmed = input.trim();

    // Handle commands
    if (trimmed.startsWith("/")) {
      const cmd = trimmed.toLowerCase();
      switch (cmd) {
        case "/quit":
        case "/exit":
          console.log(`\n${colors.dim}Goodbye! 👋${colors.reset}\n`);
          process.exit(0);
          break;
        case "/new":
          state.sessionId = `tui:${uuid()}`;
          console.log(`${colors.yellow}Started new session: ${state.sessionId}${colors.reset}\n`);
          prompt();
          break;
        case "/session":
          console.log(`${colors.yellow}Current session: ${state.sessionId}${colors.reset}\n`);
          prompt();
          break;
        case "/help":
          printHeader();
          prompt();
          break;
        default:
          console.log(`${colors.dim}Unknown command: ${trimmed}${colors.reset}\n`);
          prompt();
      }
      return;
    }

    if (!trimmed) {
      prompt();
      return;
    }

    // Send message to gateway
    state.isStreaming = true;
    state.streamBuffer = "";
    
    const normalized: NormalizedMessage = {
      id: uuid(),
      pluginId: PLUGIN_ID,
      chatId,
      sessionId: state.sessionId,
      instanceId: state.instanceId,
      sender: {
        id: "tui-user",
        name: "TUI User",
      },
      content: [{ type: "text", text: trimmed }],
      timestamp: new Date(),
    };

    process.stdout.write(`\n${colors.blue}Assistant: ${colors.reset}`);
    eventBus.emit("incoming", normalized);
  }

  return {
    id: PLUGIN_ID,

    async start(): Promise<void> {
      const instanceId = pluginConfig.instanceId || config.defaultInstance;
      
      state = {
        sessionId: `tui:${uuid()}`,
        instanceId,
        isStreaming: false,
        streamBuffer: "",
      };

      // Handle streaming chunks
      chunkHandler = (message: OutgoingMessage) => {
        if (message.pluginId !== PLUGIN_ID || message.chatId !== chatId) return;
        if (!state) return;

        const chunk = message.rawChunk as { type?: string; delta?: string; sessionId?: string } | undefined;
        
        if (chunk?.type === "text-delta" && chunk.delta) {
          process.stdout.write(chunk.delta);
          state.streamBuffer += chunk.delta;
        }
        
        // Update sessionId if server sends one
        if (chunk?.type === "start" && chunk.sessionId) {
          state.sessionId = chunk.sessionId;
        }
      };

      // Handle complete messages
      outgoingHandler = (message: OutgoingMessage) => {
        if (message.pluginId !== PLUGIN_ID || message.chatId !== chatId) return;
        if (!state) return;

        if (message.isComplete) {
          // If we have streamed content, just add newlines
          if (state.streamBuffer) {
            console.log("\n");
          } else {
            // Fallback for non-streamed responses
            const textContent = message.content.find((c) => c.type === "text");
            if (textContent && textContent.type === "text") {
              console.log(textContent.text + "\n");
            }
          }
          
          state.isStreaming = false;
          state.streamBuffer = "";
          prompt();
        }
      };

      // Handle notifications
      notificationHandler = (notification: PluginNotification) => {
        if (notification.pluginId !== PLUGIN_ID) return;

        const textContent = notification.content.find((c) => c.type === "text");
        if (textContent && textContent.type === "text") {
          clearLine();
          console.log(`\n${colors.magenta}📢 [${notification.title || "Notification"}]: ${textContent.text}${colors.reset}\n`);
          prompt();
        }
      };

      eventBus.on("outgoing-chunk", chunkHandler);
      eventBus.on("outgoing", outgoingHandler);
      eventBus.on("notification", notificationHandler);

      // Setup readline interface
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });

      rl.on("line", handleUserInput);
      rl.on("close", () => {
        console.log(`\n${colors.dim}TUI closed${colors.reset}`);
      });

      printHeader();
      console.log(`${colors.dim}Instance: ${instanceId} | Session: ${state.sessionId}${colors.reset}\n`);
      prompt();

      logger.info({ instanceId }, "TUI plugin started");
    },

    async stop(): Promise<void> {
      if (outgoingHandler) eventBus.off("outgoing", outgoingHandler);
      if (chunkHandler) eventBus.off("outgoing-chunk", chunkHandler);
      if (notificationHandler) eventBus.off("notification", notificationHandler);

      if (rl) {
        rl.close();
        rl = null;
      }

      state = null;
      logger.info("TUI plugin stopped");
    },

    async send(targetChatId: string, message: OutgoingMessage): Promise<void> {
      // This is called by external code to send messages to TUI
      if (targetChatId !== chatId) return;

      const textContent = message.content.find((c) => c.type === "text");
      if (textContent && textContent.type === "text") {
        console.log(`\n${colors.blue}Assistant: ${colors.reset}${textContent.text}\n`);
        prompt();
      }
    },
  };
}
