export type SessionEventType =
  | "session"
  | "message"
  | "model_change"
  | "compaction";

export type MessageRole = "user" | "assistant" | "system";

// Message part types matching AI SDK UI message format
export interface TextPart {
  type: "text";
  text: string;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  state?: "pending" | "output-available" | "error";
}

export interface StepStartPart {
  type: "step-start";
}

export type MessagePart = TextPart | ToolCallPart | StepStartPart;

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
  content?: string; // Legacy simple text content
  parts?: MessagePart[]; // Structured parts (preferred)
}

export interface ModelChangeEvent extends BaseSessionEvent {
  type: "model_change";
  model: string;
  previousModel?: string;
}

export interface CompactionEvent extends BaseSessionEvent {
  type: "compaction";
  compactedIds: string[];
  summary: string;
}

export type SessionLine =
  | SessionEvent
  | MessageEvent
  | ModelChangeEvent
  | CompactionEvent;

export interface SessionState {
  sessionId: string;
  leafId: string;
  filePath: string;
}
