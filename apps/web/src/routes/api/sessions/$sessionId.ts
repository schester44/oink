import { createAPIFileRoute } from "@tanstack/react-start/api";
import { SessionManager } from "../../../lib/session";

export const APIRoute = createAPIFileRoute("/api/sessions/$sessionId")({
  GET: async ({ params }) => {
    try {
      const session = new SessionManager(params.sessionId);
      const messages = session.getMessages();
      return Response.json({
        sessionId: session.sessionId,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })),
      });
    } catch (error) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
  },
});
