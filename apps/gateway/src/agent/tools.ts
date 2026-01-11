import { getWorkspaceDir, DEFAULT_INSTANCE_ID } from "../config.js";
import { createBashTool } from "./tools/bash.js";
import { createCronTool } from "./tools/cron.js";
import { createEditTool } from "./tools/edit.js";
import { createFindTool } from "./tools/find.js";
import { createGrepTool } from "./tools/grep.js";
import { createSessionTool } from "./tools/session.js";
import type { SessionManager } from "../session/index.js";

interface CreateToolsOptions {
  session?: SessionManager;
  instanceId?: string;
  /** The source channel/plugin for notification routing (e.g., "telegram", "websocket") */
  sourceChannel?: string;
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
    cron: createCronTool({
      instanceId,
      sourceChannel: opts?.sourceChannel,
    }),
    edit: createEditTool({
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
