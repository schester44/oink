import { createFileRoute } from "@tanstack/react-router";
import { SessionManager } from "../../../lib/session";
import { DEFAULT_INSTANCE_ID } from "@/lib/config";

export const Route = createFileRoute("/api/sessions/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const instanceId = url.searchParams.get("instanceId") || DEFAULT_INSTANCE_ID;
        const sessions = SessionManager.listSessions(instanceId);

        return Response.json(sessions);
      },
    },
  },
});
