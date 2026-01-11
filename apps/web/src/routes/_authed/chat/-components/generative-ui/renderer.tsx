/**
 * Generative UI Renderer
 *
 * Renders the appropriate component based on the generative UI type.
 * Import modules to register their matchers.
 */

import { matchGenerativeUI, type ToolPart } from "./index";
import { WeatherCard } from "../weather-card";
import { ImageCard } from "../image-card";
import type { WeatherData } from "./weather";
import type { ImageData } from "./image";

// Import to trigger registration
import "./weather";
import "./image";
import { JSX } from "react";

interface GenerativeUIRendererProps {
  part: ToolPart;
}

/**
 * Renders generative UI for a tool part if a match is found.
 * Returns null if no generative UI applies.
 */
export function GenerativeUIRenderer({
  part,
}: GenerativeUIRendererProps): JSX.Element | null {
  const match = matchGenerativeUI(part);

  if (!match) {
    return null;
  }

  switch (match.type) {
    case "weather":
      return <WeatherCard data={match.data as WeatherData} />;

    case "image":
      return <ImageCard data={match.data as ImageData} />;

    default:
      return null;
  }
}

/**
 * Check if a tool part should render as generative UI
 */
export function shouldRenderAsGenerativeUI(part: ToolPart): boolean {
  return matchGenerativeUI(part) !== null;
}
