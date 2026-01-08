import { createStart } from "@tanstack/react-start";
import { errorHandlingMiddleware } from "./middleware/errors";

export const startInstance = createStart(() => ({
  requestMiddleware: [errorHandlingMiddleware],
}));
