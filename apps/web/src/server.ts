import handler, { type ServerEntry } from "@tanstack/react-start/server-entry";

// Gateway tRPC URL - server-side only
const GATEWAY_TRPC_URL =
  process.env.GATEWAY_TRPC_URL || "http://localhost:4446/trpc";

async function proxyToGateway(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Extract the tRPC path from the URL
  const trpcPath = url.pathname.replace("/api/trpc", "");

  // Build the gateway URL
  const gatewayUrl = new URL(GATEWAY_TRPC_URL + trpcPath);

  // Copy query params
  url.searchParams.forEach((value, key) => {
    gatewayUrl.searchParams.set(key, value);
  });

  try {
    const response = await fetch(gatewayUrl.toString(), {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: request.method !== "GET" ? await request.text() : undefined,
    });

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Failed to proxy to gateway:", error);

    return new Response(
      JSON.stringify({
        error: {
          message: "Failed to connect to gateway",
          code: "GATEWAY_UNREACHABLE",
        },
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}

export default {
  fetch(request) {
    const url = new URL(request.url);

    // Handle tRPC proxy requests
    if (url.pathname.startsWith("/api/trpc")) {
      return proxyToGateway(request);
    }

    return handler.fetch(request);
  },
} satisfies ServerEntry;
