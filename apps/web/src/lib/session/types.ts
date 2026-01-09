export type SessionEventType = "session" | "message";

export type MessageRole = "user" | "assistant" | "system";

// UI message part types (matching useChat format)
export interface TextPart {
  type: "text";
  text: string;
  state?: "streaming" | "done";
}

export interface StepStartPart {
  type: "step-start";
}

export interface ToolPart {
  type: string; // "tool-{toolName}" e.g. "tool-bash"
  toolCallId: string;
  state: "call" | "partial-call" | "output-available" | "result";
  input?: Record<string, unknown>;
  output?: unknown;
}

export type UIMessagePart = TextPart | StepStartPart | ToolPart;

export interface BaseSessionEvent {
  type: SessionEventType;
  id: string;
  timestamp: string;
  cwd: string;
  parentId?: string;
}

export interface SessionEvent extends BaseSessionEvent {
  type: "session";
  title?: string;
}

export interface MessageEvent extends BaseSessionEvent {
  type: "message";
  role: MessageRole;
  parts: UIMessagePart[];
}

export type SessionLine = SessionEvent | MessageEvent;

export interface SessionState {
  sessionId: string;
  leafId: string;
  filePath: string;
}
