#!/bin/zsh
cd "$(dirname "$0")"

NODE_BIN="/Users/wangxiaoxiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

if [ -x "$NODE_BIN" ]; then
  "$NODE_BIN" tests/self_check.mjs
elif command -v node >/dev/null 2>&1; then
  node tests/self_check.mjs
else
  echo "Node.js was not found."
  echo "Please install Node.js or run this project inside Codex with the bundled runtime."
  exit 1
fi

echo ""
echo "Self-check finished."
echo "Report file:"
echo "$(pwd)/tests/output/SELF_CHECK_REPORT.md"
echo ""
echo "You can close this window after reading the result."
read "?Press Enter to close..."
