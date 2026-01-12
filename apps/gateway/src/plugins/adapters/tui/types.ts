// apps/gateway/src/plugins/adapters/tui/types.ts

import type { PluginConfig } from "../../types.js";

export interface TUIPluginConfig extends PluginConfig {
  instanceId?: string;
}
