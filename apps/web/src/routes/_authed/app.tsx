import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { useRef, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/app")({
  component: AppPage,
  validateSearch: (search: Record<string, unknown>) => ({
    session: (search.session as string) || undefined,
  }),
});

function AppPage() {
  const { session: initialSessionId } = useSearch({ from: "/_authed/app" });
  const [sessionId, setSessionId] = useState<string | undefined>(
    initialSessionId,
  );

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
  } = useChat({
    api: "/api/chat",
    body: { sessionId },
    onResponse: (response) => {
      const newSessionId = response.headers.get("X-Session-Id");
      if (newSessionId && !sessionId) {
        setSessionId(newSessionId);
        // Update URL without navigation
        window.history.replaceState({}, "", `/app?session=${newSessionId}`);
      }
    },
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load existing session messages
  useEffect(() => {
    if (initialSessionId) {
      fetch(`/api/sessions/${initialSessionId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) {
            setMessages(data.messages);
          }
        })
        .catch(console.error);
    }
  }, [initialSessionId, setMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startNewSession = () => {
    setSessionId(undefined);
    setMessages([]);
    window.history.replaceState({}, "", "/app");
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
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
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
                onChange={handleInputChange}
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
