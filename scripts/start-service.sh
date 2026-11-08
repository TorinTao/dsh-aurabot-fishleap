#!/usr/bin/env bash
# 启动 lexmount-patrol 服务（后台）
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/data"
nohup node "$ROOT/src/cli.mjs" serve >> "$ROOT/data/server.log" 2>> "$ROOT/data/server.err.log" &
echo "lexmount-patrol 已启动 pid=$!  面板: http://127.0.0.1:4571/  日志: $ROOT/data/server.log"
