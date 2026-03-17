#!/bin/bash
# SnapAPI MCP Server — Installation Helper
#
# Adds SnapAPI to Claude Desktop, Cursor, or Windsurf configuration.
# Usage: ./install-mcp.sh [claude|cursor|windsurf]

set -euo pipefail

TARGET="${1:-claude}"

case "$TARGET" in
  claude)
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    APP_NAME="Claude Desktop"
    ;;
  cursor)
    CONFIG_DIR="$HOME/.cursor"
    CONFIG_FILE="$CONFIG_DIR/mcp.json"
    APP_NAME="Cursor"
    ;;
  windsurf)
    CONFIG_DIR="$HOME/.codeium/windsurf"
    CONFIG_FILE="$CONFIG_DIR/mcp_config.json"
    APP_NAME="Windsurf"
    ;;
  *)
    echo "Usage: $0 [claude|cursor|windsurf]"
    exit 1
    ;;
esac

echo "SnapAPI MCP Server Installer"
echo "============================"
echo ""
echo "This will configure SnapAPI for $APP_NAME."
echo ""
echo "Enter your SnapAPI API key (from https://app.snapapi.pics/dashboard):"
read -r API_KEY

if [ -z "$API_KEY" ]; then
  echo "Error: API key is required."
  exit 1
fi

mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ]; then
  # Config exists — merge using Python
  python3 - "$CONFIG_FILE" "$API_KEY" << 'PYEOF'
import json
import sys

config_file = sys.argv[1]
api_key = sys.argv[2]

with open(config_file) as f:
    config = json.load(f)

config.setdefault("mcpServers", {})["snapapi"] = {
    "command": "npx",
    "args": ["snapapi-mcp"],
    "env": {"SNAPAPI_API_KEY": api_key}
}

with open(config_file, "w") as f:
    json.dump(config, f, indent=2)

print(f"Added snapapi to existing config: {config_file}")
PYEOF
else
  # Create new config
  python3 - "$CONFIG_FILE" "$API_KEY" << 'PYEOF'
import json
import sys

config_file = sys.argv[1]
api_key = sys.argv[2]

config = {
    "mcpServers": {
        "snapapi": {
            "command": "npx",
            "args": ["snapapi-mcp"],
            "env": {"SNAPAPI_API_KEY": api_key}
        }
    }
}

with open(config_file, "w") as f:
    json.dump(config, f, indent=2)

print(f"Created config: {config_file}")
PYEOF
fi

echo ""
echo "Done! Restart $APP_NAME to start using SnapAPI tools."
echo ""
echo "Available tools:"
echo "  - ping:         Verify connectivity and API key"
echo "  - screenshot:   Capture any URL as an image"
echo "  - scrape:       Extract page content (text/HTML/links)"
echo "  - extract:      Clean content extraction for LLMs"
echo "  - pdf:          Generate PDFs from URLs or HTML"
echo "  - analyze:      Extract + AI-analyze a page in one call"
echo "  - video:        Record a browser session as WebM"
echo "  - get_usage:    View your quota and stats"
echo "  - list_devices: List device presets for emulation"
