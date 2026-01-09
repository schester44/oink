import {
  createFileRoute,
  getRouteApi,
  useNavigate,
} from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useState, useEffect } from "react";
import { Send, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageContent, hasVisibleContent } from "./-components/message-content";
import {
  getShowToolCallsServerFn,
  setShowToolCallsServerFn,
} from "@/lib/tool-calls";
import { getSessionsServerFn } from "@/lib/sessions";

export const Route = createFileRoute("/_authed/chat/")({
  component: ChatPage,
  validateSearch: (search) => ({
    sessionId: (search.sessionId as string) || undefined,
  }),
  loader: async () => {
    const [showToolCalls, sessions] = await Promise.all([
      getShowToolCallsServerFn(),
      getSessionsServerFn(),
    ]);

    return { showToolCalls, sessions };
  },
});

function ChatPage() {
  const route = getRouteApi("/_authed/chat/");
  const { sessionId: urlSessionId } = route.useSearch();
  const { showToolCalls: initialShowToolCalls, sessions } =
    route.useLoaderData();
  const sessionId = urlSessionId || "main";

  const navigate = useNavigate();

  const [input, setInput] = useState("");
  const [showToolCalls, setShowToolCalls] = useState(initialShowToolCalls);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const toggleToolCalls = () => {
    const next = !showToolCalls;
    setShowToolCalls(next);
    setShowToolCallsServerFn({ data: next });
  };

  const { messages, sendMessage, status, setMessages } = useChat({
    id: sessionId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest({ messages, id }) {
        return {
          body: {
            sessionId,
            message: messages[messages.length - 1],
            id,
          },
        };
      },
    }),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLoading = status === "streaming" || status === "submitted";

  // Check if the last assistant message has any text content yet
  const lastMessage = messages[messages.length - 1];
  const lastAssistantHasContent =
    lastMessage?.role === "assistant" &&
    lastMessage.parts?.some(
      (p: { type: string; text?: string }) => p.type === "text" && p.text,
    );
  const showLoadingIndicator = isLoading && !lastAssistantHasContent;

  // Load existing session messages
  useEffect(() => {
    if (sessionId) {
      fetch(`/api/sessions/${sessionId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) {
            // Messages are already in UI format with parts
            const uiMessages = data.messages.map(
              (m: {
                id: string;
                role: string;
                parts: Array<{ type: string; [key: string]: unknown }>;
              }) => ({
                id: m.id,
                role: m.role as "user" | "assistant" | "system",
                parts: m.parts,
              }),
            );
            setMessages(uiMessages);
          }
        })
        .catch(console.error)
        .finally(() => setIsInitialLoad(false));
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
      to: "/chat",
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
          <h1 className="text-lg font-semibold">Oinko</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={sessionId}
            onValueChange={(value) => {
              setMessages([]);

              navigate({
                to: "/chat",
                search: { sessionId: value },
              });
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {session.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={showToolCalls ? "default" : "outline"}
            size="sm"
            onClick={toggleToolCalls}
            title={showToolCalls ? "Hide tool calls" : "Show tool calls"}
          >
            <Wrench className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={startNewSession}>
            New Chat
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && !isInitialLoad ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="text-6xl mb-4">🐷</span>
                <h2 className="text-xl font-semibold">Hey there!</h2>
                <p className="text-muted-foreground mt-2 max-w-md">
                  I'm your personal assistant. Ask me anything, set reminders,
                  or just chat.
                </p>
              </div>
            ) : messages.length > 0 ? (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages
                  .filter((message) => message.role === "user" || hasVisibleContent(message, showToolCalls))
                  .map((message) => (
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
                      <MessageContent
                        message={message}
                        showToolCalls={showToolCalls}
                      />
                    </div>
                  </div>
                ))}
                {showLoadingIndicator && (
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
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-6xl animate-bounce">🐽</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t p-4">
            <div className="flex gap-2 max-w-3xl mx-auto">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
