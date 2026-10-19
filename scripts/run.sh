#!/usr/bin/env bash
# Build the plugin frontend and package a .dbxp for the current platform.
# Requires: node + pnpm on PATH, cargo for the Rust sidecar.
# The dbx-plugin CLI bundles its own packaging SDK; the Rust sidecar SDK used
# by this repository is vendored under shared/sdk/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../" && pwd)"
echo  "$ROOT"
# dbx-plugin package runs its own `cargo build` for the Rust backend; without
# CARGO_TARGET_DIR it builds into a throwaway dist/.build-rust-<triple> staging
# dir (wiped afterwards) = full dep-tree rebuild on every release. Redirect it
# to the warm backend/target — verified the CLI reuses and keeps it. Do NOT pin
# RUSTUP_TOOLCHAIN here (docker builds via rust:1 + cargo-zigbuild lack 1.97.1);
# the release pipeline pins it itself.
export CARGO_TARGET_DIR="$PWD/backend/target"

echo "==> package .dbxp"
# CLI 打包的内部 cargo build 会把 Rust SDK patch 覆盖到 DBX_PLUGIN_SDK_ROOT；
# 未设置时 npm 包装器注入 CLI 自带 sdk-root，vendored SDK（shared/sdk/）的本地
# 修复进不了产物——用垫片把 SDK 根指回 vendored 副本，打完做字节级反例断言。
export DBX_PLUGIN_SDK_ROOT="$(bash $ROOT/scripts/sdk_root_shim.sh)"
if ! command -v dbx-plugin >/dev/null 2>&1; then
  echo "dbx-plugin CLI not found; install @dbx-app/plugin-cli or set PATH before packaging" >&2
  exit 1
fi
dbx-plugin dev --path . --port 5190

