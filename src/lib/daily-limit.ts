// A simple cap on AI questions per day, so a stuck button or a curious
// visitor can't run up the API bill. It lives in memory, so it resets when
// the server restarts. That's fine for a local demo.
export function createDailyLimiter(limit: number, now: () => Date = () => new Date()) {
  let day = "";
  let used = 0;
  return {
    tryUse(): boolean {
      const today = now().toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        used = 0;
      }
      if (used >= limit) return false;
      used += 1;
      return true;
    },
    // how many questions were asked today, for the sidebar
    usedToday(): number {
      return now().toISOString().slice(0, 10) === day ? used : 0;
    },
  };
}

const configured = Number(process.env.ASK_DAILY_LIMIT ?? 20);
export const ASK_LIMIT = Number.isFinite(configured) && configured >= 0 ? configured : 20;
export const askLimiter = createDailyLimiter(ASK_LIMIT);
