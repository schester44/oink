/**
 * Generative UI Registry
 * q
 * This module provides a registry for "generative UI" components that render
 * special visualizations for certain tool outputs. Instead of showing raw
 * JSON or text, these components provide rich, interactive UI.
 *
 * Currently, generative UI is detected by pattern matching on tool inputs/outputs.
 * In the future, this could be driven by CustomEntry from the session format.
 */

export interface GenerativeUIMatch {
  /** Unique identifier for this generative UI type */
  type: string;
  /** Check if a tool part matches this generative UI */
  matches: (part: ToolPart) => boolean;
  /** Parse the tool output into structured data, returns null if parsing fails */
  parse: (part: ToolPart) => unknown | null;
}

export interface ToolPart {
  type: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  state?: string;
}

// Registry of generative UI matchers
const registry: GenerativeUIMatch[] = [];

/**
 * Register a new generative UI matcher
 */
export function registerGenerativeUI(matcher: GenerativeUIMatch): void {
  registry.push(matcher);
}

/**
 * Find a matching generative UI for a tool part
 * Returns the matcher and parsed data, or null if no match
 */
export function matchGenerativeUI(
  part: ToolPart,
): { type: string; data: unknown } | null {
  for (const matcher of registry) {
    if (matcher.matches(part)) {
      const data = matcher.parse(part);

      if (data !== null) {
        return { type: matcher.type, data };
      }
    }
  }

  return null;
}

/**
 * Check if a tool part has any generative UI match
 */
export function hasGenerativeUI(part: ToolPart): boolean {
  return registry.some((matcher) => matcher.matches(part));
}
