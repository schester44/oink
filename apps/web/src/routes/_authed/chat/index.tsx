import {
  createFileRoute,
  getRouteApi,
  useNavigate,
  Link,
} from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { useRef, useState, useEffect, useMemo } from "react";
import { Bug, Send, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageContent,
  hasVisibleContent,
} from "./-components/message-content";
import {
  getShowToolCallsServerFn,
  setShowToolCallsServerFn,
} from "@/lib/tool-calls";
import {
  getSessionsServerFn,
  getSessionServerFn,
  type SessionInfo,
} from "@/lib/sessions";
import { getMetricsServerFn } from "@/entities/telemetry/actions/get-metrics";
import { MetricsWidget } from "./-components/metrics-widget";
import { InstanceTabs } from "./-components/instance-tabs";
import {
  getInstancesServerFn,
  createInstanceServerFn,
  renameInstanceServerFn,
  deleteInstanceServerFn,
  type Instance,
} from "@/lib/instances";
import {
  getWebSocketTransport,
  type ScheduledTaskNotification,
} from "@/lib/websocket-transport";

const DEFAULT_INSTANCE_ID = "default";

export const Route = createFileRoute("/_authed/chat/")({
  component: ChatPage,
  validateSearch: (search) => ({
    sessionId: (search.sessionId as string) || undefined,
    instance: (search.instance as string) || undefined,
  }),
  loader: async ({ location }) => {
    const searchParams = new URLSearchParams(location.search);
    const instanceId = searchParams.get("instance") || DEFAULT_INSTANCE_ID;

    const [showToolCalls, sessions, metrics, instances] = await Promise.all([
      getShowToolCallsServerFn(),
      getSessionsServerFn({ data: { instanceId } }),
      getMetricsServerFn(),
      getInstancesServerFn(),
    ]);

    return { showToolCalls, sessions, metrics, instances, instanceId };
  },
});

function ChatPage() {
  const route = getRouteApi("/_authed/chat/");
  const { sessionId: urlSessionId, instance: urlInstance } = route.useSearch();
  const {
    showToolCalls: initialShowToolCalls,
    sessions: initialSessions,
    metrics: initialMetrics,
    instances: initialInstances,
    instanceId: loaderInstanceId,
  } = route.useLoaderData();
  const sessionId = urlSessionId || "main";
  const instanceId = urlInstance || loaderInstanceId;

  const [instances, setInstances] = useState<Instance[]>(initialInstances);
  const [sessions, setSessions] = useState<SessionInfo[]>(initialSessions);

  // Track last selected session per instance (page session only)
  const sessionPerInstance = useRef<Map<string, string>>(new Map());

  // Remember current session for current instance
  useEffect(() => {
    if (sessionId && instanceId) {
      sessionPerInstance.current.set(instanceId, sessionId);
    }
  }, [sessionId, instanceId]);

  // Sync sessions when instance changes (via navigation)
  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions]);

  // Sync instances when they change (via navigation/reload)
  useEffect(() => {
    setInstances(initialInstances);
  }, [initialInstances]);

  const navigate = useNavigate();

  const [input, setInput] = useState("");
  const [showToolCalls, setShowToolCalls] = useState(initialShowToolCalls);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showStreamingDelay, setShowStreamingDelay] = useState(false);
  const [metrics, setMetrics] = useState(initialMetrics);

  const toggleToolCalls = () => {
    const next = !showToolCalls;
    setShowToolCalls(next);
    setShowToolCallsServerFn({ data: next });
  };

  // Create WebSocket transport - memoized to maintain connection
  const transport = useMemo(
    () =>
      getWebSocketTransport({
        gatewayUrl: "ws://localhost:4445",
        instanceId,
        sessionId,
      }),
    [instanceId, sessionId],
  );

  // Update transport when instanceId or sessionId changes
  useEffect(() => {
    transport.setInstanceId(instanceId);
    transport.setSessionId(sessionId);
  }, [transport, instanceId, sessionId]);

  const { messages, sendMessage, status, setMessages } = useChat({
    id: sessionId,
    transport,
    onFinish: () => {
      getMetricsServerFn().then(setMetrics);
    },
  });

  // Connect transport and set up scheduled task handler
  useEffect(() => {
    // Connect to receive scheduled task notifications
    transport.connect().catch(console.error);

    // Handler to inject scheduled task results as assistant messages
    const handleScheduledTask = (notification: ScheduledTaskNotification) => {
      // Only handle notifications for the current instance
      if (notification.instance !== instanceId) return;

      const newMessage = {
        id: `scheduled-${notification.taskId}-${Date.now()}`,
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: notification.output }],
      };

      setMessages((prev) => [...prev, newMessage]);
    };

    transport.onScheduledTask(handleScheduledTask);

    return () => {
      transport.onScheduledTask(null);
    };
  }, [transport, instanceId, setMessages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isLoading = status === "streaming" || status === "submitted";
  console.log("🪵 isLoading", isLoading);

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
      getSessionServerFn({ data: { sessionId, instanceId } })
        .then((messages) => {
          if (messages && messages.length > 0) {
            // Messages are already in UI format with parts
            const uiMessages = messages.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant" | "system",
              parts: m.parts,
            }));
            setMessages(uiMessages);
          }
        })
        .catch(console.error)
        .finally(() => setIsInitialLoad(false));
    }
  }, [sessionId, instanceId, setMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (!input && inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [input]);

  // Show streaming delay indicator only when there's a pause in the stream
  useEffect(() => {
    if (status !== "streaming") {
      setShowStreamingDelay(false);

      return;
    }

    // Hide immediately when new content arrives
    setShowStreamingDelay(false);

    // Show after 250ms delay if still streaming
    const timer = setTimeout(() => {
      setShowStreamingDelay(true);
    }, 250);

    return () => clearTimeout(timer);
  }, [status, messages]);

  const startNewSession = () => {
    setMessages([]);
    setInput("");

    navigate({
      to: "/chat",
      search: { instance: instanceId, sessionId: crypto.randomUUID() },
    });
  };

  const handleSelectInstance = (newInstanceId: string) => {
    setMessages([]);

    // Restore last session for this instance, if any
    const lastSessionId = sessionPerInstance.current.get(newInstanceId);

    navigate({
      to: "/chat",
      search: { instance: newInstanceId, sessionId: lastSessionId },
    });
  };

  const handleCreateInstance = async (name: string) => {
    const newInstance = await createInstanceServerFn({ data: { name } });
    setInstances([...instances, newInstance]);
    handleSelectInstance(newInstance.id);
  };

  const handleRenameInstance = async (id: string, name: string) => {
    await renameInstanceServerFn({ data: { id, name } });
    setInstances(instances.map((i) => (i.id === id ? { ...i, name } : i)));
  };

  const handleDeleteInstance = async (id: string) => {
    await deleteInstanceServerFn({ data: { id } });
    setInstances(instances.filter((i) => i.id !== id));
    if (instanceId === id) {
      handleSelectInstance(DEFAULT_INSTANCE_ID);
    }
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <InstanceTabs
        instances={instances}
        activeInstanceId={instanceId}
        onSelect={handleSelectInstance}
        onCreate={handleCreateInstance}
        onRename={handleRenameInstance}
        onDelete={handleDeleteInstance}
      />
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐷</span>
          <h1 className="text-lg font-semibold">Pinky</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={sessionId}
            onValueChange={(value) => {
              setMessages([]);

              navigate({
                to: "/chat",
                search: { instance: instanceId, sessionId: value },
              });
            }}
          >
            <SelectTrigger className="w-50">
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
          <MetricsWidget metrics={metrics} />
          <Button
            variant={showToolCalls ? "default" : "outline"}
            size="sm"
            onClick={toggleToolCalls}
            title={showToolCalls ? "Hide debug info" : "Show debug info"}
          >
            <Bug className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={startNewSession}>
            New Chat
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/config/gateway">
              <Settings className="h-4 w-4" />
            </Link>
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
                  .filter(
                    (message) =>
                      message.role === "user" ||
                      hasVisibleContent(message, showToolCalls),
                  )
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
                        {message.role === "assistant" &&
                          message.id === lastMessage?.id &&
                          showStreamingDelay && (
                            <span className="inline-flex text-muted-foreground ml-1">
                              <span className="animate-ellipsis-1">.</span>
                              <span className="animate-ellipsis-2">.</span>
                              <span className="animate-ellipsis-3">.</span>
                            </span>
                          )}
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
            <div className="flex flex-col gap-1 max-w-3xl mx-auto">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Auto-resize
                    e.target.style.height = "auto";

                    e.target.style.height =
                      Math.min(200, e.target.scrollHeight) + "px";
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none min-h-10 max-h-50 overflow-y-auto"
                />
                <Button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
