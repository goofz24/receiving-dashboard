"use client";

import { useState } from "react";
import type { AskResult } from "@/lib/ask";

const EXAMPLES = [
  "Which supplier had the most short lines this month?",
  "Total value received by category in the last 4 weeks",
  "Which products were damaged most often?",
];

export function AskBox({ enabled }: { enabled: boolean }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);

  async function ask(q: string) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
      setResult(await res.json());
    } catch {
      setResult({ kind: "error", message: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <p className="empty">
        The AI box is off. To turn it on, add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart.
        The rest of the dashboard works without it.
      </p>
    );
  }

  return (
    <div className="ask">
      <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask(question); }}>
        <label htmlFor="q" className="sr-only">Question</label>
        <input id="q" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about deliveries, suppliers, mismatches..." />
        <button type="submit" disabled={busy || !question.trim()}>{busy ? "Thinking..." : "Ask"}</button>
      </form>
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip" disabled={busy} onClick={() => { setQuestion(ex); ask(ex); }}>{ex}</button>
        ))}
      </div>
      {result && <AskOutput result={result} />}
    </div>
  );
}

function AskOutput({ result }: { result: AskResult }) {
  if (result.kind === "error") return <p className="msg msg-bad">{result.message}</p>;
  if (result.kind === "not_answerable") return <p className="msg">{result.explanation}</p>;
  if (result.kind === "rejected") {
    return (
      <div>
        <p className="msg msg-bad">Not run: {result.reason}</p>
        <pre className="sql-block"><code>{result.sql}</code></pre>
      </div>
    );
  }
  return (
    <div>
      <p className="msg">{result.explanation}</p>
      <pre className="sql-block"><code>{result.sql}</code></pre>
      <div className="table-wrap">
        <table>
          <thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>{row.map((v, j) => <td key={j}>{v === null ? "" : String(v)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.truncated && <p className="panel-desc">Showing the first 200 rows.</p>}
    </div>
  );
}
