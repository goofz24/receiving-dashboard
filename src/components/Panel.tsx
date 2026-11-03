import type { ReactNode } from "react";

// A card with a title, a one-line description, the content, and the
// exact SQL that produced it (hidden until you open it).
export function Panel({ title, description, sql, children, wide = false }: {
  title: string; description: string; sql?: string; children: ReactNode; wide?: boolean;
}) {
  return (
    <section className={wide ? "panel panel-wide" : "panel"}>
      <h2>{title}</h2>
      <p className="panel-desc">{description}</p>
      {children}
      {sql && (
        <details className="sql">
          <summary>Show the SQL</summary>
          <pre><code>{sql}</code></pre>
        </details>
      )}
    </section>
  );
}
