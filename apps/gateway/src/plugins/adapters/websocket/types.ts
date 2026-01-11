// apps/gateway/src/plugins/adapters/websocket/types.ts

import type { WebSocketPluginConfig } from "../../types.js";

export interface WebSocketAdapterConfig extends WebSocketPluginConfig {
  port?: number;
}
