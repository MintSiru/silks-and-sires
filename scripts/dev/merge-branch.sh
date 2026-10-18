#!/bin/bash
# 에이전트 작업(작업 트리 경로 또는 브랜치)을 현재 작업 트리에 3-way 로 얹는다. 커밋하지 않는다.
# 사용: scripts/dev/merge-branch.sh <작업트리경로|브랜치> <기준커밋>
#   작업 트리: 미커밋 변경까지 포함해 기준 커밋과의 차이를 얹는다(.claude/worktrees/agent-* 용)
#   브랜치:    origin/agent/<이름>/<티켓> 처럼 브랜치 이름을 주면 기준 커밋..브랜치 차이를 얹는다(AionUI 에이전트 용)
# 충돌이 나면 충돌 파일 목록을 출력한다. 끝나면 git status 로 확인하고, 검증 뒤 직접 커밋한다.
set -e
SRC=$1; BASE=$2
[ -z "$SRC" ] || [ -z "$BASE" ] && { echo "사용: $0 <작업트리|브랜치> <기준커밋>"; exit 1; }
PATCH=$(mktemp)
if [ -d "$SRC" ]; then
  (cd "$SRC" && git add -N . 2>/dev/null || true; git diff "$BASE" -- . ':!node_modules' > "$PATCH"; git reset -q)
else
  git fetch -q origin 2>/dev/null || true
  git diff "$BASE" "$SRC" -- . ':!node_modules' > "$PATCH"
fi
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT"
# 3-way 적용은 인덱스가 작업 트리와 같아야 하므로 잠시 스테이징했다가 되돌린다
git add -A src tests docs 2>/dev/null || true
git apply --3way "$PATCH" 2>&1 | grep -v "Falling back\|cleanly" || true
git reset -q
grep -rln "<<<<<<<" src tests docs package.json 2>/dev/null || echo "NO_CONFLICT"
rm -f "$PATCH"
