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

  return (
    <div className="my-2 rounded border border-border bg-muted/50 p-3 text-xs font-mono">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-muted-foreground">Tool:</span>
        <span className="font-semibold">{toolName}</span>
        {isComplete && <span className="text-green-600 text-xs">✓</span>}
      </div>
      {part.input !== undefined ? (
        <details className="mb-2">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Input
          </summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">
            {String(JSON.stringify(part.input, null, 2))}
          </pre>
        </details>
      ) : null}
      {part.output !== undefined ? (
        <details open>
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Output
          </summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">
            {String(JSON.stringify(part.output, null, 2))}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
