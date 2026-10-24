#!/bin/bash
# Installs Agent-Reach (https://github.com/Panniantong/Agent-Reach) in cloud sessions.
# NOTE: do NOT use the PyPI "agent-reach" package; it is a different project.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

export PATH="$HOME/.local/bin:$PATH"

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi

# Idempotent: --force reinstalls/upgrades the tool in place
uv tool install --force \
  https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip

# Enables default channels and installs the agent skill
agent-reach setup

echo 'export PATH="$HOME/.local/bin:$PATH"' >> "${CLAUDE_ENV_FILE:-/dev/null}"
