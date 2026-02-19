# fixhn

Cloudflare Worker that adds OpenGraph meta tags to Hacker News links, enabling rich link previews in Slack, Twitter, WeChat, etc.

## How it works

- **Bots/crawlers** (Slack, Twitter, etc.) → returns a lightweight HTML page with OpenGraph + Twitter Card meta tags, then redirects to HN via `<meta http-equiv="refresh">`
- **Regular browsers** → 302 redirect straight to the original HN page

Item metadata is fetched from the [HN Firebase API](https://hacker-news.firebaseio.com/v0/). If the story links to an external URL, the worker also attempts to grab its `og:image` for a richer preview card.

## Usage

Replace `news.ycombinator.com` with your worker domain:

```
https://news.ycombinator.com/item?id=12345
→
https://fixhn.<your-subdomain>.workers.dev/item?id=12345
```

## Development

```bash
npm install
npm run dev        # Start local dev server
npm run typecheck  # TypeScript type checking
```

## Deploy

```bash
npx wrangler login   # First time only
npm run deploy
```

## OpenGraph tags injected

| Tag | Value |
|-----|-------|
| `og:title` | Story title |
| `og:description` | "142 points \| by user \| 3h ago \| 87 comments \| (example.com)" |
| `og:url` | Original HN link |
| `og:site_name` | Hacker News |
| `og:type` | article |
| `og:image` | From linked article's og:image (if available) |
| `twitter:card` | summary_large_image (if image) / summary |
| `twitter:title` | Story title |
| `twitter:description` | Same as og:description |
