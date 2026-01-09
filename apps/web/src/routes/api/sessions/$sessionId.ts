import { createFileRoute } from "@tanstack/react-router";
import { SessionManager } from "../../../lib/session";
import { DEFAULT_INSTANCE_ID } from "@/lib/config";

export const Route = createFileRoute("/api/sessions/$sessionId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const url = new URL(request.url);
          const instanceId =
            url.searchParams.get("instanceId") || DEFAULT_INSTANCE_ID;
          const session = new SessionManager({
            sessionId: params.sessionId,
            instanceId,
          });
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
