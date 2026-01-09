import { createFileRoute } from "@tanstack/react-router";
import { SessionManager } from "../../../lib/session";

export const Route = createFileRoute("/api/sessions/$sessionId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const session = new SessionManager(params.sessionId);
          const messages = session.getMessages();

          return Response.json({
            sessionId: session.sessionId,
            messages: messages.map((m) => ({
              id: m.id,
              role: m.role,
              parts: m.parts,
            })),
          });
        } catch {
          return Response.json({ error: "Session not found" }, { status: 404 });
        }
      },
    },
  },
});
