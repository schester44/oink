import { DiffViewer, PreformattedDiff, FileContentViewer } from "./diff-viewer";

function formatOutput(value: unknown): string {
  if (typeof value === "string") {
    // Try to parse as JSON for pretty formatting
    try {
      const parsed = JSON.parse(value);

      return JSON.stringify(parsed, null, 2);
    } catch {
      // Not JSON, return as-is (preserves line breaks)
      return value;
    }
  }

  return JSON.stringify(value, null, 2);
}

// Check if output has a preformatted diff (from pi-coding-agent edit tool)
function hasPreformattedDiff(
  output: unknown,
): output is { content: Array<{ type: string; text: string }>; details: { diff: string; firstChangedLine?: number } } {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  if (!o.details || typeof o.details !== "object") return false;
  const details = o.details as Record<string, unknown>;
  return typeof details.diff === "string";
}

// Check if output is from read/bash tool (has content array with text)
function isTextContentOutput(
  toolName: string,
  output: unknown,
): output is { content: Array<{ type: string; text: string }> } {
  if (toolName !== "read" && toolName !== "bash") return false;
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;
  if (!Array.isArray(o.content)) return false;
  const content = o.content as Array<unknown>;
  return content.length > 0 && 
    typeof content[0] === "object" && 
    content[0] !== null &&
    "text" in content[0];
}

function OutputBlock({
  label,
  content,
  variant = "default",
}: {
  label: string;
  content: string;
  variant?: "default" | "stdout" | "stderr";
}) {
  const bgClass = {
    default: "bg-muted/30",
    stdout: "bg-green-950/20 border-green-900/30",
    stderr: "bg-red-950/20 border-red-900/30",
  }[variant];

  const labelClass = {
    default: "text-muted-foreground",
    stdout: "text-green-600",
    stderr: "text-red-500",
  }[variant];

  return (
    <div className={`mt-2 rounded border p-2 ${bgClass}`}>
      <span className={`text-[10px] uppercase tracking-wide ${labelClass}`}>
        {label}
      </span>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">
        {content}
      </pre>
    </div>
  );
}

// Check if input is an edit tool with diffable content
function isEditWithDiff(
  toolName: string,
  input?: Record<string, unknown>,
): input is { path?: string; oldText: string; newText: string } {
  if (toolName !== "edit") return false;
  if (!input) return false;
  return (
    typeof input.oldText === "string" && typeof input.newText === "string"
  );
}

export function ToolCallDisplay({
  part,
}: {
  part: {
    type: string; // "tool-{toolName}"
    toolCallId?: string;
    state?: "call" | "partial-call" | "output-available" | "result";
    input?: Record<string, unknown>;
    output?: unknown;
  };
}) {
  // Extract tool name from type (e.g., "tool-bash" -> "bash")
  const toolName = part.type.startsWith("tool-")
    ? part.type.slice(5)
    : part.type;
  const isComplete =
    part.state === "output-available" || part.state === "result";

  // Check if this is an edit tool with diff content
  const showDiff = isEditWithDiff(toolName, part.input);

  // Check if output has stdout/stderr
  const output = part.output as Record<string, unknown> | undefined;
  const hasStdout = Boolean(
    output && typeof output === "object" && "stdout" in output && output.stdout,
  );
  const hasStderr = Boolean(
    output && typeof output === "object" && "stderr" in output && output.stderr,
  );
  const hasStdStreams = hasStdout || hasStderr;

  return (
    <div className="my-2 rounded border border-border bg-muted/50 p-3 text-xs font-mono">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-muted-foreground">Tool:</span>
        <span className="font-semibold">{toolName}</span>
        {isComplete && <span className="text-green-600 text-xs">✓</span>}
      </div>
      {part.input !== undefined ? (
        showDiff ? (
          <div className="mb-2">
            <DiffViewer
              oldText={part.input.oldText as string}
              newText={part.input.newText as string}
              fileName={part.input.path as string | undefined}
            />
          </div>
        ) : (
          <details className="mb-2">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Input
            </summary>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">
              {formatOutput(part.input)}
            </pre>
          </details>
        )
      ) : null}
      {part.output !== undefined ? (
        hasPreformattedDiff(part.output) ? (
          // Edit tool with preformatted diff from pi-coding-agent
          <div className="mt-2">
            <div className="text-muted-foreground text-xs mb-1">
              {part.output.content?.[0]?.text}
            </div>
            <PreformattedDiff
              diff={part.output.details.diff}
              fileName={part.input?.path as string | undefined}
            />
          </div>
        ) : isTextContentOutput(toolName, part.output) ? (
          // Read/bash tool with text content
          <FileContentViewer
            content={part.output.content[0]?.text ?? ""}
            fileName={toolName === "read" ? (part.input?.path as string | undefined) : undefined}
            label={toolName === "bash" ? (part.input?.command as string | undefined) : undefined}
          />
        ) : (
          <details open>
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Output
            </summary>
            {hasStdStreams && output ? (
              <div className="space-y-2">
                {hasStdout && (
                  <OutputBlock
                    label="stdout"
                    content={formatOutput(output.stdout as string)}
                    variant="stdout"
                  />
                )}
                {hasStderr && (
                  <OutputBlock
                    label="stderr"
                    content={formatOutput(output.stderr as string)}
                    variant="stderr"
                  />
                )}
                {(() => {
                  const rest = Object.fromEntries(
                    Object.entries(output).filter(
                      ([key]) => key !== "stdout" && key !== "stderr",
                    ),
                  );

                  if (Object.keys(rest).length > 0) {
                    return (
                      <OutputBlock
                        label="other"
                        content={formatOutput(rest)}
                        variant="default"
                      />
                    );
                  }

                  return null;
                })()}
              </div>
            ) : (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">
                {formatOutput(part.output)}
              </pre>
            )}
          </details>
        )
      ) : null}
    </div>
  );
}
