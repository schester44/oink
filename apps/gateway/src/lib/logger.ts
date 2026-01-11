import pino from "pino";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";

function getRepoRoot(): string {
  try {
    const stdout = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
    });

    return stdout.trim();
  } catch {
    return path.resolve(".");
  }
}

if (isDev) {
  const logsDir = join(getRepoRoot(), "logs");

  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
}

export const logger = pino(
  {
    base: {
      service: "pinky-gateway",
    },
    level: process.env.LOG_LEVEL || "debug",
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  },
  isDev
    ? pino.multistream([
        {
          level: "debug",
          stream: pino.transport({
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss Z",
              sync: true,
            },
          }),
        },
        {
          level: "debug",
          stream: pino.destination({
            dest: join(getRepoRoot(), "logs", "gateway.log"),
            sync: false,
          }),
        },
      ])
    : pino.destination(1),
);
