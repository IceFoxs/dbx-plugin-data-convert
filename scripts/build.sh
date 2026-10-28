#!/usr/bin/env bash
# 数据转换插件构建脚本（纯前端 universal 包）。
#
#   ./scripts/build.sh            跑回归用例后打包 dist/*.dbxp
#   ./scripts/build.sh dev        启动本地工作台调试（PORT 可覆盖端口，默认 5190）
#   ./scripts/build.sh test       只跑转换核心回归用例
#
# 本插件没有 Rust/Go sidecar，因此不需要 CARGO_TARGET_DIR / DBX_PLUGIN_SDK_ROOT
# 之类的 SDK 垫片；早先从带后端模板复制过来的那段逻辑已移除。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-package}"

run_tests() {
  if command -v node >/dev/null 2>&1; then
    node "$ROOT/tests/converters.test.js"
    node "$ROOT/tests/diff.test.js"
    node "$ROOT/tests/objdiff.test.js"
    node "$ROOT/tests/sqlgen.test.js"
    node "$ROOT/tests/sheetconv.test.js"
    node "$ROOT/tests/xlsxread.test.js"
    node "$ROOT/tests/imgconv.test.js"
    node "$ROOT/tests/codegen.test.js"
    node "$ROOT/tests/confconv.test.js"
    node "$ROOT/tests/jsonpath.test.js"
    node "$ROOT/tests/schema.test.js"
    node "$ROOT/tests/escape.test.js"
    node "$ROOT/tests/bytes.test.js"
    node "$ROOT/tests/chart.test.js"
    node "$ROOT/tests/time.test.js"
    node "$ROOT/tests/stats.test.js"
    node "$ROOT/tests/sqlrun.test.js"
    node "$ROOT/tests/qr.test.js"
    node "$ROOT/tests/flow.test.js"
    node "$ROOT/tests/i18n.test.js"
    node "$ROOT/tests/assets.test.js"
  else
    echo "==> node not found, skip unit tests" >&2
  fi
}

case "$MODE" in
  dev)
    if ! command -v dbx-plugin >/dev/null 2>&1; then
      echo "dbx-plugin CLI not found; install @dbx-app/plugin-cli or set PATH" >&2
      exit 1
    fi
    exec dbx-plugin dev --path "$ROOT" --port "${PORT:-5190}"
    ;;
  test)
    run_tests
    ;;
  package)
    if ! command -v dbx-plugin >/dev/null 2>&1; then
      echo "dbx-plugin CLI not found; install @dbx-app/plugin-cli or set PATH" >&2
      exit 1
    fi
    run_tests
    # .dbxp 会把整个 ui/ 拷进包，先清掉系统垃圾文件
    find "$ROOT/ui" "$ROOT/assets" \( -name '.DS_Store' -o -name 'Thumbs.db' \) -delete >/dev/null 2>&1 || true
    cd "$ROOT"
    dbx-plugin package .
    ;;
  *)
    echo "usage: $0 [package|dev|test]" >&2
    exit 2
    ;;
esac
