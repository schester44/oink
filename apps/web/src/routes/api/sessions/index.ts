import { createFileRoute } from "@tanstack/react-router";
import { SessionManager } from "../../../lib/session";

export const Route = createFileRoute("/api/sessions/")({
  server: {
    handlers: {
      GET: async () => {
        const sessions = SessionManager.listSessions();

        return Response.json(sessions);
      },
    },
  },
});
