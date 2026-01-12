import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  getPluginsServerFn,
  updatePluginServerFn,
  updateTranscriptionServerFn,
  updateTTSServerFn,
  type PluginsConfig,
  type TranscriptionConfig,
  type TTSConfig,
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

// ElevenLabs voice options
const elevenLabsVoices = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Default)" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will - Relaxed Optimist" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica - Playful" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam - Confident" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian - Deep & Comforting" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel - British Broadcaster" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily - British Actress" },
];

function PluginsPage() {
  const route = getRouteApi("/_authed/config/plugins");
  const { pluginsConfig: initialConfig } = route.useLoaderData();
  const [pluginsConfig, setPluginsConfig] = useState<PluginsConfig>(initialConfig);
  const [saving, setSaving] = useState<string | null>(null);

  // Local state for TTS form
  const [ttsConfig, setTtsConfig] = useState<TTSConfig>(
    pluginsConfig.tts || {
      enabled: false,
      provider: "auto",
      voiceReplyOnly: true,
    }
  );

  // Local state for Transcription form
  const [transcriptionConfig, setTranscriptionConfig] = useState<TranscriptionConfig>(
    pluginsConfig.transcription || {
      provider: "auto",
    }
  );

  const handleToggle = async (pluginId: string, enabled: boolean) => {
    setSaving(pluginId);
    try {
      const updated = await updatePluginServerFn({ data: { pluginId, enabled } });
      setPluginsConfig(updated);
    } finally {
      setSaving(null);
    }
  };

  const handleSaveTranscription = async () => {
    setSaving("transcription");
    try {
      const updated = await updateTranscriptionServerFn({ data: transcriptionConfig });
      setPluginsConfig(updated);
    } finally {
      setSaving(null);
    }
  };

  const handleSaveTTS = async () => {
    setSaving("tts");
    try {
      const updated = await updateTTSServerFn({ data: ttsConfig });
      setPluginsConfig(updated);
    } finally {
      setSaving(null);
    }
  };

  const pluginIds = Object.keys(pluginsConfig.plugins);

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Plugins</h1>
        <p className="text-muted-foreground text-sm mb-4">
          Manage messaging plugins and media services. Changes require a gateway restart.
        </p>
      </div>

      {/* Messaging Plugins */}
      <section>
        <h2 className="text-lg font-medium mb-3">Messaging Plugins</h2>
        <div className="space-y-3">
          {pluginIds.length === 0 ? (
            <p className="text-muted-foreground">No plugins configured.</p>
          ) : (
            pluginIds.map((pluginId) => {
              const plugin = pluginsConfig.plugins[pluginId];
              if (!plugin) return null;

              const info = pluginInfo[pluginId] || { name: pluginId, description: "" };

              return (
                <div
                  key={pluginId}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-0.5">
                    <Label htmlFor={`plugin-${pluginId}`} className="text-base font-medium cursor-pointer">
                      {info.name}
                    </Label>
                    {info.description && (
                      <p className="text-sm text-muted-foreground">{info.description}</p>
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
      </section>

      {/* Transcription Settings */}
      <section>
        <h2 className="text-lg font-medium mb-3">Speech-to-Text (Transcription)</h2>
        <div className="rounded-lg border p-4 space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={transcriptionConfig?.provider || "auto"}
              onValueChange={(value) =>
                setTranscriptionConfig((prev) => ({
                  ...prev,
                  provider: value as "auto" | "local-whisper" | "openai-whisper",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (prefer local)</SelectItem>
                <SelectItem value="local-whisper">Local Whisper (whisper.cpp)</SelectItem>
                <SelectItem value="openai-whisper">OpenAI Whisper API</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Local whisper requires whisper-cpp installed (brew install whisper-cpp)
            </p>
          </div>

          {(transcriptionConfig?.provider === "local-whisper" || transcriptionConfig?.provider === "auto") && (
            <div className="space-y-2">
              <Label>Model Size</Label>
              <Select
                value={transcriptionConfig?.localWhisper?.modelSize || "base.en"}
                onValueChange={(value) =>
                  setTranscriptionConfig((prev) => ({
                    ...prev,
                    localWhisper: {
                      ...prev?.localWhisper,
                      modelSize: value as any,
                    },
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tiny.en">Tiny (English) - 75MB, fastest</SelectItem>
                  <SelectItem value="base.en">Base (English) - 148MB, good balance</SelectItem>
                  <SelectItem value="small.en">Small (English) - 488MB, better accuracy</SelectItem>
                  <SelectItem value="medium.en">Medium (English) - 1.5GB, high accuracy</SelectItem>
                  <SelectItem value="large">Large (Multilingual) - 3GB, best</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={handleSaveTranscription} disabled={saving === "transcription"}>
            {saving === "transcription" ? "Saving..." : "Save Transcription Settings"}
          </Button>
        </div>
      </section>

      {/* TTS Settings */}
      <section>
        <h2 className="text-lg font-medium mb-3">Text-to-Speech (TTS)</h2>
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="tts-enabled" className="text-base">Enable TTS</Label>
              <p className="text-sm text-muted-foreground">Reply with voice messages</p>
            </div>
            <Switch
              id="tts-enabled"
              checked={ttsConfig?.enabled || false}
              onCheckedChange={(checked) =>
                setTtsConfig((prev) => ({ ...prev!, enabled: checked }))
              }
            />
          </div>

          {ttsConfig?.enabled && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="voice-reply-only">Voice Reply Only</Label>
                  <p className="text-sm text-muted-foreground">
                    Only reply with voice when user sends voice
                  </p>
                </div>
                <Switch
                  id="voice-reply-only"
                  checked={ttsConfig?.voiceReplyOnly ?? true}
                  onCheckedChange={(checked) =>
                    setTtsConfig((prev) => ({ ...prev!, voiceReplyOnly: checked }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={ttsConfig?.provider || "auto"}
                  onValueChange={(value) =>
                    setTtsConfig((prev) => ({
                      ...prev!,
                      provider: value as "auto" | "elevenlabs" | "openai",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (prefer ElevenLabs)</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                    <SelectItem value="openai">OpenAI TTS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(ttsConfig?.provider === "elevenlabs" || ttsConfig?.provider === "auto") && (
                <>
                  <div className="space-y-2">
                    <Label>ElevenLabs API Key</Label>
                    <Input
                      type="password"
                      placeholder="${ELEVENLABS_API_KEY} or enter key"
                      value={ttsConfig?.elevenlabs?.apiKey || ""}
                      onChange={(e) =>
                        setTtsConfig((prev) => ({
                          ...prev!,
                          elevenlabs: { ...prev?.elevenlabs, apiKey: e.target.value },
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Get your API key at elevenlabs.io. Use ${"{ELEVENLABS_API_KEY}"} to read from env.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Voice</Label>
                    <Select
                      value={ttsConfig?.elevenlabs?.voiceId || "21m00Tcm4TlvDq8ikWAM"}
                      onValueChange={(value) =>
                        setTtsConfig((prev) => ({
                          ...prev!,
                          elevenlabs: { ...prev?.elevenlabs, voiceId: value },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {elevenLabsVoices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Stability: {(ttsConfig?.elevenlabs?.stability ?? 0.5).toFixed(2)}</Label>
                    <Slider
                      value={[ttsConfig?.elevenlabs?.stability ?? 0.5]}
                      onValueChange={([value]) =>
                        setTtsConfig((prev) => ({
                          ...prev!,
                          elevenlabs: { ...prev?.elevenlabs, stability: value },
                        }))
                      }
                      min={0}
                      max={1}
                      step={0.05}
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower = more expressive/varied, Higher = more consistent
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Similarity Boost: {(ttsConfig?.elevenlabs?.similarityBoost ?? 0.75).toFixed(2)}</Label>
                    <Slider
                      value={[ttsConfig?.elevenlabs?.similarityBoost ?? 0.75]}
                      onValueChange={([value]) =>
                        setTtsConfig((prev) => ({
                          ...prev!,
                          elevenlabs: { ...prev?.elevenlabs, similarityBoost: value },
                        }))
                      }
                      min={0}
                      max={1}
                      step={0.05}
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher = closer to original voice, Lower = more variation
                    </p>
                  </div>
                </>
              )}

              {ttsConfig?.provider === "openai" && (
                <>
                  <div className="space-y-2">
                    <Label>Voice</Label>
                    <Select
                      value={ttsConfig?.openai?.voice || "nova"}
                      onValueChange={(value) =>
                        setTtsConfig((prev) => ({
                          ...prev!,
                          openai: { ...prev?.openai, voice: value as any },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alloy">Alloy</SelectItem>
                        <SelectItem value="echo">Echo</SelectItem>
                        <SelectItem value="fable">Fable</SelectItem>
                        <SelectItem value="onyx">Onyx</SelectItem>
                        <SelectItem value="nova">Nova</SelectItem>
                        <SelectItem value="shimmer">Shimmer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select
                      value={ttsConfig?.openai?.model || "tts-1"}
                      onValueChange={(value) =>
                        setTtsConfig((prev) => ({
                          ...prev!,
                          openai: { ...prev?.openai, model: value as any },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tts-1">TTS-1 (faster)</SelectItem>
                        <SelectItem value="tts-1-hd">TTS-1-HD (higher quality)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </>
          )}

          <Button onClick={handleSaveTTS} disabled={saving === "tts"}>
            {saving === "tts" ? "Saving..." : "Save TTS Settings"}
          </Button>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        Note: You'll need to restart the gateway for changes to take effect.
      </p>
    </div>
  );
}
