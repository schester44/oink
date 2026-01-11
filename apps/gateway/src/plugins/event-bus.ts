// apps/gateway/src/plugins/event-bus.ts

import { EventEmitter } from "events";
import type { PluginEventMap } from "./types.js";

class TypedEventEmitter<T extends Record<string, any>> {
  private emitter = new EventEmitter();

  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.on(event as string, listener);
    return this;
  }

  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.off(event as string, listener);
    return this;
  }

  emit<K extends keyof T>(event: K, data: T[K]): boolean {
    return this.emitter.emit(event as string, data);
  }

  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): this {
    this.emitter.once(event as string, listener);
    return this;
  }

  removeAllListeners<K extends keyof T>(event?: K): this {
    this.emitter.removeAllListeners(event as string);
    return this;
  }
}

export const eventBus = new TypedEventEmitter<PluginEventMap>();
