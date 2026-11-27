
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

let server;
let baseUrl;

const fixture = {
  app: "BADAL SEVERIYA NEWS INTELLIGENCE",
  version: "1.4.1",
  generatedAt: "2026-11-27T10:00:00.000Z",
  freshnessPolicy: {
    usedFallbackWindow: false
  },
  sourceStatus: [],
  news: [
    {
      title: "Test NIFTY positive news",
      link: "https://example.com/active-news",
      description: "Active test article",
      publishedAt: "2026-11-27T09:00:00.000Z",
      sourceId: "test-source",
      sourceName: "Test Source",
      relevanceCategory: "INDIA_INDEX_CONTEXT",
      sentiment: "POSITIVE",
      sentimentScore: 3,
      relevanceScore: 90,
      freshness: "FRESH",
      niftyRelevant: true,
      impact: "MEDIUM"
    },
    {
      title: "Test stale fallback news",
      link: "https://example.com/stale-news",
      description: "Stale display-only test article",
      publishedAt: "2026-11-26T09:00:00.000Z",
      sourceId: "test-source",
      sourceName: "Test Source",
      relevanceCategory: "INDIA_INDEX_CONTEXT",
      sentiment: "NEGATIVE",
      sentimentScore: -2,
      relevanceScore: 80,
      freshness: "STALE_FALLBACK",
      niftyRelevant: true,
      impact: "LOW"
    }
  ]
};

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(
        request.url,
        "http://localhost"
      ).pathname;

      if (pathname === "/") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8"
        });

        response.end(`
          <!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>News Context Browser Test</title>
            </head>
            <body>
              <section id="master-summary-1d">
                <div class="master-eight-container"></div>
              </section>

              <section id="master-summary-15m">
                <div class="master-eight-container"></div>
              </section>

              <script
                type="module"
                src="/historical-master-news-context-ui.js"
              ></script>
            </body>
          </html>
        `);

        return;
      }

      const allowedFiles = new Set([
        "/historical-master-news-context-ui.js",
        "/historical-master-news-context.js"
      ]);

      if (!allowedFiles.has(pathname)) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      const filePath = path.join(
        ROOT,
        pathname.slice(1)
      );

      const content = await readFile(filePath);

      response.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store"
      });

      response.end(content);
    } catch {
      response.writeHead(500);
      response.end("Browser test server error");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);

    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!server) return;

  await new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error);
      else resolve();
    });
  });
});

async function openDashboard(page) {
  await page.route(
    "**/api/news-intelligence**",
    async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fixture)
      });
    }
  );

  await page.goto(baseUrl);

  await expect(
    page.locator(
      "#master-summary-1d .historical-master-news-context-panel"
    )
  ).toBeVisible();

  await expect(
    page.locator(
      "#master-summary-15m .historical-master-news-context-panel"
    )
  ).toBeVisible();
}

test(
  "creates separate 1D and 15M news context panels",
  async ({ page }) => {
    await openDashboard(page);

    await expect(
      page.locator(
        ".historical-master-news-context-panel"
      )
    ).toHaveCount(2);

    await expect(
      page.locator(
        "#master-summary-1d .master-eight-container + .historical-master-news-context-panel"
      )
    ).toBeVisible();

    await expect(
      page.locator(
        "#master-summary-15m .master-eight-container + .historical-master-news-context-panel"
      )
    ).toBeVisible();
  }
);

test(
  "renders active news and keeps stale news display-only",
  async ({ page }) => {
    await openDashboard(page);

    const panel = page.locator(
      "#master-summary-1d .historical-master-news-context-panel"
    );

    await expect(
      panel.locator(".news-context-status")
    ).toContainText("News Context तैयार");

    await expect(
      panel.locator(".news-context-summary")
    ).toContainText("POSITIVE NEWS CONTEXT");

    await expect(
      panel.locator(".news-context-summary")
    ).toContainText("Stale Display Only");

    await expect(
      panel.locator(".news-context-articles")
    ).toContainText("Test NIFTY positive news");

    await expect(
      panel.locator(".news-context-articles")
    ).toContainText("Test stale fallback news");

    await expect(
      panel.locator(".news-context-articles")
    ).toContainText(
      "DISPLAY ONLY — ACTIVE CONTEXT में शामिल नहीं"
    );
  }
);

test(
  "renders safe HTTPS links and never makes unsafe links clickable",
  async ({ page }) => {
    const payload = {
      ...fixture,
      news: [
        ...fixture.news,
        {
          ...fixture.news[0],
          title: "Unsafe JavaScript URL",
          link: "javascript:alert(1)"
        },
        {
          ...fixture.news[0],
          title: "Credential URL",
          link: "https://user:password@example.com/article"
        }
      ]
    };

    await page.route(
      "**/api/news-intelligence**",
      async route => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(payload)
        });
      }
    );

    await page.goto(baseUrl);

    const panel = page.locator(
      "#master-summary-1d .historical-master-news-context-panel"
    );

    await expect(
      panel.locator(".news-context-status")
    ).toContainText("News Context तैयार");

    const safeLink = panel.locator(
      'a[href="https://example.com/active-news"]'
    ).first();

    await expect(safeLink).toBeVisible();

    await expect(safeLink).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    );

    await expect(
      panel.locator(
        'a[href^="javascript:"]'
      )
    ).toHaveCount(0);

    await expect(
      panel.locator(
        'a[href*="user:password"]'
      )
    ).toHaveCount(0);

    await expect(
      panel.locator(".news-context-articles")
    ).not.toContainText("Unsafe JavaScript URL");
  }
);

test(
  "refresh button calls refresh API and restores its state",
  async ({ page }) => {
    let refreshRequests = 0;

    await page.route(
      "**/api/news-intelligence**",
      async route => {
        if (route.request().url().includes("refresh=1")) {
          refreshRequests++;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fixture)
        });
      }
    );

    await page.goto(baseUrl);

    const panel = page.locator(
      "#master-summary-1d .historical-master-news-context-panel"
    );

    const button = panel.locator(
      ".news-context-refresh"
    );

    await expect(button).toBeEnabled();

    await button.click();

    await expect.poll(
      () => refreshRequests
    ).toBe(1);

    await expect(button).toBeEnabled();

    await expect(button).toHaveText(
      "REFRESH NEWS CONTEXT"
    );
  }
);
