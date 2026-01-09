import { config } from "@/lib/config";
import { createBashTool } from "./tools/bash";
import { createFindTool } from "./tools/find";
import { createGrepTool } from "./tools/grep";
import { createSessionTool } from "./tools/session";
import type { SessionManager } from "@/lib/session";

interface CreateToolsOptions {
  session?: SessionManager;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  additionalTools?: Record<string, any>;
}

export function createTools(opts?: CreateToolsOptions) {
  const { workspaceDir } = config;

  return {
    bash: createBashTool({
      workspaceDir,
    }),
    find: createFindTool({
      workspaceDir,
    }),
    grep: createGrepTool({
      workspaceDir,
    }),
    ...(opts?.session && {
      updateSessionName: createSessionTool({ session: opts.session }),
    }),
    ...opts?.additionalTools,
  };
}
