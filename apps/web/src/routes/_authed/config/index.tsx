import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/config/")({
  beforeLoad: () => {
    throw redirect({ to: "/config/gateway" });
  },
});
