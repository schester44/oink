import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getPluginsServerFn,
  updatePluginServerFn,
  type PluginsConfig,
} from "@/lib/plugins";

export const Route = createFileRoute("/_authed/config/plugins")({
  component: PluginsPage,
  loader: async () => {
    const pluginsConfig = await getPluginsServerFn();

    return { pluginsConfig };
  },
});

// Plugin display info
const pluginInfo: Record<string, { name: string; description: string }> = {
  websocket: {
    name: "WebSocket",
    description: "Real-time communication for the web interface",
  },
  telegram: {
    name: "Telegram",
    description: "Chat with Pinky via Telegram bot",
  },
};

function PluginsPage() {
  const route = getRouteApi("/_authed/config/plugins");
  const { pluginsConfig: initialConfig } = route.useLoaderData();
  const [pluginsConfig, setPluginsConfig] =
    useState<PluginsConfig>(initialConfig);
  const [saving, setSaving] = useState<string | null>(null);

  const handleToggle = async (pluginId: string, enabled: boolean) => {
    setSaving(pluginId);
    try {
      const updated = await updatePluginServerFn({
        data: { pluginId, enabled },
      });
      setPluginsConfig(updated);
    } finally {
      setSaving(null);
    }
  };

  const pluginIds = Object.keys(pluginsConfig.plugins);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-2">Plugins</h1>

      <div className="space-y-4 max-w-lg">
        {pluginIds.length === 0 ? (
          <p className="text-muted-foreground">No plugins configured.</p>
        ) : (
          pluginIds.map((pluginId) => {
            const plugin = pluginsConfig.plugins[pluginId];
            if (!plugin) return null;

            const info = pluginInfo[pluginId] || {
              name: pluginId,
              description: "",
            };

            return (
              <div
                key={pluginId}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="space-y-0.5">
                  <Label
                    htmlFor={`plugin-${pluginId}`}
                    className="text-base font-medium cursor-pointer"
                  >
                    {info.name}
                  </Label>
                  {info.description && (
                    <p className="text-sm text-muted-foreground">
                      {info.description}
                    </p>
                  )}
                </div>
                <Switch
                  id={`plugin-${pluginId}`}
                  checked={plugin.enabled}
                  onCheckedChange={(checked) => handleToggle(pluginId, checked)}
                  disabled={saving === pluginId}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
