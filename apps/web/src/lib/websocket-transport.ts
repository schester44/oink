import { io, Socket } from "socket.io-client";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

export interface WebSocketChatTransportOptions {
  gatewayUrl: string;
  instanceId: string;
  sessionId?: string;
}

export interface ScheduledTaskNotification {
  taskId: string;
  taskName: string;
  instance: string;
  output: string;
  executedAt: string;
  type: "notification" | "llm";
  messageType: "scheduled-task";
}

export type ScheduledTaskHandler = (
  notification: ScheduledTaskNotification,
) => void;

/**
 * WebSocket-based chat transport for AI SDK's useChat hook.
 * Connects to the gateway via Socket.IO and streams UIMessageChunks.
 */
export class WebSocketChatTransport implements ChatTransport<UIMessage> {
  private socket: Socket | null = null;
  private gatewayUrl: string;
  private instanceId: string;
  private sessionId?: string;
  private connectionPromise: Promise<void> | null = null;
  private scheduledTaskHandler: ScheduledTaskHandler | null = null;

  constructor(options: WebSocketChatTransportOptions) {
    this.gatewayUrl = options.gatewayUrl;
    this.instanceId = options.instanceId;
    this.sessionId = options.sessionId;
  }

  /**
   * Set a handler for scheduled task notifications.
   * When a scheduled task executes, this handler will be called with the result.
   */
  onScheduledTask(handler: ScheduledTaskHandler | null): void {
    this.scheduledTaskHandler = handler;
  }

  /**
   * Connect to the gateway. Call this to establish connection and start
   * receiving scheduled task notifications even before sending messages.
   */
  async connect(): Promise<void> {
    await this.ensureConnected();
  }

  /**
   * Update the gateway URL. Disconnects existing connection if URL changes.
   */
  setGatewayUrl(gatewayUrl: string): void {
    if (this.gatewayUrl !== gatewayUrl) {
      this.disconnect();
      this.gatewayUrl = gatewayUrl;
    }
  }

  /**
   * Ensures the socket is connected before sending messages.
   */
  private async ensureConnected(): Promise<Socket> {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.connectionPromise) {
      await this.connectionPromise;

      return this.socket!;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      this.socket = io(this.gatewayUrl, {
        query: { instance: this.instanceId },
        transports: ["websocket"],
      });

      this.socket.on("connect", () => {
        console.log("[WebSocketTransport] Connected to gateway");
        resolve();
      });

      // Listen for scheduled task notifications
      this.socket.on(
        "scheduled-task",
        (notification: ScheduledTaskNotification) => {
          console.log("[WebSocketTransport] Scheduled task received:", notification);
          if (this.scheduledTaskHandler) {
            this.scheduledTaskHandler(notification);
          }
        },
      );

      this.socket.on("connect_error", (error) => {
        console.error("[WebSocketTransport] Connection error:", error);
        reject(error);
      });
    });

    await this.connectionPromise;

    return this.socket!;
  }

  /**
   * Update the instance ID and reconnect if necessary.
   */
  setInstanceId(instanceId: string): void {
    if (this.instanceId !== instanceId) {
      this.instanceId = instanceId;
      if (this.socket?.connected) {
        this.socket.emit("switch-instance", instanceId);
      }
    }
  }

  /**
   * Update the session ID.
   */
  setSessionId(sessionId: string | undefined): void {
    this.sessionId = sessionId;
  }

  /**
   * Sends messages to the gateway via WebSocket and returns a streaming response.
   */
  sendMessages: ChatTransport<UIMessage>["sendMessages"] = async (options) => {
    const socket = await this.ensureConnected();

    const lastMessage = options.messages[options.messages.length - 1];

    if (!lastMessage) {
      throw new Error("No messages to send");
    }

    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        // Handle incoming chunks
        const handleChunk = (chunk: UIMessageChunk) => {
          console.log("[WebSocketTransport] Received chunk:", chunk);
          controller.enqueue(chunk);
        };

        // Handle completion
        const handleComplete = () => {
          cleanup();
          controller.close();
        };

        // Handle errors
        const handleError = (error: { error?: string; errorText?: string }) => {
          cleanup();

          controller.error(
            new Error(error.error || error.errorText || "Unknown error"),
          );
        };

        // Cleanup function to remove listeners
        const cleanup = () => {
          socket.off("chat-chunk", handleChunk);
          socket.off("chat-complete", handleComplete);
          socket.off("chat-error", handleError);
        };

        // Handle abort signal
        if (options.abortSignal) {
          options.abortSignal.addEventListener("abort", () => {
            cleanup();
            controller.close();
          });
        }

        // Set up listeners
        socket.on("chat-chunk", handleChunk);
        socket.on("chat-complete", handleComplete);
        socket.on("chat-error", handleError);

        // Extract text content from message parts
        const textContent =
          lastMessage.parts
            ?.filter(
              (p): p is { type: "text"; text: string } => p.type === "text",
            )
            .map((p) => p.text)
            .join("") || "";

        // Send the chat message
        socket.emit("chat", {
          instanceId: this.instanceId,
          sessionId: this.sessionId || options.chatId,
          message: {
            id: lastMessage.id,
            role: lastMessage.role,
            content: textContent,
            parts: lastMessage.parts,
          },
        });
      },
    });
  };

  /**
   * Reconnect to an existing stream (not supported for WebSocket transport).
   * This is required by the ChatTransport interface but we don't support reconnection.
   */
  reconnectToStream: ChatTransport<UIMessage>["reconnectToStream"] =
    async () => {
      // WebSocket transport doesn't support stream reconnection
      // Return an empty stream that immediately closes
      return new ReadableStream<UIMessageChunk>({
        start: (controller) => {
          controller.close();
        },
      });
    };

  /**
   * Disconnect from the gateway.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionPromise = null;
    }
  }
}

// Singleton instance for shared connection
let sharedTransport: WebSocketChatTransport | null = null;

/**
 * Get or create a shared WebSocket transport instance.
 */
export function getWebSocketTransport(
  options: WebSocketChatTransportOptions,
): WebSocketChatTransport {
  if (!sharedTransport) {
    sharedTransport = new WebSocketChatTransport(options);
  } else {
    if (options.gatewayUrl) {
      sharedTransport.setGatewayUrl(options.gatewayUrl);
    }
    sharedTransport.setInstanceId(options.instanceId);
    sharedTransport.setSessionId(options.sessionId);
  }

  return sharedTransport;
}
