import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestorationBehavior: "auto",
    scrollRestoration: true,
    defaultErrorComponent: ({ error }) => (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-lg border bg-card p-8 text-card-foreground shadow-sm">
          <h1 className="text-2xl font-bold text-destructive">Error</h1>
          <p className="mt-2 text-muted-foreground">{error.message}</p>
        </div>
      </div>
    ),
    defaultNotFoundComponent: () => (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold">404</h1>
          <p className="mt-2 text-muted-foreground">
            The page you're looking for doesn't exist.
          </p>
        </div>
      </div>
    ),
  });
}
