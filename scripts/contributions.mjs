// Draws this year's contributions as weekly bars, in the acelest.dev palette (light and dark).
// The headline is the year total, so it can be read at a glance without opening the calendar.
// Runs daily in GitHub Actions with the workflow token. Private work is included once
// "Include private contributions on my profile" is enabled in the profile settings.
import { writeFileSync } from "node:fs";

const USER = process.env.GH_USER || "acelest";
const OUT = process.argv[2] || "contributions.svg";
const WEEK = 7 * 864e5;

async function fetchYear(now = new Date()) {
  const year = now.getUTCFullYear();
  const query = `query($login: String!, $from: DateTime!, $to: DateTime!) { user(login: $login) {
    contributionsCollection(from: $from, to: $to) { contributionCalendar { totalContributions
      weeks { contributionDays { date contributionCount } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: USER, from: `${year}-01-01T00:00:00Z`, to: now.toISOString() } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays);
  return { year, total: cal.totalContributions, days, now };
}

// 53 week slots from 1 January; slots after today are drawn as faint placeholders.
export function render({ year, total, days, now }) {
  const jan1 = Date.UTC(year, 0, 1);
  const slots = Array.from({ length: 53 }, (_, i) => ({ start: jan1 + i * WEEK, count: 0, future: jan1 + i * WEEK > now.getTime() }));
  for (const d of days) {
    const i = Math.floor((Date.parse(d.date + "T00:00:00Z") - jan1) / WEEK);
    if (i >= 0 && i < slots.length) slots[i].count += d.contributionCount;
  }
  const past = slots.filter((s) => !s.future);
  const last4 = past.slice(-4).reduce((s, w) => s + w.count, 0);
  const best = Math.max(0, ...past.map((s) => s.count));

  const W = 840, H = 214, padX = 24, top = 84, bottom = 30;
  const chartH = H - top - bottom;
  const max = Math.max(1, best);
  const slot = (W - padX * 2) / slots.length;
  const barW = Math.max(2, slot - 4);
  const fmt = (n) => n.toLocaleString("en");
  const day = (t) => new Date(t).toISOString().slice(0, 10);

  const bars = slots.map((s, i) => {
    const h = s.future ? 1.5 : s.count ? Math.max(3, (s.count / max) * chartH) : 1.5;
    const x = padX + i * slot + (slot - barW) / 2;
    const cls = s.future ? "f" : s.count ? "b" : "z";
    const tip = s.future ? "" : `<title>Week of ${day(s.start)}: ${s.count}</title>`;
    return `<rect class="${cls}" x="${x.toFixed(1)}" y="${(top + chartH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5">${tip}</rect>`;
  }).join("");

  const labels = Array.from({ length: 12 }, (_, m) => {
    const i = Math.floor((Date.UTC(year, m, 1) - jan1) / WEEK);
    const label = new Date(Date.UTC(year, m, 1)).toLocaleString("en", { month: "short", timeZone: "UTC" });
    return `<text class="s" x="${(padX + i * slot).toFixed(1)}" y="${H - 10}">${label}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<style>
.bg{fill:#faf9f5}.h{fill:#141413}.s{fill:#6f6e69;font-size:12px}.b{fill:#c0612d}.z{fill:#e5e3da}.f{fill:#efede6}.l{stroke:#e5e3da}
@media (prefers-color-scheme:dark){.bg{fill:#0f0f0e}.h{fill:#f2f0e8}.s{fill:#9c9a92}.z{fill:#2a2925}.f{fill:#1d1d1b}.l{stroke:#2a2925}}
</style>
<rect class="bg" width="${W}" height="${H}" rx="10"/>
<text class="s" x="${padX}" y="30" font-size="13">${year}</text>
<text x="${padX}" y="62"><tspan class="h" font-size="30" font-weight="600">${fmt(total)}</tspan><tspan class="s" font-size="15" dx="8">contributions</tspan></text>
<text class="s" x="${W - padX}" y="62" text-anchor="end">${fmt(last4)} in the last 4 weeks · best week ${fmt(best)}</text>
<line class="l" x1="${padX}" x2="${W - padX}" y1="${top + chartH + 0.5}" y2="${top + chartH + 0.5}"/>
${bars}
${labels}
</svg>
`;
}

if (process.env.GITHUB_TOKEN) {
  writeFileSync(OUT, render(await fetchYear()));
  console.log("wrote", OUT);
}
