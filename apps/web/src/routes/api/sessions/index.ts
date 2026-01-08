import { createAPIFileRoute } from "@tanstack/react-start/api";
import { SessionManager } from "../../../lib/session";

export const APIRoute = createAPIFileRoute("/api/sessions")({
  GET: async () => {
    const sessions = SessionManager.listSessions();
    return Response.json(sessions);
  },
});
