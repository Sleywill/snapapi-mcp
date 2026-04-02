#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
) as { version: string };

const VERSION = pkg.version;
const API_KEY = process.env.SNAPAPI_API_KEY;
const API_BASE = (
  process.env.SNAPAPI_BASE_URL || "https://api.snapapi.pics"
).replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 60_000;

if (!API_KEY) {
  process.stderr.write(
    "Error: SNAPAPI_API_KEY environment variable is required.\n" +
      "Get your API key at https://app.snapapi.pics/dashboard\n"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SnapAPIErrorBody {
  error?: string;
  message?: string;
  details?: unknown;
}

async function callSnapAPI(
  endpoint: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>
): Promise<Response> {
  const url = `${API_BASE}/v1/${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
    "User-Agent": `snapapi-mcp/${VERSION}`,
  };

  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = { method, headers };
  if (body && method === "POST") {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Surface rate-limit information when available
    const retryAfter = response.headers.get("Retry-After");
    let detail = response.statusText;
    try {
      const errBody: SnapAPIErrorBody = await response.json();
      detail = errBody.message || errBody.error || detail;
    } catch {
      // ignore JSON parse failures on error responses
    }

    if (response.status === 429) {
      const hint = retryAfter
        ? ` Retry after ${retryAfter} seconds.`
        : " You have exceeded your quota or rate limit.";
      throw new McpError(
        ErrorCode.InternalError,
        `SnapAPI rate limit exceeded: ${detail}.${hint}`
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `SnapAPI authentication failed (${response.status}): ${detail}. ` +
          "Check that SNAPAPI_API_KEY is set to a valid key."
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      `SnapAPI ${response.status}: ${detail}`
    );
  }

  return response;
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n\n... [truncated]";
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "snapapi", version: VERSION },
  { capabilities: { tools: {} } }
);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ----- ping -----
    {
      name: "ping",
      description:
        "Check that the SnapAPI service is reachable and the API key is valid. " +
        "Returns the API status and current server time. Use this to verify your " +
        "configuration before making other calls.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },

    // ----- screenshot -----
    {
      name: "screenshot",
      description:
        "Take a screenshot of a URL or render HTML/Markdown and return the image. " +
        "Supports full-page capture, device emulation, dark mode, element selection, " +
        "custom CSS/JS injection, ad/cookie-banner blocking, and more.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description:
              "The URL to screenshot. Required unless html or markdown is provided.",
          },
          html: {
            type: "string",
            description:
              "Raw HTML to render and screenshot. Alternative to url.",
          },
          markdown: {
            type: "string",
            description:
              "Markdown to render and screenshot. Alternative to url.",
          },
          format: {
            type: "string",
            enum: ["png", "jpeg", "webp", "avif"],
            description: "Output image format (default: png).",
          },
          quality: {
            type: "number",
            description:
              "Image quality 1–100 for jpeg/webp (default: 80).",
          },
          width: {
            type: "number",
            description: "Viewport width in pixels (default: 1280).",
          },
          height: {
            type: "number",
            description: "Viewport height in pixels (default: 800).",
          },
          fullPage: {
            type: "boolean",
            description: "Capture the full scrollable page (default: false).",
          },
          selector: {
            type: "string",
            description: "CSS selector to capture a specific element.",
          },
          delay: {
            type: "number",
            description:
              "Milliseconds to wait after page load before capture (0–30000).",
          },
          waitUntil: {
            type: "string",
            enum: ["load", "domcontentloaded", "networkidle"],
            description:
              "When to consider the page ready (default: load). Use networkidle for SPAs.",
          },
          darkMode: {
            type: "boolean",
            description: "Render with dark color scheme (default: false).",
          },
          blockAds: {
            type: "boolean",
            description: "Block ad networks (default: false).",
          },
          blockCookieBanners: {
            type: "boolean",
            description: "Block cookie consent popups (default: false).",
          },
          css: {
            type: "string",
            description: "Custom CSS to inject before capture.",
          },
          javascript: {
            type: "string",
            description: "Custom JavaScript to execute before capture.",
          },
          device: {
            type: "string",
            description:
              "Device preset (e.g. iphone-15-pro, macbook-pro-16, pixel-8). " +
              "Overrides width, height, scale, and mobile settings. " +
              "Use the list_devices tool to see all presets.",
          },
          hideSelectors: {
            type: "array",
            items: { type: "string" },
            description: "CSS selectors of elements to hide before capture.",
          },
        },
        required: [],
        description:
          "At least one of url, html, or markdown must be provided.",
      },
    },

    // ----- scrape -----
    {
      name: "scrape",
      description:
        "Scrape a URL using a real browser and return page content as plain text " +
        "(Markdown), raw HTML, or a list of links. Works on JavaScript-rendered pages.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to scrape.",
          },
          type: {
            type: "string",
            enum: ["text", "html", "links"],
            description:
              "Return format: 'text' for Markdown-converted content, " +
              "'html' for raw HTML, 'links' for extracted hyperlinks (default: text).",
          },
          pages: {
            type: "number",
            description: "Number of pages to follow and scrape, 1–10 (default: 1).",
          },
          waitMs: {
            type: "number",
            description: "Extra wait time in ms after page load (0–30000, default: 0).",
          },
          blockResources: {
            type: "boolean",
            description:
              "Block images, media, and fonts to speed up scraping (default: false).",
          },
          locale: {
            type: "string",
            description: "Browser locale, e.g. en-US, de-DE (default: system).",
          },
          premiumProxy: {
            type: "boolean",
            description:
              "Route through a residential proxy to bypass bot detection (default: false).",
          },
        },
        required: ["url"],
      },
    },

    // ----- extract -----
    {
      name: "extract",
      description:
        "Extract clean, structured content from a URL. Returns Markdown, plain text, " +
        "article data (via Mozilla Readability), OG metadata, links, images, or custom " +
        "structured fields. Optimized for feeding web content to LLMs without HTML noise.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to extract content from.",
          },
          type: {
            type: "string",
            enum: [
              "markdown",
              "text",
              "html",
              "article",
              "links",
              "images",
              "metadata",
              "structured",
            ],
            description:
              "Extraction mode (default: markdown). " +
              "'article' uses Mozilla Readability for article body extraction. " +
              "'structured' returns title, author, word count, and cleaned content. " +
              "'metadata' returns OG tags and meta fields. " +
              "'links' and 'images' return lists of URLs.",
          },
          selector: {
            type: "string",
            description: "CSS selector to scope extraction to a specific element.",
          },
          waitFor: {
            type: "string",
            description: "CSS selector to wait for before extracting.",
          },
          maxLength: {
            type: "number",
            description: "Maximum character length of the returned content.",
          },
          cleanOutput: {
            type: "boolean",
            description:
              "Remove excess whitespace and empty links (default: true).",
          },
          darkMode: {
            type: "boolean",
            description: "Render the page with dark color scheme.",
          },
          blockAds: {
            type: "boolean",
            description: "Block ad networks.",
          },
          blockCookieBanners: {
            type: "boolean",
            description: "Block cookie consent popups.",
          },
          fields: {
            type: "object",
            additionalProperties: { type: "string" },
            description:
              "Custom field extraction map: keys are field names, values describe what to extract. " +
              'Example: {"price": "product price as a number", "rating": "star rating out of 5"}.',
          },
        },
        required: ["url"],
      },
    },

    // ----- pdf -----
    {
      name: "pdf",
      description:
        "Generate a PDF from a URL or HTML content. Supports page sizes, margins, " +
        "landscape orientation, background graphics, and custom scaling.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description:
              "The URL to convert to PDF. Required unless html is provided.",
          },
          html: {
            type: "string",
            description:
              "Raw HTML to convert to PDF. Alternative to url.",
          },
          pdfOptions: {
            type: "object",
            description: "PDF layout and formatting options.",
            properties: {
              pageSize: {
                type: "string",
                enum: ["a4", "a3", "a5", "letter", "legal", "tabloid"],
                description: "Page size (default: a4).",
              },
              landscape: {
                type: "boolean",
                description: "Landscape orientation (default: false).",
              },
              printBackground: {
                type: "boolean",
                description: "Print background graphics and colors (default: false).",
              },
              scale: {
                type: "number",
                description: "Scale factor 0.1–2 (default: 1).",
              },
              marginTop: {
                type: "string",
                description: "Top margin, e.g. '1cm', '10mm' (default: 1cm).",
              },
              marginBottom: {
                type: "string",
                description: "Bottom margin (default: 1cm).",
              },
              marginLeft: {
                type: "string",
                description: "Left margin (default: 1cm).",
              },
              marginRight: {
                type: "string",
                description: "Right margin (default: 1cm).",
              },
            },
          },
          width: {
            type: "number",
            description: "Viewport width in pixels (default: 1280).",
          },
          height: {
            type: "number",
            description: "Viewport height in pixels (default: 800).",
          },
          delay: {
            type: "number",
            description: "Milliseconds to wait after page load before generating PDF.",
          },
          waitUntil: {
            type: "string",
            enum: ["load", "domcontentloaded", "networkidle"],
            description: "When to consider the page ready (default: load).",
          },
        },
        required: [],
        description: "At least one of url or html must be provided.",
      },
    },

    // ----- analyze -----
    {
      name: "analyze",
      description:
        "Extract content from a URL and analyze it with an AI model. " +
        "Returns AI-generated insights, summaries, sentiment, or custom analysis " +
        "based on your prompt. Combines web extraction with LLM analysis in one call.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to extract and analyze.",
          },
          prompt: {
            type: "string",
            description:
              "The analysis instruction for the AI, e.g. 'Summarize the key points', " +
              "'Extract all product specifications', 'What is the overall sentiment?'",
          },
          extractType: {
            type: "string",
            enum: ["markdown", "text", "article", "structured"],
            description:
              "How to extract the page content before analysis (default: article).",
          },
          maxLength: {
            type: "number",
            description:
              "Maximum characters of extracted content to pass to the AI (default: 20000).",
          },
        },
        required: ["url", "prompt"],
      },
    },

    // ----- video -----
    {
      name: "video",
      description:
        "Record a browser session as a video (WebM). Optionally runs a JavaScript " +
        "scenario (clicks, scrolls, form fills) before and during recording. " +
        "Returns a URL to download the recorded video.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to record.",
          },
          width: {
            type: "number",
            description: "Viewport width in pixels (default: 1280).",
          },
          height: {
            type: "number",
            description: "Viewport height in pixels (default: 800).",
          },
          duration: {
            type: "number",
            description:
              "Recording duration in seconds (1–60, default: 5).",
          },
          scenario: {
            type: "string",
            description:
              "JavaScript to run inside the page during recording, e.g. scroll or click actions.",
          },
          waitUntil: {
            type: "string",
            enum: ["load", "domcontentloaded", "networkidle"],
            description: "When to start recording (default: load).",
          },
          delay: {
            type: "number",
            description:
              "Milliseconds to wait after page load before starting the recording.",
          },
          darkMode: {
            type: "boolean",
            description: "Record with dark color scheme (default: false).",
          },
          blockAds: {
            type: "boolean",
            description: "Block ad networks during recording (default: false).",
          },
          blockCookieBanners: {
            type: "boolean",
            description: "Block cookie consent popups (default: false).",
          },
          device: {
            type: "string",
            description:
              "Device preset for recording (e.g. iphone-15-pro). " +
              "Use the list_devices tool to see all presets.",
          },
        },
        required: ["url"],
      },
    },

    // ----- get_usage -----
    {
      name: "get_usage",
      description:
        "Check your SnapAPI account usage, quota, and plan details for the current billing period. " +
        "Shows requests used vs. limit, remaining quota, and monthly statistics.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },

    // ----- list_devices -----
    {
      name: "list_devices",
      description:
        "List all available device presets for screenshot and video emulation. " +
        "Each preset sets the correct viewport, device scale factor, and mobile flag " +
        "(phones, tablets, desktops). Pass the device id to the screenshot or video tool.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ---------------------------------------------------------------
      // ping
      // ---------------------------------------------------------------
      case "ping": {
        const response = await callSnapAPI("ping", "GET");
        const data = (await response.json()) as {
          status?: string;
          time?: string;
          version?: string;
        };
        return {
          content: [
            {
              type: "text" as const,
              text:
                `SnapAPI is reachable and your API key is valid.\n` +
                `Status:  ${data.status || "ok"}\n` +
                `Time:    ${data.time || new Date().toISOString()}\n` +
                `Version: ${data.version || "unknown"}`,
            },
          ],
        };
      }

      // ---------------------------------------------------------------
      // screenshot
      // ---------------------------------------------------------------
      case "screenshot": {
        const params: Record<string, unknown> = { ...args };

        if (!params.url && !params.html && !params.markdown) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "At least one of url, html, or markdown must be provided."
          );
        }

        // Force base64 response so we can return it as an MCP image block
        params.responseType = "base64";

        const response = await callSnapAPI("screenshot", "POST", params);
        const data = (await response.json()) as {
          success: boolean;
          data?: string;
          format?: string;
          width?: number;
          height?: number;
          fileSize?: number;
          took?: number;
        };

        if (!data.success || !data.data) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Screenshot capture failed. The API did not return image data.",
              },
            ],
            isError: true,
          };
        }

        const format = (args?.format as string) || data.format || "png";
        const mimeMap: Record<string, string> = {
          png: "image/png",
          jpeg: "image/jpeg",
          webp: "image/webp",
          avif: "image/avif",
        };
        const mimeType = mimeMap[format] || "image/png";

        return {
          content: [
            {
              type: "image" as const,
              data: data.data,
              mimeType,
            },
            {
              type: "text" as const,
              text:
                `Screenshot captured: ${(args?.url as string) || "HTML/Markdown input"}\n` +
                `Dimensions: ${data.width || "?"}x${data.height || "?"} | ` +
                `Format: ${format} | ` +
                `Size: ${data.fileSize ? (data.fileSize / 1024).toFixed(1) + " KB" : "unknown"} | ` +
                `Time: ${data.took || 0}ms`,
            },
          ],
        };
      }

      // ---------------------------------------------------------------
      // scrape
      // ---------------------------------------------------------------
      case "scrape": {
        const response = await callSnapAPI(
          "scrape",
          "POST",
          args as Record<string, unknown>
        );
        const data = (await response.json()) as {
          success: boolean;
          results?: Array<{ page: number; url: string; data: string }>;
        };

        if (!data.success || !data.results?.length) {
          return {
            content: [
              { type: "text" as const, text: "Scrape returned no results." },
            ],
            isError: true,
          };
        }

        const scrapeType = (args?.type as string) || "text";
        let output = "";

        for (const result of data.results) {
          if (data.results.length > 1) {
            output += `\n--- Page ${result.page}: ${result.url} ---\n\n`;
          }

          if (scrapeType === "links") {
            try {
              const links = JSON.parse(result.data) as Array<{
                text: string;
                href: string;
              }>;
              output += links.map((l) => `- [${l.text}](${l.href})`).join("\n");
            } catch {
              output += result.data;
            }
          } else {
            output += result.data;
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: truncateText(output.trim(), 100_000),
            },
          ],
        };
      }

      // ---------------------------------------------------------------
      // extract
      // ---------------------------------------------------------------
      case "extract": {
        const response = await callSnapAPI(
          "extract",
          "POST",
          args as Record<string, unknown>
        );
        const data = (await response.json()) as {
          success: boolean;
          type: string;
          url: string;
          data: unknown;
          responseTime?: number;
        };

        if (!data.success) {
          return {
            content: [
              { type: "text" as const, text: "Extraction failed." },
            ],
            isError: true,
          };
        }

        let output: string;
        if (typeof data.data === "string") {
          output = data.data;
        } else {
          output = JSON.stringify(data.data, null, 2);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: truncateText(output, 100_000),
            },
          ],
        };
      }

      // ---------------------------------------------------------------
      // pdf
      // ---------------------------------------------------------------
      case "pdf": {
        const params: Record<string, unknown> = { ...args };

        if (!params.url && !params.html) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "At least one of url or html must be provided."
          );
        }

        params.format = "pdf";
        params.responseType = "base64";

        const response = await callSnapAPI("screenshot", "POST", params);
        const data = (await response.json()) as {
          success: boolean;
          data?: string;
          fileSize?: number;
          took?: number;
        };

        if (!data.success || !data.data) {
          return {
            content: [
              {
                type: "text" as const,
                text: "PDF generation failed. The API did not return data.",
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text:
                `PDF generated successfully.\n` +
                `Source:          ${(args?.url as string) || "HTML input"}\n` +
                `Size:            ${data.fileSize ? (data.fileSize / 1024).toFixed(1) + " KB" : "unknown"}\n` +
                `Processing time: ${data.took || 0}ms\n\n` +
                `The PDF is base64-encoded (${(data.data.length / 1024).toFixed(0)} KB encoded). ` +
                `Decode and save with:\n` +
                `  node -e "require('fs').writeFileSync('out.pdf', Buffer.from('<data>', 'base64'))"\n\n` +
                `Base64 data (first 200 chars):\n` +
                truncateText(data.data, 200),
            },
          ],
        };
      }

      // ---------------------------------------------------------------
      // analyze
      // ---------------------------------------------------------------
      case "analyze": {
        const response = await callSnapAPI(
          "analyze",
          "POST",
          args as Record<string, unknown>
        );
        const data = (await response.json()) as {
          success: boolean;
          analysis?: string;
          result?: string;
          url?: string;
          responseTime?: number;
        };

        if (!data.success) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Analysis failed. The analyze endpoint may be temporarily unavailable. " +
                  "You can use the extract tool to fetch page content and analyze it yourself.",
              },
            ],
            isError: true,
          };
        }

        const analysisText = data.analysis || data.result || "No analysis returned.";
        return {
          content: [
            {
              type: "text" as const,
              text: truncateText(analysisText, 50_000),
            },
          ],
        };
      }

      // ---------------------------------------------------------------
      // video
      // ---------------------------------------------------------------
      case "video": {
        const response = await callSnapAPI(
          "video",
          "POST",
          args as Record<string, unknown>
        );
        const data = (await response.json()) as {
          success: boolean;
          url?: string;
          downloadUrl?: string;
          fileSize?: number;
          duration?: number;
          took?: number;
        };

        if (!data.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Video recording failed.",
              },
            ],
            isError: true,
          };
        }

        const downloadUrl = data.downloadUrl || data.url;
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Video recorded successfully.\n` +
                `Source:          ${(args?.url as string) || "unknown"}\n` +
                `Duration:        ${data.duration ? data.duration + "s" : "unknown"}\n` +
                `Size:            ${data.fileSize ? (data.fileSize / 1024 / 1024).toFixed(2) + " MB" : "unknown"}\n` +
                `Processing time: ${data.took || 0}ms\n\n` +
                (downloadUrl ? `Download URL: ${downloadUrl}` : "No download URL returned."),
            },
          ],
        };
      }

      // ---------------------------------------------------------------
      // get_usage
      // ---------------------------------------------------------------
      case "get_usage": {
        // Try the dedicated quota endpoint first, fall back to dashboard overview
        let usageText: string | null = null;

        // Attempt 1: /v1/quota
        try {
          const quotaResp = await callSnapAPI("quota", "GET");
          const q = (await quotaResp.json()) as {
            plan?: string;
            used?: number;
            limit?: number;
            remaining?: number;
            percentUsed?: number;
            resetsAt?: string;
          };
          usageText =
            `SnapAPI Quota\n` +
            `=============\n` +
            `Plan:      ${q.plan || "unknown"}\n` +
            `Used:      ${q.used ?? "?"} / ${q.limit ?? "?"} requests\n` +
            `Remaining: ${q.remaining ?? "?"} requests\n` +
            `Usage:     ${q.percentUsed ?? "?"}%\n` +
            `Resets at: ${q.resetsAt || "unknown"}`;
        } catch (err) {
          if (err instanceof McpError) throw err;
          process.stderr.write(
            `get_usage: /v1/quota failed: ${err instanceof Error ? err.message : err}\n`
          );
        }

        // Attempt 2: /v1/dashboard/overview
        if (!usageText) {
          try {
            const overviewResp = await callSnapAPI("dashboard/overview", "GET");
            const d = (await overviewResp.json()) as {
              user?: { plan?: string; email?: string };
              quota?: {
                used?: number;
                limit?: number;
                remaining?: number;
                percentUsed?: number;
                resetsAt?: string;
              };
              stats?: {
                totalRequests?: number;
                successful?: number;
                failed?: number;
                avgResponseTime?: number;
              };
            };
            const q = d.quota || {};
            const s = d.stats || {};
            const u = d.user || {};
            usageText =
              `SnapAPI Account Overview\n` +
              `========================\n` +
              `Plan:  ${u.plan || "unknown"}\n` +
              `Email: ${u.email || "unknown"}\n\n` +
              `Quota This Month\n` +
              `  Used:      ${q.used ?? "?"} / ${q.limit ?? "?"} requests\n` +
              `  Remaining: ${q.remaining ?? "?"} requests\n` +
              `  Usage:     ${q.percentUsed ?? "?"}%\n` +
              `  Resets at: ${q.resetsAt || "unknown"}\n\n` +
              `Monthly Stats\n` +
              `  Total requests:    ${s.totalRequests ?? 0}\n` +
              `  Successful:        ${s.successful ?? 0}\n` +
              `  Failed:            ${s.failed ?? 0}\n` +
              `  Avg response time: ${s.avgResponseTime ?? 0}ms`;
          } catch (err) {
            if (err instanceof McpError) throw err;
            process.stderr.write(
              `get_usage: /v1/dashboard/overview failed: ${err instanceof Error ? err.message : err}\n`
            );
          }
        }

        if (usageText) {
          return { content: [{ type: "text" as const, text: usageText }] };
        }

        return {
          content: [
            {
              type: "text" as const,
              text:
                "Could not retrieve usage data automatically. " +
                "Visit https://app.snapapi.pics/dashboard to check your usage.",
            },
          ],
        };
      }

      // ---------------------------------------------------------------
      // list_devices
      // ---------------------------------------------------------------
      case "list_devices": {
        const response = await callSnapAPI("devices", "GET");
        const data = (await response.json()) as {
          success: boolean;
          devices: Record<
            string,
            Array<{
              id: string;
              name: string;
              width: number;
              height: number;
              deviceScaleFactor: number;
              isMobile: boolean;
            }>
          >;
          total: number;
        };

        if (!data.devices || typeof data.devices !== "object") {
          return {
            content: [
              { type: "text" as const, text: "No device data returned from the API." },
            ],
            isError: true,
          };
        }

        let output = `Available Device Presets (${data.total ?? 0} total)\n`;
        output += "=".repeat(45) + "\n\n";

        for (const [category, devices] of Object.entries(data.devices)) {
          output += `${category.toUpperCase()}\n`;
          for (const d of devices) {
            output += `  ${d.id.padEnd(25)} ${d.width}x${d.height} @${d.deviceScaleFactor}x${d.isMobile ? " (mobile)" : ""}\n`;
          }
          output += "\n";
        }

        output +=
          'Use any device id as the "device" parameter in the screenshot or video tool.';

        return {
          content: [{ type: "text" as const, text: output }],
        };
      }

      // ---------------------------------------------------------------
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    if (error instanceof McpError) throw error;

    // Provide a friendlier message for request timeouts
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new McpError(
        ErrorCode.InternalError,
        `Tool "${name}" timed out after ${REQUEST_TIMEOUT_MS / 1000}s. ` +
          "The target page may be slow to load — try increasing the delay or using a simpler URL."
      );
    }

    const message =
      error instanceof Error ? error.message : String(error);
    throw new McpError(
      ErrorCode.InternalError,
      `Tool "${name}" failed: ${message}`
    );
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`SnapAPI MCP server v${VERSION} running on stdio\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal error: ${error}\n`);
  process.exit(1);
});
