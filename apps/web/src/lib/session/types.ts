export type SessionEventType =
  | "session"
  | "message"
  | "model_change"
  | "compaction";

export type MessageRole = "user" | "assistant" | "system";

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
  content: string;
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
