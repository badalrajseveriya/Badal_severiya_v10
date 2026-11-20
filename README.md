# BADAL SEVERIYA V10 — Cloudflare Workers starter

This is a small Cloudflare Workers prototype with:
- A mobile-friendly news dashboard
- `/api/health`
- `/api/news`
- Google News RSS feeds for Indian markets, RBI/economy, IPO/company results, and global markets
- Basic keyword labels only (not verified impact or predictions)

## Deploy
Connect this GitHub repository to Cloudflare Workers. Use the repository root as the project root. Cloudflare should detect `wrangler.toml`; if asked for a build command, leave it blank and use `npx wrangler deploy` as the deploy command if the dashboard requires one.

## Important limitations
- Keyword labels are rough triage, not sentiment analysis, verified market impact, trading signals, or win probabilities.
- FII/DII flows, live NIFTY prices, IPO calendars, and official company filings are not included yet.
- RSS feeds can be delayed, unavailable, or change format.
- No database is required for this first prototype. Persistent history and additional data sources are later steps.
- Use for education and testing only; do not use it as a basis for real-money trading.
