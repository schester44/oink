// apps/gateway/src/lib/config.ts

import { join } from "path";
import { existsSync, mkdirSync } from "fs";

export interface GatewayConfig {
  dataDir: string;
  defaultInstance: string;
  pollerIntervalMs: number;
  wsPort: number;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function createConfig(): GatewayConfig {
  const dataDir = process.env.GATEWAY_DATA_DIR || join(process.cwd(), "data");

  return {
    dataDir,
    defaultInstance: process.env.GATEWAY_DEFAULT_INSTANCE || "default",
    pollerIntervalMs: parseInt(process.env.GATEWAY_POLLER_INTERVAL_MS || "60000", 10),
    wsPort: parseInt(process.env.GATEWAY_WS_PORT || "3001", 10),
  };
}

export function getInstanceDir(config: GatewayConfig, instance: string): string {
  return join(config.dataDir, "instances", instance);
}

export function getTasksDir(config: GatewayConfig, instance: string): string {
  return join(getInstanceDir(config, instance), "tasks");
}

export function getActiveTasksDir(config: GatewayConfig, instance: string): string {
  return join(getTasksDir(config, instance), "active");
}

export function getArchiveTasksDir(config: GatewayConfig, instance: string): string {
  return join(getTasksDir(config, instance), "archive");
}

export function getBrainDir(config: GatewayConfig, instance: string): string {
  return join(getInstanceDir(config, instance), "brain");
}

export function ensureInstanceDirs(config: GatewayConfig, instance: string): void {
  ensureDir(getActiveTasksDir(config, instance));
  ensureDir(getArchiveTasksDir(config, instance));
  ensureDir(getBrainDir(config, instance));
}

export const config = createConfig();
