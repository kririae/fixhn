const HN_API = "https://hacker-news.firebaseio.com/v0";
const HN_BASE = "https://news.ycombinator.com";

// Common bot/crawler User-Agent patterns
const BOT_UA_PATTERN =
  /bot|crawler|spider|slackbot|twitterbot|facebookexternalhit|linkedinbot|whatsapp|telegrambot|discord|preview|fetcher|curl|wget|python-requests|go-http-client|mediapartners/i;

interface HNItem {
  id: number;
  type: "story" | "comment" | "job" | "poll" | "pollopt";
  title?: string;
  text?: string;
  url?: string;
  score?: number;
  by?: string;
  time?: number;
  descendants?: number; // comment count
  kids?: number[];
}

async function fetchHNItem(id: number): Promise<HNItem | null> {
  const resp = await fetch(`${HN_API}/item/${id}.json`);
  if (!resp.ok) return null;
  const data = await resp.json<HNItem>();
  return data;
}

/** Try to fetch og:image from the story's linked URL */
async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "fixhn-ogimage-fetcher/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    const html = await resp.text();
    // Look for og:image meta tag
    const match = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );
    if (match) return match[1];
    // Also try the reverse attribute order
    const match2 = html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
    );
    return match2 ? match2[1] : null;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function timeAgo(unixTime: number): string {
  const seconds = Math.floor(Date.now() / 1000) - unixTime;
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildDescription(item: HNItem): string {
  const parts: string[] = [];
  if (item.score !== undefined) parts.push(`${item.score} points`);
  if (item.by) parts.push(`by ${item.by}`);
  if (item.time) parts.push(timeAgo(item.time));
  if (item.descendants !== undefined)
    parts.push(`${item.descendants} comments`);
  if (item.url) {
    try {
      parts.push(`(${new URL(item.url).hostname})`);
    } catch {
      // Ignore malformed source URLs to avoid breaking previews.
    }
  }
  return parts.join(" | ");
}

function buildOgHtml(
  item: HNItem,
  hnUrl: string,
  ogImage: string | null
): string {
  const title = escapeHtml(item.title || `HN Item #${item.id}`);
  const description = escapeHtml(buildDescription(item));

  const imageTags = ogImage
    ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImage)}" />`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} | Hacker News</title>

  <!-- OpenGraph -->
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${escapeHtml(hnUrl)}" />
  <meta property="og:site_name" content="Hacker News" />
  <meta property="og:type" content="article" />
  ${imageTags}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
</head>
<body>
  <p><a href="${escapeHtml(hnUrl)}">Open "${title}" on Hacker News</a></p>
</body>
</html>`;
}

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true; // No UA → treat as bot
  return BOT_UA_PATTERN.test(userAgent);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/") {
      return new Response(
        "fixhn - OpenGraph tags for Hacker News links\n\nUsage: /item?id=12345",
        { headers: { "content-type": "text/plain" } }
      );
    }

    // Only handle /item path
    if (url.pathname !== "/item") {
      return new Response("Not found", { status: 404 });
    }

    const id = url.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) {
      return new Response("Missing or invalid id parameter", { status: 400 });
    }

    const itemId = parseInt(id, 10);
    const hnUrl = `${HN_BASE}/item?id=${itemId}`;
    const userAgent = request.headers.get("user-agent");
    const bot = isBot(userAgent);

    // For regular browsers, just redirect to HN directly
    if (!bot) {
      return Response.redirect(hnUrl, 302);
    }

    // For bots/crawlers, fetch item data and return OG-enriched HTML
    const item = await fetchHNItem(itemId);
    if (!item) {
      // Item not found, redirect to HN anyway
      return Response.redirect(hnUrl, 302);
    }

    // Try to grab og:image from the linked article
    let ogImage: string | null = null;
    if (item.url) {
      ogImage = await fetchOgImage(item.url);
    }

    const html = buildOgHtml(item, hnUrl, ogImage);
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  },
};
