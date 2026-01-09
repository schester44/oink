import { createServerFn } from "@tanstack/react-start";
import { SessionManager } from "./session";

export const getSessionsServerFn = createServerFn().handler(async () => {
  return SessionManager.listSessions();
});
