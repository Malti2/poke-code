/** Compactly render a tool call's arguments for a single status line. */
export function formatToolCall(name: string, input: Record<string, unknown>): string {
  const parts = Object.entries(input).map(([k, v]) => {
    let val: string;
    if (typeof v === "string") {
      const oneLine = v.replace(/\s+/g, " ").trim();
      val = oneLine.length > 60 ? `"${oneLine.slice(0, 57)}…"` : `"${oneLine}"`;
    } else {
      val = JSON.stringify(v);
    }
    return `${k}=${val}`;
  });
  return `${name}(${parts.join(", ")})`;
}

/** Trim long tool output to a few lines for inline display. */
export function previewOutput(output: string, maxLines = 6): string {
  const lines = output.split("\n");
  if (lines.length <= maxLines) return output;
  return lines.slice(0, maxLines).join("\n") + `\n… (+${lines.length - maxLines} more lines)`;
}
