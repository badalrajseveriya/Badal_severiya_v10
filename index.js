const FEEDS = [
  { name: "NIFTY / Indian Markets", url: "https://news.google.com/rss/search?q=NIFTY+50+OR+Indian+stock+market&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "RBI / Economy", url: "https://news.google.com/rss/search?q=RBI+India+economy+monetary+policy&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "IPO / Company Results", url: "https://news.google.com/rss/search?q=India+IPO+OR+quarterly+results+companies&hl=en-IN&gl=IN&ceid=IN:en" },
  { name: "Global Markets", url: "https://news.google.com/rss/search?q=US+Federal+Reserve+OR+global+markets&hl=en-IN&gl=IN&ceid=IN:en" }
];

const POSITIVE = ["beats estimates", "profit rises", "growth", "surge", "record high", "rate cut", "approval", "strong results", "inflows", "upgrade"];
const NEGATIVE = ["misses estimates", "loss widens", "decline", "falls", "crash", "rate hike", "warning", "fraud", "outflows", "downgrade", "ban"];

function decodeXml(s = "") {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "").trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}
function classify(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const p = POSITIVE.filter(k => text.includes(k)).length;
  const n = NEGATIVE.filter(k => text.includes(k)).length;
  if (p > n) return { label: "Positive keywords", tone: "positive" };
  if (n > p) return { label: "Negative keywords", tone: "negative" };
  return { label: "Needs review", tone: "neutral" };
}
async function getNews() {
  const results = await Promise.all(FEEDS.map(async feed => {
    try {
      const res = await fetch(feed.url, { headers: { "User-Agent": "BadalSeveriyaNews/1.0" }, cf: { cacheTtl: 300, cacheEverything: true } });
      if (!res.ok) throw new Error(`Feed returned ${res.status}`);
      const xml = await res.text();
      const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, 12);
      return items.map(m => {
        const item = m[1];
        const title = tag(item, "title");
        const link = tag(item, "link");
        const pubDate = tag(item, "pubDate");
        const description = tag(item, "description");
        return { source: feed.name, title, link, pubDate, ...classify(title, description) };
      }).filter(x => x.title && x.link);
    } catch (e) {
      return [{ source: feed.name, title: "Feed temporarily unavailable", link: "", pubDate: "", label: "No data", tone: "neutral" }];
    }
  }));
  return results.flat().sort((a,b) => (Date.parse(b.pubDate)||0) - (Date.parse(a.pubDate)||0));
}
function page() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BADAL SEVERIYA V10</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b1220;color:#e8eefc;font:15px system-ui,Arial}header{padding:22px 16px;background:#111c30;border-bottom:1px solid #26344d}h1{margin:0;font-size:22px}header p{margin:6px 0 0;color:#aab8d0}.wrap{max-width:900px;margin:auto;padding:16px}.bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0 18px}.btn{background:#2563eb;color:white;border:0;border-radius:9px;padding:10px 14px;font-weight:600}.muted{color:#9aaac4;font-size:13px}.notice{padding:12px;border:1px solid #594b22;background:#2a2414;border-radius:10px;color:#f6df9b;margin:14px 0}.item{background:#121e32;border:1px solid #263650;border-radius:12px;padding:14px;margin:10px 0}.meta{color:#9eafca;font-size:12px}.item a{color:#dce8ff;text-decoration:none;font-weight:650}.pill{display:inline-block;padding:3px 8px;border-radius:20px;font-size:11px;margin:8px 0}.positive{background:#123b2e;color:#8df0c1}.negative{background:#4a2028;color:#ffabb4}.neutral{background:#344056;color:#d0daeb}footer{color:#8998b2;font-size:12px;padding:22px 0}
</style></head><body><header><div class="wrap"><h1>BADAL SEVERIYA V10</h1><p>Market news and data intelligence dashboard</p></div></header>
<main class="wrap"><div class="bar"><button class="btn" onclick="loadNews()">Refresh news</button><span class="muted" id="status">Loading headlines…</span></div>
<div class="notice"><b>Important:</b> This is an early news-monitoring prototype. Labels are simple keyword matches, not verified market impact, trading signals, forecasts, or probability of profit. Check original sources.</div>
<section id="news"></section><footer>News headlines are collected from Google News RSS. Availability and coverage can change. Educational information only.</footer></main>
<script>
async function loadNews(){const s=document.getElementById('status'),n=document.getElementById('news');s.textContent='Refreshing…';try{const r=await fetch('/api/news');const d=await r.json();n.innerHTML=d.items.map(x=>`<article class="item"><div class="meta">${esc(x.source)} · ${esc(x.pubDate||'Date unavailable')}</div><div class="pill ${x.tone}">${esc(x.label)}</div><div><a href="${attr(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a></div></article>`).join('')||'<p>No headlines returned.</p>';s.textContent='Updated: '+new Date().toLocaleString()}catch(e){s.textContent='Could not load news. Try again.'}}
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function attr(v){return esc(v)}
loadNews();
</script></body></html>`;
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return Response.json({ ok: true, app: "BADAL SEVERIYA V10", mode: "prototype" });
    if (url.pathname === "/api/news") {
      const items = await getNews();
      return Response.json({ updatedAt: new Date().toISOString(), count: items.length, items }, { headers: { "Cache-Control": "public, max-age=120" } });
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(page(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  }
};
