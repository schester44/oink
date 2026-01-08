import { toHttpError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createMiddleware, json } from "@tanstack/react-start";

export const errorHandlingMiddleware = createMiddleware({
  type: "request",
}).server(async ({ next }) => {
  try {
    const response = await next();

    return response;
  } catch (error) {
    logger.error({ msg: "Unhandled error in request pipeline", error });
    const erro = toHttpError(error);

    throw json(erro.body, { status: erro.status });
  }
});
