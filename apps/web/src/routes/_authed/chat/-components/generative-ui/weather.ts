/**
 * Weather Generative UI
 *
 * Detects weather API calls (wttr.in) and provides structured weather data
 * for rendering as a WeatherCard component.
 */

import { registerGenerativeUI, type ToolPart } from "./index";

// Weather data structure
export interface WeatherData {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  condition: string;
  visibility: number;
  uvIndex: number;
  unit: "F" | "C";
}

/**
 * Check if a tool part is a weather API call
 */
function isWeatherCommand(part: ToolPart): boolean {
  if (part.type !== "tool-bash") return false;
  const input = part.input as { command?: string } | undefined;
  if (!input?.command) return false;
  const cmd = String(input.command);

  return cmd.includes("wttr.in") && cmd.includes("format=j1");
}

/**
 * Parse wttr.in JSON response into WeatherData
 */
function parseWttrResponse(json: unknown): WeatherData | null {
  try {
    const data = json as {
      current_condition?: Array<{
        temp_F?: string;
        temp_C?: string;
        FeelsLikeF?: string;
        FeelsLikeC?: string;
        humidity?: string;
        windspeedMiles?: string;
        windspeedKmph?: string;
        winddir16Point?: string;
        weatherDesc?: Array<{ value?: string }>;
        visibility?: string;
        visibilityMiles?: string;
        uvIndex?: string;
      }>;
      nearest_area?: Array<{
        areaName?: Array<{ value?: string }>;
        region?: Array<{ value?: string }>;
        country?: Array<{ value?: string }>;
      }>;
    };

    if (!data.current_condition?.[0]) return null;

    const current = data.current_condition[0];
    const area = data.nearest_area?.[0];

    // Determine location name
    const areaName = area?.areaName?.[0]?.value || "Unknown";
    const region = area?.region?.[0]?.value;
    const location = region ? `${areaName}, ${region}` : areaName;

    // Prefer Fahrenheit for US locations, otherwise Celsius
    const isUS = area?.country?.[0]?.value?.includes("United States");
    const unit = isUS ? "F" : "C";

    return {
      location,
      temperature: parseInt(
        unit === "F" ? current.temp_F || "0" : current.temp_C || "0",
        10,
      ),
      feelsLike: parseInt(
        unit === "F" ? current.FeelsLikeF || "0" : current.FeelsLikeC || "0",
        10,
      ),
      humidity: parseInt(current.humidity || "0", 10),
      windSpeed: parseInt(
        unit === "F"
          ? current.windspeedMiles || "0"
          : current.windspeedKmph || "0",
        10,
      ),
      windDirection: current.winddir16Point || "",
      condition: current.weatherDesc?.[0]?.value || "Unknown",
      visibility: parseInt(
        unit === "F"
          ? current.visibilityMiles || "0"
          : current.visibility || "0",
        10,
      ),
      uvIndex: parseInt(current.uvIndex || "0", 10),
      unit,
    };
  } catch {
    return null;
  }
}

/**
 * Extract weather JSON from bash tool output
 */
function parseWeatherFromOutput(part: ToolPart): WeatherData | null {
  const output = part.output;
  if (!output || typeof output !== "object") return null;

  const o = output as { content?: Array<{ type?: string; text?: string }> };
  if (!Array.isArray(o.content)) return null;

  const textPart = o.content.find((c) => c.type === "text" && c.text);
  if (!textPart?.text) return null;

  try {
    const json = JSON.parse(textPart.text);

    if (json.current_condition && json.nearest_area) {
      return parseWttrResponse(json);
    }
  } catch {
    // Not JSON or not weather data
  }

  return null;
}

// Register the weather generative UI
registerGenerativeUI({
  type: "weather",
  matches: isWeatherCommand,
  parse: parseWeatherFromOutput,
});
