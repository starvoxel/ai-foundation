#!/bin/bash
# rev: 1
set -euo pipefail
# export AIF_AGENT=reviewer   # optional: start repos as this agent (see "Primary agent")
npm install -g https://codeload.github.com/starvoxel/ai-foundation/tar.gz/refs/heads/main --ignore-scripts
bash "$(npm root -g)/ai-foundation/scripts/cloud-setup.sh"
