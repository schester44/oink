import { useRef, useEffect, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageContent, hasVisibleContent } from "./message-content";

type MessagePart = {
  type: string;
  text?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  [key: string]: unknown;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: Array<MessagePart>;
};

interface VirtualizedMessageListProps {
  messages: Message[];
  showToolCalls: boolean;
  isLoading: boolean;
  showStreamingDelay: boolean;
}

export const VirtualizedMessageList = memo(function VirtualizedMessageList({
  messages,
  showToolCalls,
  isLoading,
  showStreamingDelay,
}: VirtualizedMessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter messages to only show visible ones
  const visibleMessages = messages.filter(
    (message) =>
      message.role === "user" || hasVisibleContent(message, showToolCalls)
  );

  const lastMessage = messages[messages.length - 1];

  // Check if the last assistant message has any text content yet
  const lastAssistantHasContent =
    lastMessage?.role === "assistant" &&
    lastMessage.parts?.some(
      (p: { type: string; text?: string }) => p.type === "text" && p.text
    );
  const showLoadingIndicator = isLoading && !lastAssistantHasContent;

  // Add a virtual item for the loading indicator if needed
  const itemCount = visibleMessages.length + (showLoadingIndicator ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimate message height
    overscan: 5,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (parentRef.current && itemCount > 0) {
      virtualizer.scrollToIndex(itemCount - 1, { align: "end" });
    }
  }, [itemCount, virtualizer]);

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto p-4"
      style={{ contain: "strict" }}
    >
      <div
        className="max-w-3xl mx-auto relative"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {items.map((virtualRow) => {
          const isLoadingRow = virtualRow.index >= visibleMessages.length;

          if (isLoadingRow) {
            // Loading indicator
            return (
              <div
                key="loading"
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 right-0"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="flex gap-3 py-2">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm">
                    🐷
                  </div>
                  <div className="bg-muted rounded-lg px-4 py-2">
                    <div className="flex gap-1">
                      <span className="animate-bounce">.</span>
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      >
                        .
                      </span>
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      >
                        .
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          const message = visibleMessages[virtualRow.index];
          const isLastAssistantMessage =
            message.role === "assistant" && message.id === lastMessage?.id;

          return (
            <div
              key={message.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 right-0"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className={`flex gap-3 py-2 ${
                  message.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm shrink-0">
                  {message.role === "user" ? "You" : "🐷"}
                </div>
                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <MessageContent
                    message={message}
                    showToolCalls={showToolCalls}
                  />
                  {isLastAssistantMessage && showStreamingDelay && (
                    <span className="inline-flex text-muted-foreground ml-1">
                      <span className="animate-ellipsis-1">.</span>
                      <span className="animate-ellipsis-2">.</span>
                      <span className="animate-ellipsis-3">.</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
