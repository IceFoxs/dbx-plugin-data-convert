#!/usr/bin/env bash
# 兼容旧用法：等价于 `scripts/build.sh dev`。新脚本请直接使用 build.sh。
set -euo pipefail
exec "$(dirname "$0")/build.sh" dev "$@"
