"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { AskResult } from "@/lib/ask";
import { Icon } from "../icons";
import { rise } from "../ui";
import { highlightSql } from "../SqlCode";


const EXAMPLES = [
  "Which supplier had the most short lines this month?",
  "Total value received by category in the last 4 weeks",
  "Which products were damaged most often?",
  "Which laptops have a warranty ending in the next 90 days?",
];

type Turn = { id: number; question: string; result: AskResult | null };

export function Ask({ enabled, limit, used, onUsed }: { enabled: boolean; limit: number; used: number; onUsed: () => void }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const busy = turns.some((t) => t.result === null);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    const id = Date.now();
    setTurns((t) => [{ id, question: text, result: null }, ...t]);
    setQuestion("");
    let result: AskResult;
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text }) });
      result = await res.json();
      if (res.status !== 429 && res.status !== 400 && res.status !== 503) onUsed();
    } catch {
      result = { kind: "error", message: "Could not reach the server." };
    }
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, result } : x)));
  }
  const submit = (e: FormEvent) => { e.preventDefault(); ask(question); };

  return (
    <>
      <div {...rise(0, "head")}>
        <div><h1>Ask AI</h1><p>Ask a question in plain English. Claude writes one read-only SQL query, you see it, and it runs as a user that can&apos;t change anything.</p></div>
      </div>
      <section {...rise(1, "card")}>
        {!enabled && (
          <p className="note warn-note"><Icon name="info" />The AI box is off. To turn it on, add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> and restart. The rest of the dashboard works without it.</p>
        )}
        <form className="ask-box" onSubmit={submit}>
          <label className="field" htmlFor="askq"><Icon name="sparkles" />
            <input id="askq" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={!enabled}
              placeholder="Ask about deliveries, suppliers, mismatches…" autoComplete="off" maxLength={300} />
          </label>
          <button type="submit" className="btn solid tall" disabled={!enabled || busy || !question.trim()}><Icon name="send" />{busy ? "Thinking…" : "Ask"}</button>
        </form>
        <div className="ask-chips">
          {EXAMPLES.map((ex) => <button key={ex} type="button" disabled={!enabled || busy} onClick={() => ask(ex)}>{ex}</button>)}
        </div>
        <p className="note"><Icon name="info" />{used} of {limit} questions used today. Each one costs about 1 to 2 cents of API credit.</p>
      </section>
      <div className="thread">
        {turns.map((t) => (
          <div key={t.id} className="turn">
            <div className="msg q">{t.question}</div>
            <div className="msg a">{t.result ? <Answer result={t.result} /> : <div className="typing" aria-label="Thinking"><i /><i /><i /></div>}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Answer({ result }: { result: AskResult }) {
  if (result.kind === "error") return <p className="bad-text">{result.message}</p>;
  if (result.kind === "not_answerable") return <Typed text={result.explanation} />;
  if (result.kind === "rejected") {
    return (<><p className="bad-text">Not run: {result.reason}</p><pre className="code" dangerouslySetInnerHTML={{ __html: highlightSql(result.sql) }} /></>);
  }
  return (
    <>
      <Typed text={result.explanation} />
      <pre className="code fade-in" dangerouslySetInnerHTML={{ __html: highlightSql(result.sql) }} />
      <div className="table-wrap fade-in delay2">
        <table>
          <thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {result.rows.map((r, i) => (
              <tr key={i} className="rise" style={{ ["--i" as string]: Math.min(i, 20) } as CSSProperties}>
                {r.map((c, j) => <td key={j}>{c === null ? <span className="muted">null</span> : String(c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note"><Icon name="check" />Ran as dashboard_reader, read-only, {result.rows.length} rows{result.truncated ? " (showing the first 200)" : ""}</p>
    </>
  );
}

// Types the sentence out, one frame at a time.
function Typed({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const n = Math.min(text.length, Math.floor((now - t0) / 14));
      el.textContent = text.slice(0, n);
      if (n < text.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); el.textContent = text; };
  }, [text]);
  return <p className="said" ref={ref}>{text}</p>;
}
