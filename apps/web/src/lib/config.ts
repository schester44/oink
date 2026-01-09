import { homedir } from "os";
import { join } from "path";

export const DEFAULT_INSTANCE_ID = "default";

export const config = {
  configDir: join(homedir(), ".oinky"),
  brainsDir: join(process.cwd(), "src/brains"),
};

export function getWorkspaceDir(instanceId: string): string {
  return join(config.brainsDir, instanceId);
}

export function getInstanceDir(instanceId: string): string {
  return join(config.configDir, "instances", instanceId);
}
