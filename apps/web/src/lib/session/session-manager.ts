import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "fs";
import { join, dirname } from "path";
import type {
  SessionLine,
  SessionEvent,
  MessageEvent,
  ModelChangeEvent,
  MessageRole,
  SessionState,
} from "./types";

const SESSIONS_DIR = join(process.cwd(), "data/sessions");

function generateId(): string {
  return crypto.randomUUID();
}

function timestamp(): string {
  return new Date().toISOString();
}

function getCwd(): string {
  return process.cwd();
}

export class SessionManager {
  private state: SessionState;

  constructor(sessionId?: string) {
    if (sessionId) {
      this.state = this.loadSession(sessionId);
    } else {
      this.state = this.createSession();
    }
  }

  private ensureDir(filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private appendLine(line: SessionLine): void {
    this.ensureDir(this.state.filePath);
    appendFileSync(this.state.filePath, JSON.stringify(line) + "\n");
  }

  private createSession(title?: string): SessionState {
    const sessionId = generateId();
    const filePath = join(SESSIONS_DIR, `${sessionId}.jsonl`);

    const sessionEvent: SessionEvent = {
      type: "session",
      id: sessionId,
      timestamp: timestamp(),
      cwd: getCwd(),
      title,
    };

    const state: SessionState = {
      sessionId,
      leafId: sessionId,
      filePath,
    };

    this.state = state;
    this.appendLine(sessionEvent);

    return state;
  }

  private loadSession(sessionId: string): SessionState {
    const filePath = join(SESSIONS_DIR, `${sessionId}.jsonl`);

    if (!existsSync(filePath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const fileContent = readFileSync(filePath, "utf-8");
    const trimmedContent = fileContent?.trim() ?? "";

    if (!trimmedContent) {
      throw new Error(`Session file is empty: ${sessionId}`);
    }

    const lines = trimmedContent
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as SessionLine);

    // Find the leaf (last message in the chain)
    const lastLine = lines[lines.length - 1];
    const leafId = lastLine ? lastLine.id : sessionId;

    return {
      sessionId,
      leafId,
      filePath,
    };
  }

  get sessionId(): string {
    return this.state.sessionId;
  }

  get leafId(): string {
    return this.state.leafId;
  }

  appendMessage(role: MessageRole, content: string): MessageEvent {
    const event: MessageEvent = {
      type: "message",
      id: generateId(),
      timestamp: timestamp(),
      cwd: getCwd(),
      parentId: this.state.leafId,
      role,
      content,
    };

    this.appendLine(event);
    this.state.leafId = event.id;

    return event;
  }

  appendModelChange(model: string, previousModel?: string): ModelChangeEvent {
    const event: ModelChangeEvent = {
      type: "model_change",
      id: generateId(),
      timestamp: timestamp(),
      cwd: getCwd(),
      parentId: this.state.leafId,
      model,
      previousModel,
    };

    this.appendLine(event);
    this.state.leafId = event.id;

    return event;
  }

  getMessages(): MessageEvent[] {
    if (!existsSync(this.state.filePath)) {
      return [];
    }

    const fileContent = readFileSync(this.state.filePath, "utf-8");
    const trimmedContent = fileContent?.trim() ?? "";

    if (!trimmedContent) {
      return [];
    }

    const lines = trimmedContent
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as SessionLine);

    return lines.filter(
      (line): line is MessageEvent => line.type === "message",
    );
  }

  static listSessions(): { id: string; title?: string; timestamp: string }[] {
    if (!existsSync(SESSIONS_DIR)) {
      return [];
    }

    const files = readdirSync(SESSIONS_DIR) as string[];

    return files
      .filter((f: string) => f.endsWith(".jsonl"))
      .map((f: string) => {
        try {
          const filePath = join(SESSIONS_DIR, f);
          const fileContent = readFileSync(filePath, "utf-8");
          const firstLine = fileContent?.split("\n")[0]?.trim();
          if (!firstLine) return null;
          const session = JSON.parse(firstLine) as SessionEvent;
          return {
            id: session.id,
            title: session.title,
            timestamp: session.timestamp,
          };
        } catch {
          return null;
        }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
}
