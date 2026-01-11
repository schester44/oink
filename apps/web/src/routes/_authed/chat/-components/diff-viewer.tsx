import { diffLines, Change } from "diff";

interface DiffViewerProps {
  oldText: string;
  newText: string;
  fileName?: string;
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
