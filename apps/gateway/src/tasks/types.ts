export interface RecurringSchedule {
  type: "recurring";
  cron: string;
}

export interface OnceSchedule {
  type: "once";
  at: string; // ISO 8601 timestamp
}

export type TaskSchedule = RecurringSchedule | OnceSchedule;

export interface NotificationExecution {
  type: "notification";
  message: string;
}

export interface LLMExecution {
  type: "llm";
  prompt: string;
}

export type TaskExecution = NotificationExecution | LLMExecution;

export interface TaskNotifications {
  channels: string[];
  priority: "normal" | "high";
}

export interface TaskMetadata {
  createdAt: string;
  createdBy: string;
  lastRun: string | null;
  runCount: number;
  lastError: { at: string; message: string } | null;
}

export interface Task {
  id: string;
  instance: string;
  name: string;
  description: string;
  schedule: TaskSchedule;
  execution: TaskExecution;
  notifications: TaskNotifications;
  metadata: TaskMetadata;
  sessionId?: string; // Session to save LLM results to
}

export interface ExecutionResult {
  taskId: string;
  taskName: string;
  instance: string;
  output: string;
  executedAt: string;
  type: "notification" | "llm";
}
