import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app")({
  component: AppPage,
});

function AppPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">Oink</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Your AI Personal Assistant with scheduling superpowers.
        </p>
        <div className="mt-8 rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">
            Gateway is ready. Start building your assistant here.
          </p>
        </div>
      </div>
    </div>
  );
}
