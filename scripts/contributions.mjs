// Draws the last 12 months of contributions as weekly bars, in the acelest.dev palette (light and dark).
// Runs in GitHub Actions with the workflow token. Private work is included once
// "Include private contributions on my profile" is enabled in the profile settings.
import { writeFileSync } from "node:fs";

const USER = process.env.GH_USER || "acelest";
const OUT = process.argv[2] || "contributions.svg";

async function fetchWeeks() {
  const query = `query($login: String!) { user(login: $login) { contributionsCollection {
    contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  return {
    total: cal.totalContributions,
    weeks: cal.weeks.map((w) => ({
      start: w.contributionDays[0].date,
      count: w.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
    })),
  };
}

export function render({ total, weeks }) {
  const W = 840, H = 190, padX = 24, top = 56, bottom = 30;
  const chartH = H - top - bottom;
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const slot = (W - padX * 2) / weeks.length;
  const barW = Math.max(2, slot - 4);
  const bars = weeks.map((w, i) => {
    const h = w.count ? Math.max(3, (w.count / max) * chartH) : 1.5;
    const x = padX + i * slot + (slot - barW) / 2;
    return `<rect class="${w.count ? "b" : "z"}" x="${x.toFixed(1)}" y="${(top + chartH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${w.start}: ${w.count}</title></rect>`;
  }).join("");
  // Month labels at the first week of each month.
  const months = [];
  weeks.forEach((w, i) => {
    const d = new Date(w.start + "T00:00:00Z");
    if (i === 0 || d.getUTCDate() <= 7) {
      const label = d.toLocaleString("en", { month: "short", timeZone: "UTC" });
      if (!months.length || months[months.length - 1].label !== label) months.push({ i, label });
    }
  });
  const labels = months.filter((m) => m.i > 1).map((m) =>
    `<text class="s" x="${(padX + m.i * slot).toFixed(1)}" y="${H - 10}">${m.label}</text>`).join("");
  const last4 = weeks.slice(-4).reduce((s, w) => s + w.count, 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<style>
.bg{fill:#faf9f5}.h{fill:#141413}.s{fill:#6f6e69;font-size:12px}.b{fill:#c0612d}.z{fill:#e5e3da}.l{stroke:#e5e3da}
@media (prefers-color-scheme:dark){.bg{fill:#0f0f0e}.h{fill:#f2f0e8}.s{fill:#9c9a92}.z{fill:#2a2925}.l{stroke:#2a2925}}
</style>
<rect class="bg" width="${W}" height="${H}" rx="10"/>
<text class="h" x="${padX}" y="32" font-size="15" font-weight="600">Contributions</text>
<text class="s" x="${padX + 112}" y="32">${total.toLocaleString("en")} in the last year · ${last4} in the last 4 weeks</text>
<line class="l" x1="${padX}" x2="${W - padX}" y1="${top + chartH + 0.5}" y2="${top + chartH + 0.5}"/>
${bars}
${labels}
</svg>
`;
}

if (process.env.GITHUB_TOKEN) {
  writeFileSync(OUT, render(await fetchWeeks()));
  console.log("wrote", OUT);
}
