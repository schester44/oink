import {
  createFileRoute,
  getRouteApi,
  useNavigate,
} from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/app")({
  component: AppPage,
  validateSearch: (search) => ({
    sessionId: (search.sessionId as string) || undefined,
  }),
});

// Helper to extract text content from message parts
function getMessageText(message: {
  parts?: Array<{ type: string; text?: string }>;
}): string {
  if (!message.parts) return "";

  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("");
}

// Component to render tool call results
function ToolCallDisplay({ part }: { part: {
  type: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
}}) {
  const toolName = part.toolName || part.type.replace("tool-", "");

  return (
    <div className="my-2 rounded border border-border bg-muted/50 p-3 text-xs font-mono">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-muted-foreground">Tool:</span>
        <span className="font-semibold">{toolName}</span>
        {part.state === "output-available" && (
          <span className="text-green-600 text-xs">✓</span>
        )}
      </div>
      {part.input !== undefined ? (
        <details className="mb-2">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Input
          </summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">
            {String(JSON.stringify(part.input, null, 2))}
          </pre>
        </details>
      ) : null}
      {part.output !== undefined ? (
        <details open>
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Output
          </summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">
            {String(JSON.stringify(part.output, null, 2))}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

// Render message parts including text and tool calls
function MessageContent({ message }: { message: { parts?: Array<{ type: string; text?: string; [key: string]: unknown }> } }) {
  if (!message.parts) return null;

  return (
    <>
      {message.parts.map((part, index) => {
        if (part.type === "text" && part.text) {
          return (
            <p key={index} className="text-sm whitespace-pre-wrap">
              {part.text}
            </p>
          );
        }
        if (part.type === "tool-call" || part.type.startsWith("tool-")) {
          return <ToolCallDisplay key={index} part={part} />;
        }
        // Skip step-start and other internal parts
        return null;
      })}
    </>
  );
}

function AppPage() {
  const route = getRouteApi("/_authed/app");
  const { sessionId: urlSessionId } = route.useSearch();
  const sessionId = urlSessionId || "main";

  const navigate = useNavigate();

  const [input, setInput] = useState("");

  const { messages, sendMessage, status, setMessages } = useChat({
    id: sessionId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
    }),
  });

  console.log("🪵 messages", messages);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "streaming" || status === "submitted";

  // Load existing session messages
  useEffect(() => {
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) {
            // Convert loaded messages to UI message format
            const uiMessages = data.messages.map(
              (m: { id: string; role: string; content?: string; parts?: Array<{ type: string; [key: string]: unknown }> }) => ({
                id: m.id,
                role: m.role as "user" | "assistant" | "system",
                // Use parts if available, otherwise convert content to parts
                parts: m.parts || (m.content ? [{ type: "text" as const, text: m.content }] : []),
              }),
            );
            setMessages(uiMessages);
          }
        })
        .catch(console.error);
    }
  }, [sessionId, setMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startNewSession = () => {
    setMessages([]);
    setInput("");

    navigate({
      to: "/app",
      search: (s) => ({ ...s, sessionId: crypto.randomUUID() }),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      const messageText = input;
      setInput("");

      await sendMessage({
        text: messageText,
      });
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐷</span>
          <h1 className="text-lg font-semibold">Oink</h1>
        </div>
        <Button variant="outline" size="sm" onClick={startNewSession}>
          New Chat
        </Button>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="text-6xl mb-4">🐷</span>
                <h2 className="text-xl font-semibold">Hey there!</h2>
                <p className="text-muted-foreground mt-2 max-w-md">
                  I'm your personal assistant. Ask me anything, set reminders,
                  or just chat.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
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
                      <MessageContent message={message} />
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
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
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t p-4">
            <div className="flex gap-2 max-w-3xl mx-auto">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                disabled={isLoading}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
