/**
 * Image Generative UI
 * 
 * Detects when the read tool returns an image and provides the image data
 * for rendering as an ImageCard component.
 */

import { registerGenerativeUI, type ToolPart } from "./index";

// Image data structure
export interface ImageData {
  data: string;  // base64 encoded image
  mimeType: string;
  path?: string;
  description?: string;
}

/**
 * Check if a tool part is a read tool that returned an image
 */
function isImageReadResult(part: ToolPart): boolean {
  if (part.type !== "tool-read") return false;
  
  const output = part.output as { content?: Array<{ type?: string; data?: string; mimeType?: string }> } | undefined;
  if (!output?.content || !Array.isArray(output.content)) return false;
  
  // Check if any content item is an image
  return output.content.some(c => c.type === "image" && c.data && c.mimeType);
}

/**
 * Extract image data from read tool output
 */
function parseImageFromOutput(part: ToolPart): ImageData | null {
  const output = part.output as { content?: Array<{ type?: string; text?: string; data?: string; mimeType?: string }> } | undefined;
  if (!output?.content || !Array.isArray(output.content)) return null;
  
  // Find the image content
  const imageContent = output.content.find(c => c.type === "image" && c.data && c.mimeType);
  if (!imageContent || imageContent.type !== "image") return null;
  
  // Find any text description (usually "Read image file [mime]")
  const textContent = output.content.find(c => c.type === "text" && c.text);
  
  // Get path from input
  const input = part.input as { path?: string } | undefined;
  
  return {
    data: imageContent.data!,
    mimeType: imageContent.mimeType!,
    path: input?.path,
    description: textContent?.text,
  };
}

// Register the image generative UI
registerGenerativeUI({
  type: "image",
  matches: isImageReadResult,
  parse: parseImageFromOutput,
});
