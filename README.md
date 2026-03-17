# snapapi-mcp

MCP (Model Context Protocol) server for [SnapAPI](https://snapapi.pics) — take screenshots, scrape web pages, extract content, generate PDFs, record videos, and analyze pages directly from AI tools like Claude Desktop, Cursor, Windsurf, Cline, and Zed.

## What is this?

This package runs a local MCP server that connects your AI assistant to the SnapAPI web capture API. Once configured, your AI can:

- **Take screenshots** of any URL (full page, mobile, dark mode, element selection, device emulation)
- **Scrape web pages** and get clean text, HTML, or link lists using a real browser
- **Extract content** optimized for LLM consumption (Markdown, article, metadata, structured data)
- **Generate PDFs** from URLs or HTML
- **Record videos** of browser sessions with optional interaction scenarios
- **Analyze pages** with AI (extract + analyze in one call)
- **Check your usage** quota and account stats

## Prerequisites

- Node.js 18 or later
- A SnapAPI API key — get one at [app.snapapi.pics](https://app.snapapi.pics)

## Quick Start

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "snapapi": {
      "command": "npx",
      "args": ["-y", "snapapi-mcp"],
      "env": {
        "SNAPAPI_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "snapapi": {
      "command": "npx",
      "args": ["-y", "snapapi-mcp"],
      "env": {
        "SNAPAPI_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "snapapi": {
      "command": "npx",
      "args": ["-y", "snapapi-mcp"],
      "env": {
        "SNAPAPI_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

### Cline (VS Code)

Open Cline settings → MCP Servers → Add Server:
- **Command:** `npx`
- **Args:** `-y snapapi-mcp`
- **Environment:** `SNAPAPI_API_KEY=sk_live_your_key_here`

### VS Code (native MCP support)

Add to `.vscode/mcp.json` in your workspace (or your user settings):

```json
{
  "servers": {
    "snapapi": {
      "command": "npx",
      "args": ["-y", "snapapi-mcp"],
      "env": {
        "SNAPAPI_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

### Zed

Add to `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "snapapi": {
      "command": {
        "path": "npx",
        "args": ["-y", "snapapi-mcp"],
        "env": {
          "SNAPAPI_API_KEY": "sk_live_your_key_here"
        }
      }
    }
  }
}
```

### Automated Installer

Run the included helper script:

```bash
# For Claude Desktop
./install-mcp.sh claude

# For Cursor
./install-mcp.sh cursor

# For Windsurf
./install-mcp.sh windsurf
```

---

## Available Tools

### ping

Verify that SnapAPI is reachable and your API key is valid. No parameters required.

**Example prompt:** "Ping SnapAPI to check it's working"

---

### screenshot

Take a screenshot of any URL with extensive customization.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | * | URL to capture |
| `html` | string | * | Raw HTML to render (alternative to url) |
| `markdown` | string | * | Markdown to render (alternative to url) |
| `format` | string | no | `png`, `jpeg`, `webp`, or `avif` (default: png) |
| `quality` | number | no | 1–100 for jpeg/webp (default: 80) |
| `width` | number | no | Viewport width (default: 1280) |
| `height` | number | no | Viewport height (default: 800) |
| `fullPage` | boolean | no | Capture full scrollable page |
| `selector` | string | no | CSS selector for element capture |
| `delay` | number | no | Wait ms after page load before capture |
| `waitUntil` | string | no | `load`, `domcontentloaded`, or `networkidle` |
| `darkMode` | boolean | no | Dark color scheme |
| `blockAds` | boolean | no | Block ad networks |
| `blockCookieBanners` | boolean | no | Block cookie popups |
| `css` | string | no | Custom CSS to inject |
| `javascript` | string | no | Custom JS to execute |
| `device` | string | no | Device preset (e.g. `iphone-15-pro`) — use `list_devices` to see all |
| `hideSelectors` | string[] | no | Elements to hide before capture |

*At least one of `url`, `html`, or `markdown` must be provided.

**Example prompts:**
- "Take a screenshot of https://example.com in dark mode"
- "Screenshot https://github.com on an iPhone 15 Pro"
- "Capture a full-page screenshot of https://news.ycombinator.com with ads blocked"
- "Render this HTML as a screenshot: `<h1>Hello</h1>`"

---

### scrape

Scrape web page content using a real browser (JavaScript-rendered pages work).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | URL to scrape |
| `type` | string | no | `text` (Markdown), `html`, or `links` (default: text) |
| `pages` | number | no | Pages to follow, 1–10 (default: 1) |
| `waitMs` | number | no | Extra wait time in ms after page load |
| `blockResources` | boolean | no | Block images/media/fonts to speed up |
| `locale` | string | no | Browser locale (e.g. `en-US`) |
| `premiumProxy` | boolean | no | Use residential proxy to bypass blocks |

**Example prompts:**
- "Scrape the text content from https://example.com/blog"
- "Get all links from https://news.ycombinator.com"
- "Scrape https://example.com/pricing as HTML"

---

### extract

Extract clean, structured content optimized for LLMs.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | URL to extract from |
| `type` | string | no | `markdown`, `text`, `html`, `article`, `links`, `images`, `metadata`, or `structured` (default: markdown) |
| `selector` | string | no | Scope extraction to a CSS element |
| `waitFor` | string | no | Wait for CSS selector before extracting |
| `maxLength` | number | no | Max character length |
| `cleanOutput` | boolean | no | Remove noise (default: true) |
| `blockAds` | boolean | no | Block ad networks |
| `blockCookieBanners` | boolean | no | Block cookie popups |
| `fields` | object | no | Custom field extraction map |

**Example prompts:**
- "Extract the article content from https://example.com/post as markdown"
- "Get the metadata (title, description, OG image) from https://example.com"
- "Extract price and rating from https://example.com/product"

---

### pdf

Generate a PDF from a URL or HTML.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | * | URL to convert to PDF |
| `html` | string | * | HTML to convert to PDF (alternative to url) |
| `pdfOptions.pageSize` | string | no | `a4`, `a3`, `a5`, `letter`, `legal`, `tabloid` (default: a4) |
| `pdfOptions.landscape` | boolean | no | Landscape orientation |
| `pdfOptions.printBackground` | boolean | no | Include background graphics |
| `pdfOptions.scale` | number | no | Scale factor 0.1–2 |
| `pdfOptions.marginTop` | string | no | Top margin, e.g. `1cm` |
| `pdfOptions.marginBottom` | string | no | Bottom margin |
| `pdfOptions.marginLeft` | string | no | Left margin |
| `pdfOptions.marginRight` | string | no | Right margin |
| `delay` | number | no | Wait ms after page load |
| `waitUntil` | string | no | `load`, `domcontentloaded`, or `networkidle` |

*At least one of `url` or `html` must be provided.

**Example prompts:**
- "Generate a PDF of https://example.com/report in landscape A4"
- "Convert this HTML to a PDF with 2cm margins"

---

### analyze

Extract content from a URL and analyze it with an AI model in one call.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | URL to analyze |
| `prompt` | string | yes | Analysis instruction for the AI |
| `extractType` | string | no | `markdown`, `text`, `article`, or `structured` (default: article) |
| `maxLength` | number | no | Max characters of content to pass to AI (default: 20000) |

**Example prompts:**
- "Analyze https://example.com/article — what are the main arguments?"
- "Extract all product specs from https://example.com/product"
- "What is the sentiment of this news article: https://example.com/news"

---

### video

Record a browser session as a video (WebM).

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | URL to record |
| `duration` | number | no | Recording duration in seconds, 1–60 (default: 5) |
| `width` | number | no | Viewport width (default: 1280) |
| `height` | number | no | Viewport height (default: 800) |
| `scenario` | string | no | JavaScript to run during recording (scroll, click, etc.) |
| `delay` | number | no | Wait ms before starting recording |
| `waitUntil` | string | no | `load`, `domcontentloaded`, or `networkidle` |
| `darkMode` | boolean | no | Dark color scheme |
| `blockAds` | boolean | no | Block ad networks |
| `blockCookieBanners` | boolean | no | Block cookie popups |
| `device` | string | no | Device preset — use `list_devices` to see all |

**Example prompts:**
- "Record a 10-second video of https://example.com scrolling down"
- "Record https://example.com on an iPhone 15 Pro"

---

### get_usage

Check your SnapAPI quota and monthly statistics. No parameters required.

**Example prompts:**
- "How many SnapAPI requests do I have left this month?"
- "Show me my SnapAPI usage"

---

### list_devices

List all available device presets for screenshot and video emulation. No parameters required.

**Example prompt:** "What device presets are available for screenshots?"

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SNAPAPI_API_KEY` | **Yes** | Your SnapAPI API key (`sk_live_...`) |
| `SNAPAPI_BASE_URL` | No | API base URL (default: `https://api.snapapi.pics`) |

---

## Development

```bash
# Clone the repo
git clone https://github.com/Sleywill/snapapi-mcp.git
cd snapapi-mcp

# Install dependencies
npm install

# Build
npm run build

# Run locally (reads MCP protocol from stdin)
SNAPAPI_API_KEY=sk_live_your_key node dist/index.js
```

---

## Troubleshooting

**"SNAPAPI_API_KEY environment variable is required"**
Make sure the `env` block in your MCP config includes your API key. Check it starts with `sk_live_`.

**Tools not appearing in Claude Desktop**
Restart Claude Desktop after saving the config. Check MCP logs at:
- macOS: `~/Library/Logs/Claude/mcp*.log`
- Windows: `%APPDATA%\Claude\logs\mcp*.log`

**npx takes too long on first run**
Use `"args": ["-y", "snapapi-mcp"]` — the `-y` flag auto-confirms the install prompt without interaction.

**screenshot / scrape returns an error**
- Verify your API key is valid at [app.snapapi.pics/dashboard](https://app.snapapi.pics/dashboard)
- Check your remaining quota with the `get_usage` tool
- For JavaScript-heavy pages, try adding `"waitUntil": "networkidle"` and a `"delay"` value

**analyze tool returns an error**
The analyze endpoint requires Anthropic API credits on the SnapAPI backend. Use the `extract` tool as a fallback to fetch the page content and analyze it yourself.

---

## License

MIT
