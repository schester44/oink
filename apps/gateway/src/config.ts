import {
  config,
  createConfig,
  getInstanceDir as getInstanceDirWithConfig,
  getTasksDir as getTasksDirWithConfig,
  getActiveTasksDir as getActiveTasksDirWithConfig,
  getArchiveTasksDir as getArchiveTasksDirWithConfig,
  getBrainDir as getBrainDirWithConfig,
  ensureInstanceDirs as ensureInstanceDirsWithConfig,
  type GatewayConfig,
} from "./lib/config.js";

export { config, createConfig, type GatewayConfig };

export const DEFAULT_INSTANCE_ID = config.defaultInstance;

// Simplified API that uses the default config
export function getInstanceDir(instance: string): string {
  return getInstanceDirWithConfig(config, instance);
}

export function getTasksDir(instance: string): string {
  return getTasksDirWithConfig(config, instance);
}

export function getActiveTasksDir(instance: string): string {
  return getActiveTasksDirWithConfig(config, instance);
}

export function getArchiveTasksDir(instance: string): string {
  return getArchiveTasksDirWithConfig(config, instance);
}

export function getBrainDir(instance: string): string {
  return getBrainDirWithConfig(config, instance);
}

export function getWorkspaceDir(instanceId: string): string {
  return getBrainDir(instanceId);
}

export function ensureInstanceDirs(instance: string): void {
  ensureInstanceDirsWithConfig(config, instance);
}
