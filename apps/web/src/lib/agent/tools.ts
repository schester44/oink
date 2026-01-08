import { config } from "@/lib/config";
import { createBashTool } from "./tools/bash";
import { createFindTool } from "./tools/find";
import { createGrepTool } from "./tools/grep";

export function createTools() {
  const { workspaceDir } = config;

  return {
    bash: createBashTool({ workspaceDir }),
    find: createFindTool({ workspaceDir }),
    grep: createGrepTool({ workspaceDir }),
  };
}
