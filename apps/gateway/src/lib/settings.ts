import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { config } from "../config.js";
import type { UserSettings } from "@oink/trpc";

function getUserDir(): string {
  return join(config.dataDir, "user");
}

function getSettingsPath(): string {
  return join(getUserDir(), "config.json");
}

const defaultSettings: UserSettings = {
  timezone: "UTC",
};

export function readSettings(): UserSettings {
  const settingsPath = getSettingsPath();

  if (existsSync(settingsPath)) {
    const content = readFileSync(settingsPath, "utf-8");
    return { ...defaultSettings, ...JSON.parse(content) };
  }

  return defaultSettings;
}

export function writeSettings(settings: UserSettings): void {
  const userDir = getUserDir();

  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }

  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}
