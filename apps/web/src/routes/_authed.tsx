import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

function AuthedLayout() {
  // Auth check will go here later
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  );
}
