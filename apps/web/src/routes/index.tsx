import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  // Redirect to the main app - will be behind auth later
  return <Navigate to="/app" search={{ session: undefined }} />;
}
