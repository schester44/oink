// apps/gateway/src/plugins/adapters/telegram/formatting.ts

/**
 * Convert standard markdown to Telegram MarkdownV2 format.
 * Telegram requires escaping special characters outside code blocks.
 */

const SPECIAL_CHARS = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];

function escapeMarkdownV2(text: string): string {
  let result = '';
  let inCodeBlock = false;
  let inInlineCode = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i]!;
    const nextChar = text[i + 1];
    const nextNextChar = text[i + 2];

    // Check for code block start/end
    if (char === '`' && nextChar === '`' && nextNextChar === '`') {
      inCodeBlock = !inCodeBlock;
      result += '```';
      i += 3;
      continue;
    }

    // Check for inline code start/end
    if (char === '`' && !inCodeBlock) {
      inInlineCode = !inInlineCode;
      result += '`';
      i++;
      continue;
    }

    // Don't escape inside code blocks or inline code
    if (inCodeBlock || inInlineCode) {
      result += char;
      i++;
      continue;
    }

    // Escape special characters
    if (SPECIAL_CHARS.includes(char)) {
      result += '\\' + char;
    } else {
      result += char;
    }
    i++;
  }

  return result;
}

/**
 * Truncate text to Telegram's message limit (4096 chars).
 * Tries to break at sentence boundaries.
 */
function truncateText(text: string, maxLength: number = 4096): string {
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength - 20);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');

  const breakPoint = Math.max(lastPeriod, lastNewline);

  if (breakPoint > maxLength / 2) {
    return text.slice(0, breakPoint + 1) + '\n\n[Message truncated]';
  }

  return truncated + '...\n\n[Message truncated]';
}

export function formatForTelegram(text: string): string {
  const escaped = escapeMarkdownV2(text);
  return truncateText(escaped);
}

/**
 * Split long messages into chunks for Telegram.
 */
export function splitMessage(text: string, maxLength: number = 4096): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let breakPoint = remaining.lastIndexOf('\n\n', maxLength);
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf('\n', maxLength);
    }
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf('. ', maxLength);
    }
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = maxLength;
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trim();
  }

  return chunks;
}
