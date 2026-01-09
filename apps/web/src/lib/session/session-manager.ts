import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join, dirname } from "path";
import type {
  SessionLine,
  SessionEvent,
  MessageEvent,
  MessageRole,
  SessionState,
} from "./types";

const SESSIONS_DIR = join(process.cwd(), "src/brain/sessions");

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

  private createSession(sessionId?: string, title?: string): SessionState {
    const id = sessionId || generateId();
    const sessionDir = join(SESSIONS_DIR, id);
    const filePath = join(sessionDir, "log.jsonl");
    const metaPath = join(sessionDir, "meta.json");

    const sessionEvent: SessionEvent = {
      type: "session",
      id,
      timestamp: timestamp(),
      cwd: getCwd(),
      title,
    };

    const state: SessionState = {
      sessionId: id,
      leafId: id,
      filePath,
    };

    this.state = state;
    this.appendLine(sessionEvent);

    // Write meta.json with session metadata
    const meta = { name: id };
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    return state;
  }

  private loadSession(sessionId: string): SessionState {
    const filePath = join(SESSIONS_DIR, sessionId, "log.jsonl");

    if (!existsSync(filePath)) {
      // Create session with the given ID if it doesn't exist
      return this.createSession(sessionId);
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

  appendMessage(role: MessageRole, text: string): MessageEvent {
    const event: MessageEvent = {
      type: "message",
      id: generateId(),
      timestamp: timestamp(),
      cwd: getCwd(),
      parentId: this.state.leafId,
      role,
      content: [{ type: "text", text }],
    };

    this.appendLine(event);
    this.state.leafId = event.id;

    return event;
  }

  appendStructuredMessage(
    role: MessageRole,
    parts: UIMessagePart[],
  ): MessageEvent {
    const event: MessageEvent = {
      type: "message",
      id: generateId(),
      timestamp: timestamp(),
      cwd: getCwd(),
      parentId: this.state.leafId,
      role,
      parts,
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

  updateName(name: string): void {
    const metaPath = join(SESSIONS_DIR, this.state.sessionId, "meta.json");
    const meta = { name };
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  static listSessions(): { id: string; name: string; timestamp: string }[] {
    if (!existsSync(SESSIONS_DIR)) {
      return [];
    }

    const dirs = readdirSync(SESSIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    return dirs
      .map((dir: string) => {
        try {
          const sessionDir = join(SESSIONS_DIR, dir);
          const metaPath = join(sessionDir, "meta.json");
          const logPath = join(sessionDir, "log.jsonl");

          if (!existsSync(logPath)) return null;

          // Get name from meta.json
          let name = dir;

          if (existsSync(metaPath)) {
            const metaContent = readFileSync(metaPath, "utf-8");
            const meta = JSON.parse(metaContent) as { name: string };
            name = meta.name || dir;
          }

          // Get timestamp from first line of log.jsonl
          const logContent = readFileSync(logPath, "utf-8");
          const firstLine = logContent?.split("\n")[0]?.trim();
          if (!firstLine) return null;
          const session = JSON.parse(firstLine) as SessionEvent;

          return {
            id: dir,
            name,
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
