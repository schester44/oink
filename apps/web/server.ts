import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { toNodeHandler } from "srvx/node";
import type { NodeHttp1Handler } from "srvx";

const DEVELOPMENT = process.env.NODE_ENV === "development";
const PORT = Number.parseInt(process.env.PORT || "4444");

const app = express();
const server = createServer(app);

export const io = new Server(server, {
  path: "/ws",
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("join", (room: string) => {
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

if (DEVELOPMENT) {
  const viteDevServer = await import("vite").then((vite) =>
    vite.createServer({
      server: { middlewareMode: true },
    }),
  );

  app.use(viteDevServer.middlewares);

  app.use(async (req, res, next) => {
    try {
      const { default: serverEntry } =
        await viteDevServer.ssrLoadModule("./src/server.ts");
      const handler = toNodeHandler(serverEntry.fetch) as NodeHttp1Handler;
      await handler(req, res);
    } catch (error) {
      if (typeof error === "object" && error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error);
      }
      next(error);
    }
  });
} else {
  const { default: handler } = await import("./dist/server/server.js");
  const nodeHandler = toNodeHandler(handler.fetch) as NodeHttp1Handler;

  app.use(async (req, res, next) => {
    try {
      await nodeHandler(req, res);
    } catch (error) {
      next(error);
    }
  });
}

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
