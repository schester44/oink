// apps/gateway/src/plugins/registry.ts

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { eventBus } from "./event-bus.js";
import type { MessagePlugin, PluginsConfig, PluginConfig } from "./types.js";

const ENV_VAR_PATTERN = /\$\{(\w+)\}/g;

function resolveEnvVars<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(ENV_VAR_PATTERN, (_, key) => {
      const envValue = process.env[key];
      if (envValue === undefined) {
        logger.warn({ key }, "Environment variable not found");
        return "";
      }
      return envValue;
    }) as T;
  }
  if (Array.isArray(value)) {
    return value.map(resolveEnvVars) as T;
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveEnvVars(v)])
    ) as T;
  }
  return value;
}

class PluginRegistry {
  private plugins = new Map<string, MessagePlugin>();
  private configPath: string;

  constructor() {
    this.configPath = join(config.dataDir, "plugins.json");
  }

  async loadFromConfig(): Promise<void> {
    if (!existsSync(this.configPath)) {
      logger.info({ path: this.configPath }, "No plugins config found, using defaults");
      return;
    }

    try {
      const raw = readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(raw) as PluginsConfig;
      const pluginsConfig = resolveEnvVars(parsed);

      for (const [id, settings] of Object.entries(pluginsConfig.plugins)) {
        if (!settings.enabled) {
          logger.debug({ pluginId: id }, "Plugin disabled, skipping");
          continue;
        }

        await this.loadPlugin(id, settings);
      }
    } catch (error) {
      logger.error({ error, path: this.configPath }, "Failed to load plugins config");
      throw error;
    }
  }

  private async loadPlugin(id: string, settings: PluginConfig): Promise<void> {
    // Validate plugin ID to prevent path traversal attacks
    if (!/^[\w-]+$/.test(id)) {
      throw new Error(`Invalid plugin id: ${id}`);
    }

    try {
      const adapterModule = await import(`./adapters/${id}/index.js`);
      const plugin = adapterModule.create(settings, eventBus);
      this.plugins.set(id, plugin);
      logger.info({ pluginId: id }, "Plugin loaded");
    } catch (error) {
      logger.error({ error, pluginId: id }, "Failed to load plugin");
      throw error;
    }
  }

  async startAll(): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      try {
        await plugin.start();
        logger.info({ pluginId: id }, "Plugin started");
      } catch (error) {
        logger.error({ error, pluginId: id }, "Failed to start plugin");
        throw error;
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      try {
        await plugin.stop();
        logger.info({ pluginId: id }, "Plugin stopped");
      } catch (error) {
        logger.error({ error, pluginId: id }, "Failed to stop plugin");
      }
    }
  }

  get(id: string): MessagePlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): MessagePlugin[] {
    return Array.from(this.plugins.values());
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }
}

export const pluginRegistry = new PluginRegistry();
