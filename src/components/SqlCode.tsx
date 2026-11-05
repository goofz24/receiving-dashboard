// Simple SQL coloring for the code panels. Escapes the text first, so it is
// safe to put into the page as HTML even when the SQL came from the AI.
const KEYWORDS = /\b(select|from|join|left|cross|on|where|group|by|order|and|or|in|is|not|null|as|sum|count|distinct|filter|coalesce|least|round|nullif|limit|having|desc|asc|case|when|then|else|end|between|interval|date_trunc|generate_series|current_date|with|extract|abs)\b/gi;

export function highlightSql(sql: string) {
  const esc = sql.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return esc
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      const code = i >= 0 ? line.slice(0, i) : line;
      const comment = i >= 0 ? `<span class="c">${line.slice(i)}</span>` : "";
      const colored = code
        .replace(/(&#39;[^&]*?&#39;)/g, '<span class="s">$1</span>')
        .replace(KEYWORDS, '<span class="k">$1</span>')
        .replace(/(?<![#\w])(\d+(?:\.\d+)?)\b/g, '<span class="n">$1</span>'); // skips the 39 in &#39;
      return colored + comment;
    })
    .join("\n");
}
