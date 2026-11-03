import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { askQuestion, makeClaudeSqlGenerator } from "@/lib/ask";
import { askLimiter } from "@/lib/daily-limit";
import { getPool } from "@/lib/db";
import { ReadOnlyUserError, runReadOnlyQuery } from "@/lib/run-readonly";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { kind: "error", message: "The AI question box is off. Add ANTHROPIC_API_KEY to .env.local to turn it on." },
      { status: 503 },
    );
  }

  let question = "";
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question : "";
  } catch {
    return NextResponse.json({ kind: "error", message: "Bad request." }, { status: 400 });
  }

  if (!question.trim()) {
    return NextResponse.json({ kind: "error", message: "Type a question first." }, { status: 400 });
  }
  // checked before calling the AI, so a blocked question costs nothing
  if (!askLimiter.tryUse()) {
    return NextResponse.json(
      { kind: "error", message: "Daily question limit reached (ASK_DAILY_LIMIT). It resets tomorrow or when the server restarts." },
      { status: 429 },
    );
  }

  try {
    const pool = getPool();
    const result = await askQuestion(question, {
      generateSql: makeClaudeSqlGenerator(),
      runSql: (sql) => runReadOnlyQuery(pool, sql),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ReadOnlyUserError) {
      return NextResponse.json({ kind: "error", message: err.message }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ kind: "error", message: "Too many questions at once. Wait a minute and try again." }, { status: 429 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ kind: "error", message: "The Anthropic API key was not accepted." }, { status: 500 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ kind: "error", message: `The AI service returned an error (${err.status ?? "no status"}).` }, { status: 502 });
    }
    console.error(err);
    return NextResponse.json({ kind: "error", message: "Something went wrong. Check the server log." }, { status: 500 });
  }
}
