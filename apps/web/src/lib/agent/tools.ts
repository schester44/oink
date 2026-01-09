import { getWorkspaceDir, DEFAULT_INSTANCE_ID } from "@/lib/config";
import { createBashTool } from "./tools/bash";
import { createFindTool } from "./tools/find";
import { createGrepTool } from "./tools/grep";
import { createSessionTool } from "./tools/session";
import type { SessionManager } from "@/lib/session";

interface CreateToolsOptions {
  session?: SessionManager;
  instanceId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  additionalTools?: Record<string, any>;
}

export function createTools(opts?: CreateToolsOptions) {
  const instanceId = opts?.instanceId ?? DEFAULT_INSTANCE_ID;
  const workspaceDir = getWorkspaceDir(instanceId);

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
