// Genera dist/stats.svg y dist/langs.svg con datos públicos del perfil.
// Uso: GITHUB_TOKEN=... node scripts/stats.mjs <usuario>
import { mkdirSync, writeFileSync } from "node:fs";

const login = process.argv[2] || "Gaston1x";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("Falta GITHUB_TOKEN");

const query = `query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    pullRequests { totalCount }
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar { totalContributions }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login } }),
});
const { data, errors } = await res.json();
if (errors) throw new Error(JSON.stringify(errors));
const user = data.user;

const repos = user.repositories.nodes;
const stars = repos.reduce((sum, repo) => sum + repo.stargazerCount, 0);
const contrib = user.contributionsCollection;

const bytes = new Map();
for (const repo of repos) {
  for (const { size, node } of repo.languages.edges) {
    const current = bytes.get(node.name) ?? { size: 0, color: node.color || "#8b949e" };
    current.size += size;
    bytes.set(node.name, current);
  }
}
const total = [...bytes.values()].reduce((sum, lang) => sum + lang.size, 0) || 1;
const langs = [...bytes.entries()]
  .map(([name, { size, color }]) => ({ name, color, pct: (size / total) * 100 }))
  .sort((a, b) => b.pct - a.pct)
  .slice(0, 6);

const theme = { bg: "#0d1117", border: "#30363d", title: "#c4b5fd", text: "#c9d1d9", muted: "#8b949e" };
const font = "font-family='Segoe UI, Ubuntu, Helvetica, Arial, sans-serif'";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function card(title, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${height}" viewBox="0 0 420 ${height}" role="img" aria-label="${esc(title)}">
  <rect x="0.5" y="0.5" width="419" height="${height - 1}" rx="10" fill="${theme.bg}" stroke="${theme.border}"/>
  <text x="24" y="38" ${font} font-size="17" font-weight="700" fill="${theme.title}">${esc(title)}</text>
  ${body}
</svg>`;
}

const rows = [
  ["Contribuciones (último año)", contrib.contributionCalendar.totalContributions],
  ["Commits (último año)", contrib.totalCommitContributions + contrib.restrictedContributionsCount],
  ["Pull requests", user.pullRequests.totalCount],
  ["Repositorios públicos", user.repositories.totalCount],
];
const statsBody = rows
  .map(
    ([label, value], i) => `<text x="24" y="${76 + i * 28}" ${font} font-size="14" fill="${theme.text}">${esc(label)}</text>
  <text x="396" y="${76 + i * 28}" ${font} font-size="14" font-weight="700" fill="${theme.title}" text-anchor="end">${value}</text>`,
  )
  .join("\n  ");

let offset = 24;
const barWidth = 372;
const bar = langs
  .map((lang) => {
    const width = (lang.pct / 100) * barWidth;
    const rect = `<rect x="${offset.toFixed(2)}" y="58" width="${Math.max(width, 2).toFixed(2)}" height="10" fill="${lang.color}"/>`;
    offset += width;
    return rect;
  })
  .join("");
const legend = langs
  .map((lang, i) => {
    const x = i % 2 === 0 ? 24 : 216;
    const y = 96 + Math.floor(i / 2) * 26;
    return `<circle cx="${x + 6}" cy="${y - 5}" r="6" fill="${lang.color}"/>
  <text x="${x + 18}" y="${y}" ${font} font-size="14" fill="${theme.text}">${esc(lang.name)} <tspan fill="${theme.muted}">${lang.pct.toFixed(1)} %</tspan></text>`;
  })
  .join("\n  ");
const langsBody = `<clipPath id="r"><rect x="24" y="58" width="${barWidth}" height="10" rx="5"/></clipPath>
  <g clip-path="url(#r)">${bar}</g>
  ${legend}`;

mkdirSync("dist", { recursive: true });
writeFileSync("dist/stats.svg", card("Estadísticas en GitHub", 182, statsBody));
writeFileSync("dist/langs.svg", card("Lenguajes más usados", 210, langsBody));
console.log("stats.svg y langs.svg generados:", rows.map(([l, v]) => `${l}=${v}`).join(", "));
