#!/usr/bin/env bash
# 探测 docreader gRPC 是否可达（TCP + 与主程序相同的 ListEngines 调用）。
# 用法:
#   ./scripts/test-docreader.sh
#   ./scripts/test-docreader.sh localhost:5410
#   ./scripts/test-docreader.sh 127.0.0.1:50051
set -euo pipefail

ADDR="${1:-localhost:5410}"
HOST="${ADDR%%:*}"
PORT="${ADDR##*:}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Target: $ADDR (TCP then gRPC ListEngines)"
echo

echo "==> 1) TCP connect $HOST:$PORT"
if command -v nc >/dev/null 2>&1; then
  if ! nc -z -w 3 "$HOST" "$PORT" 2>/dev/null; then
    echo "[FAIL] 无法建立 TCP 连接。请确认 docreader 已启动，且端口映射正确（如 5410:50051）。"
    exit 1
  fi
else
  if ! (echo >/dev/tcp/"$HOST"/"$PORT") 2>/dev/null; then
    echo "[FAIL] 无法建立 TCP 连接（需要 bash 支持 /dev/tcp 或安装 nc）。"
    exit 1
  fi
fi
echo "[OK] TCP"
echo

echo "==> 2) gRPC ListEngines（与 WeKnora 主程序 dial 方式一致）"
if ! command -v go >/dev/null 2>&1; then
  echo "[SKIP] 未找到 go，无法运行 docreader_grpc_ping。"
  echo "       可安装 grpcurl 后执行:"
  echo "       grpcurl -import-path \"$ROOT/docreader/proto\" -proto docreader.proto -plaintext -d '{}' \"$ADDR\" docreader.DocReader/ListEngines"
  exit 0
fi

go run ./scripts/docreader_grpc_ping/ "$ADDR"
