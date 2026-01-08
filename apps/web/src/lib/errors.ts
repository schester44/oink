const isDev = process.env.NODE_ENV === "development";

export class AppError extends Error {
  constructor(
    public kind: "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "INTERNAL",
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
  }

  get type(): string {
    return this.data.type as string;
  }
}

export function toHttpError(err: unknown): {
  status: number;
  body: { error: string; details: Record<string, unknown> };
} {
  if (err instanceof AppError) {
    const status =
      err.kind === "VALIDATION"
        ? 400
        : err.kind === "NOT_FOUND"
          ? 404
          : err.kind === "CONFLICT"
            ? 409
            : 500;

    return {
      status,
      body: {
        error: err.message,
        details: {
          code: err.type,
          ...err.data,
          ...((isDev && { __dev__: err }) || {}),
        },
      },
    };
  }

  const message = err instanceof Error ? err.message : "Internal server error";

  return {
    status: 500,
    body: {
      error: message,
      details: {
        code: "INTERNAL_ERROR",
        ...((isDev && { __dev__: err }) || {}),
      },
    },
  };
}
