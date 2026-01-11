import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

let server: ReturnType<typeof createServer> | null = null;

export async function startTRPCServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Handle CORS preflight
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();

        return;
      }

      // Only handle /trpc routes
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      if (!url.pathname.startsWith("/trpc")) {
        res.writeHead(404);
        res.end("Not found");

        return;
      }

      try {
        // Convert Node request to Fetch API Request
        const body = await collectBody(req);
        const headers = new Headers();

        for (const [key, value] of Object.entries(req.headers)) {
          if (value) {
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          }
        }

        const fetchRequest = new Request(url.toString(), {
          method: req.method,
          headers,
          body:
            req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
        });

        const response = await fetchRequestHandler({
          endpoint: "/trpc",
          req: fetchRequest,
          router: appRouter,
          createContext: () => createContext(req),
        });

        // Convert Fetch API Response back to Node response
        res.writeHead(response.status, Object.fromEntries(response.headers));
        const responseBody = await response.text();
        res.end(responseBody);
      } catch (error) {
        logger.error({ error }, "tRPC request error");
        res.writeHead(500);
        res.end("Internal server error");
      }
    });

    server.listen(config.trpcPort, () => {
      logger.info({ port: config.trpcPort }, "tRPC server started");
      resolve();
    });

    server.on("error", (error) => {
      logger.error({ error }, "tRPC server error");
      reject(error);
    });
  });
}

export async function stopTRPCServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      // Force close all connections (Node 18.2+)
      server.closeAllConnections?.();

      server.close(() => {
        logger.info("tRPC server stopped");
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
