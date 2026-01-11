import { diffLines, Change } from "diff";

interface DiffViewerProps {
  oldText: string;
  newText: string;
  fileName?: string;
}

interface PreformattedDiffProps {
  diff: string;
  fileName?: string;
}

/**
 * Renders a preformatted diff string from pi-coding-agent's edit tool.
 * Format example:
 *    ...
 * 12 - **What to call them:** Steve
 * 13 - **Pronouns:** _(optional)_
 * +14 - **Email:** steve@example.com
 * 14 - **Family:** Wife Theresa
 *    ...
 */
export function PreformattedDiff({ diff, fileName }: PreformattedDiffProps) {
  const lines = diff.split("\n");

  return (
    <div className="rounded border border-border overflow-hidden text-xs font-mono">
      {fileName && (
        <div className="bg-muted/50 px-3 py-1.5 border-b border-border text-muted-foreground truncate">
          {fileName}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => {
              // Detect line type based on prefix
              const isAdded = line.startsWith("+");
              const isRemoved = line.match(/^\s*\d+\s*-/) !== null && !line.startsWith("+");
              const isContext = line.startsWith("   ...");
              
              // Parse line number if present
              const lineNumMatch = line.match(/^[+\s]*(\d+)/);
              const lineNum = lineNumMatch ? lineNumMatch[1] : "";
              
              // Get content after line number
              const content = line.replace(/^[+\s]*\d*\s?/, "");

              return (
                <tr
                  key={idx}
                  className={
                    isAdded
                      ? "bg-green-950/20"
                      : isContext
                        ? "bg-muted/30"
                        : ""
                  }
                >
                  {/* Line number */}
                  <td className="w-10 px-2 py-0 text-right text-muted-foreground/50 select-none border-r border-border/50 align-top">
                    {!isContext ? lineNum : ""}
                  </td>
                  {/* Change indicator */}
                  <td
                    className={`w-6 px-1 py-0 text-center select-none align-top ${
                      isAdded
                        ? "text-green-500"
                        : isContext
                          ? "text-muted-foreground/30"
                          : "text-muted-foreground/50"
                    }`}
                  >
                    {isAdded ? "+" : isContext ? "…" : " "}
                  </td>
                  {/* Content */}
                  <td className="px-2 py-0 whitespace-pre-wrap break-all align-top">
                    <span
                      className={
                        isAdded
                          ? "text-green-500"
                          : isContext
                            ? "text-muted-foreground/50"
                            : ""
                      }
                    >
                      {isContext ? "..." : content || " "}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DiffViewer({ oldText, newText, fileName }: DiffViewerProps) {
  const changes = diffLines(oldText, newText);

  // Calculate line numbers for each side
  let oldLineNum = 1;
  let newLineNum = 1;

  const lines: Array<{
    type: "unchanged" | "removed" | "added";
    content: string;
    oldLineNum?: number;
    newLineNum?: number;
  }> = [];

  changes.forEach((change: Change) => {
    const changeLines = change.value.split("\n");

    // Remove last empty line from split if the string ends with newline
    if (changeLines[changeLines.length - 1] === "") {
      changeLines.pop();
    }

    changeLines.forEach((line) => {
      if (change.added) {
        lines.push({
          type: "added",
          content: line,
          newLineNum: newLineNum++,
        });
      } else if (change.removed) {
        lines.push({
          type: "removed",
          content: line,
          oldLineNum: oldLineNum++,
        });
      } else {
        lines.push({
          type: "unchanged",
          content: line,
          oldLineNum: oldLineNum++,
          newLineNum: newLineNum++,
        });
      }
    });
  });

  return (
    <div className="rounded border border-border overflow-hidden text-xs font-mono">
      {fileName && (
        <div className="bg-muted/50 px-3 py-1.5 border-b border-border text-muted-foreground">
          {fileName}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr
                key={idx}
                className={
                  line.type === "added"
                    ? "bg-green-950/10"
                    : line.type === "removed"
                      ? "bg-red-950/10"
                      : ""
                }
              >
                {/* Old line number */}
                <td className="w-10 px-2 py-0 text-right text-muted-foreground/50 select-none border-r border-border/50 align-top">
                  {line.type !== "added" ? line.oldLineNum : ""}
                </td>
                {/* New line number */}
                <td className="w-10 px-2 py-0 text-right text-muted-foreground/50 select-none border-r border-border/50 align-top">
                  {line.type !== "removed" ? line.newLineNum : ""}
                </td>
                {/* Change indicator */}
                <td
                  className={`w-6 px-1 py-0 text-center select-none align-top ${
                    line.type === "added"
                      ? "text-green-700"
                      : line.type === "removed"
                        ? "text-red-700"
                        : "text-muted-foreground/30"
                  }`}
                >
                  {line.type === "added"
                    ? "+"
                    : line.type === "removed"
                      ? "-"
                      : " "}
                </td>
                {/* Content */}
                <td className="px-2 py-0 whitespace-pre-wrap break-all align-top">
                  <span
                    className={
                      line.type === "added"
                        ? "text-green-700"
                        : line.type === "removed"
                          ? "text-red-700"
                          : ""
                    }
                  >
                    {line.content || " "}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FileContentViewerProps {
  content: string;
  fileName?: string;
  label?: string;
}

/**
 * Renders file/command output content with line numbers
 */
export function FileContentViewer({ content, fileName, label }: FileContentViewerProps) {
  const lines = content.split("\n");
  // Remove trailing empty line if content ends with newline
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  const header = fileName || label;

  return (
    <div className="mt-2 rounded border border-border overflow-hidden text-xs font-mono">
      {header && (
        <div className="bg-muted/50 px-3 py-1.5 border-b border-border text-muted-foreground truncate">
          {label ? <span className="text-muted-foreground/70">$ </span> : null}
          {header}
        </div>
      )}
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-muted/30">
                {/* Line number */}
                <td className="w-10 px-2 py-0 text-right text-muted-foreground/50 select-none border-r border-border/50 align-top">
                  {idx + 1}
                </td>
                {/* Content */}
                <td className="px-2 py-0 whitespace-pre-wrap break-all align-top">
                  {line || " "}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-muted/30 px-3 py-1 border-t border-border text-muted-foreground/70 text-[10px]">
        {lines.length} lines
      </div>
    </div>
  );
}
