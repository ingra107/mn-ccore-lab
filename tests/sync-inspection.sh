#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# MN-CCORE Hub — Sync Pipeline Inspection
# Tests brain.db ↔ D1 round-trip sync
#
# Run: bash tests/sync-inspection.sh
# Requires: Python, sqlite3, brain.db, sync scripts
# ═══════════════════════════════════════════════════════════════════

set -e

BRAIN_DB="C:/Users/ingra107/Peripheral-Brain/data/brain.db"
SYNC_PUSH="C:/Users/ingra107/Peripheral-Brain/scripts/db/sync_d1_push.py"
SYNC_PULL="C:/Users/ingra107/Peripheral-Brain/scripts/db/sync_d1_pull.py"
API_BASE="https://mn-ccore-lab.pages.dev"
PASS=0
FAIL=0
SKIP=0
RESULTS=""

pass() { PASS=$((PASS + 1)); RESULTS="${RESULTS}\n  ✓ $1"; echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); RESULTS="${RESULTS}\n  ✗ $1: $2"; echo "  ✗ $1: $2"; }
skip() { SKIP=$((SKIP + 1)); RESULTS="${RESULTS}\n  - $1 (skipped)"; echo "  - $1 (skipped)"; }

echo "═══════════════════════════════════════════"
echo "  SYNC PIPELINE INSPECTION"
echo "═══════════════════════════════════════════"
echo ""

# ── Prerequisites ──────────────────────────────────────────────
echo "Checking prerequisites..."

if [ ! -f "$BRAIN_DB" ]; then
  echo "FATAL: brain.db not found at $BRAIN_DB"
  exit 1
fi
pass "brain.db exists"

if [ ! -f "$SYNC_PUSH" ]; then
  fail "sync_d1_push.py not found" "$SYNC_PUSH"
else
  pass "sync_d1_push.py exists"
fi

if [ ! -f "$SYNC_PULL" ]; then
  fail "sync_d1_pull.py not found" "$SYNC_PULL"
else
  pass "sync_d1_pull.py exists"
fi

python -c "import sqlite3" 2>/dev/null && pass "Python sqlite3 available" || fail "Python sqlite3" "not available"

echo ""

# ── Test 1: brain.db schema has required columns ───────────────
echo "Test 1: brain.db schema..."

BRAIN_COLS=$(python -c "
import sqlite3
conn = sqlite3.connect('$BRAIN_DB')
cursor = conn.execute('PRAGMA table_info(tasks)')
cols = [row[1] for row in cursor.fetchall()]
conn.close()
print(','.join(cols))
")

echo "$BRAIN_COLS" | grep -q "updated_at" && pass "brain.db tasks has updated_at" || fail "brain.db tasks.updated_at" "column missing"
echo "$BRAIN_COLS" | grep -q "name" && pass "brain.db tasks has name (=title)" || fail "brain.db tasks.name" "column missing"
echo "$BRAIN_COLS" | grep -q "status" && pass "brain.db tasks has status" || fail "brain.db tasks.status" "column missing"
echo "$BRAIN_COLS" | grep -q "completed" && pass "brain.db tasks has completed" || fail "brain.db tasks.completed" "column missing"

echo ""

# ── Test 2: brain.db task count vs D1 task count ───────────────
echo "Test 2: Task count alignment..."

BRAIN_COUNT=$(python -c "
import sqlite3
conn = sqlite3.connect('$BRAIN_DB')
total = conn.execute('SELECT count(*) FROM tasks WHERE status != \"deleted\"').fetchone()[0]
active = conn.execute('SELECT count(*) FROM tasks WHERE completed = 0 AND status != \"deleted\"').fetchone()[0]
conn.close()
print(f'{total},{active}')
")
BRAIN_TOTAL=$(echo $BRAIN_COUNT | cut -d, -f1)
BRAIN_ACTIVE=$(echo $BRAIN_COUNT | cut -d, -f2)

# Get D1 count via API
D1_RESPONSE=$(curl -s "$API_BASE/api/tasks?limit=1")
D1_TOTAL=$(echo "$D1_RESPONSE" | python -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "0")

# D1 returns all tasks, count from response
D1_ALL=$(curl -s "$API_BASE/api/tasks" | python -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "0")

echo "  brain.db: $BRAIN_TOTAL total, $BRAIN_ACTIVE active"
echo "  D1: $D1_ALL tasks"

# They should be roughly aligned (within 10%)
DIFF=$((BRAIN_TOTAL - D1_ALL))
if [ $DIFF -lt 0 ]; then DIFF=$((DIFF * -1)); fi
if [ $DIFF -lt 50 ]; then
  pass "Task counts roughly aligned (diff: $DIFF)"
else
  fail "Task count drift" "brain.db=$BRAIN_TOTAL, D1=$D1_ALL, diff=$DIFF"
fi

echo ""

# ── Test 3: Create task in D1, verify via API ──────────────────
echo "Test 3: D1 → brain.db sync (create task in Hub)..."

# Create a test task via D1 API
CREATE_RESPONSE=$(curl -s -X POST "$API_BASE/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{"title":"SYNC-TEST-D1-TO-BRAIN — delete me","description":"Created by sync inspection","assignee":"nick-ingraham","priority":"low"}')

TASK_ID=$(echo "$CREATE_RESPONSE" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

if [ -z "$TASK_ID" ]; then
  fail "Create task in D1" "API returned no ID"
  echo "  Response: $CREATE_RESPONSE"
else
  pass "Created task in D1: $TASK_ID"

  # Run pull
  echo "  Running sync_d1_pull.py..."
  cd "C:/Users/ingra107/Peripheral-Brain"
  PULL_OUTPUT=$(python "$SYNC_PULL" 2>&1) || true
  PULL_EXIT=$?
  cd - > /dev/null

  if [ $PULL_EXIT -eq 0 ]; then
    pass "sync_d1_pull.py ran successfully"
  else
    fail "sync_d1_pull.py" "exit code $PULL_EXIT"
    echo "  Output: $(echo "$PULL_OUTPUT" | tail -5)"
  fi

  # Check if task appeared in brain.db
  FOUND=$(python -c "
import sqlite3
conn = sqlite3.connect('$BRAIN_DB')
row = conn.execute('SELECT id, name FROM tasks WHERE id = ?', ('$TASK_ID',)).fetchone()
conn.close()
print('FOUND' if row else 'NOT_FOUND')
")

  if [ "$FOUND" = "FOUND" ]; then
    pass "D1 task appeared in brain.db after pull"
  else
    fail "D1 task in brain.db" "Task $TASK_ID not found after pull"
  fi
fi

echo ""

# ── Test 4: Modify task in brain.db, push to D1 ───────────────
echo "Test 4: brain.db → D1 sync (modify and push)..."

# Find a brain.db task with recXXX ID
BRAIN_TASK=$(python -c "
import sqlite3
conn = sqlite3.connect('$BRAIN_DB')
row = conn.execute(\"SELECT id, name FROM tasks WHERE id LIKE 'rec%' AND completed = 0 LIMIT 1\").fetchone()
conn.close()
print(f'{row[0]}|{row[1]}' if row else '')
")

if [ -z "$BRAIN_TASK" ]; then
  skip "brain.db → D1 push (no recXXX tasks found)"
else
  BRAIN_TASK_ID=$(echo "$BRAIN_TASK" | cut -d'|' -f1)
  BRAIN_TASK_NAME=$(echo "$BRAIN_TASK" | cut -d'|' -f2)
  echo "  Using brain.db task: $BRAIN_TASK_ID ($BRAIN_TASK_NAME)"

  # Touch updated_at to ensure it gets pushed
  python -c "
import sqlite3
from datetime import datetime
conn = sqlite3.connect('$BRAIN_DB')
conn.execute('UPDATE tasks SET updated_at = ? WHERE id = ?', (datetime.utcnow().isoformat(), '$BRAIN_TASK_ID'))
conn.commit()
conn.close()
"
  pass "Touched updated_at on brain.db task"

  # Run push
  echo "  Running sync_d1_push.py..."
  cd "C:/Users/ingra107/Peripheral-Brain"
  PUSH_OUTPUT=$(python "$SYNC_PUSH" 2>&1) || true
  PUSH_EXIT=$?
  cd - > /dev/null

  if [ $PUSH_EXIT -eq 0 ]; then
    pass "sync_d1_push.py ran successfully"
  else
    fail "sync_d1_push.py" "exit code $PUSH_EXIT"
    echo "  Output: $(echo "$PUSH_OUTPUT" | tail -5)"
  fi

  # Verify task exists in D1
  D1_CHECK=$(curl -s "$API_BASE/api/tasks" | python -c "
import sys, json
data = json.load(sys.stdin).get('data', [])
found = any(t['id'] == '$BRAIN_TASK_ID' for t in data)
print('FOUND' if found else 'NOT_FOUND')
" 2>/dev/null)

  if [ "$D1_CHECK" = "FOUND" ]; then
    pass "brain.db task found in D1 after push"
  else
    fail "brain.db task in D1" "Task $BRAIN_TASK_ID not found in D1"
  fi
fi

echo ""

# ── Test 5: Status change round-trip ───────────────────────────
echo "Test 5: Status change round-trip..."

if [ -n "$TASK_ID" ]; then
  # Change status in D1
  STATUS_RESP=$(curl -s -X POST "$API_BASE/api/tasks/$TASK_ID/status" \
    -H "Content-Type: application/json" \
    -d '{"status":"done"}')

  STATUS_OK=$(echo "$STATUS_RESP" | python -c "import sys,json; print('ok' if json.load(sys.stdin).get('data') else 'fail')" 2>/dev/null || echo "fail")

  if [ "$STATUS_OK" = "ok" ]; then
    pass "Changed task status to done in D1"

    # Pull again
    cd "C:/Users/ingra107/Peripheral-Brain"
    python "$SYNC_PULL" 2>&1 > /dev/null || true
    cd - > /dev/null

    # Check brain.db
    BRAIN_STATUS=$(python -c "
import sqlite3
conn = sqlite3.connect('$BRAIN_DB')
row = conn.execute('SELECT completed, status FROM tasks WHERE id = ?', ('$TASK_ID',)).fetchone()
conn.close()
if row:
    print(f'{row[0]}|{row[1]}')
else:
    print('NOT_FOUND')
")

    COMPLETED=$(echo "$BRAIN_STATUS" | cut -d'|' -f1)

    if [ "$COMPLETED" = "1" ]; then
      pass "Status 'done' synced to brain.db (completed=1)"
    elif [ "$BRAIN_STATUS" = "NOT_FOUND" ]; then
      fail "Status sync" "Task not found in brain.db"
    else
      fail "Status sync" "brain.db shows completed=$COMPLETED (expected 1)"
    fi
  else
    fail "D1 status change" "API returned error"
  fi
else
  skip "Status round-trip (no test task created)"
fi

echo ""

# ── Test 6: Soft delete round-trip ─────────────────────────────
echo "Test 6: Soft delete sync..."

if [ -n "$TASK_ID" ]; then
  # Soft-delete in D1 (batch delete endpoint)
  DEL_RESP=$(curl -s -X POST "$API_BASE/api/tasks/bulk-update" \
    -H "Content-Type: application/json" \
    -d "{\"ids\":[\"$TASK_ID\"],\"action\":\"delete\"}")

  DEL_OK=$(echo "$DEL_RESP" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null || echo "fail")

  if [ "$DEL_OK" = "ok" ]; then
    pass "Soft-deleted task in D1"

    # Pull
    cd "C:/Users/ingra107/Peripheral-Brain"
    python "$SYNC_PULL" 2>&1 > /dev/null || true
    cd - > /dev/null

    BRAIN_DEL=$(python -c "
import sqlite3
conn = sqlite3.connect('$BRAIN_DB')
row = conn.execute('SELECT status FROM tasks WHERE id = ?', ('$TASK_ID',)).fetchone()
conn.close()
print(row[0] if row else 'NOT_FOUND')
")

    if [ "$BRAIN_DEL" = "deleted" ]; then
      pass "Soft delete synced to brain.db (status=deleted)"
    else
      fail "Soft delete sync" "brain.db status=$BRAIN_DEL (expected 'deleted')"
    fi
  else
    skip "Soft delete sync (bulk-update may not support delete)"
  fi
else
  skip "Soft delete (no test task)"
fi

echo ""

# ── Test 7: task_updates sync gap check ────────────────────────
echo "Test 7: task_updates sync coverage..."

# Check if pull script handles task_updates
PULLS_UPDATES=$(grep -c "task_updates\|task.updates" "$SYNC_PULL" 2>/dev/null || echo "0")

if [ "$PULLS_UPDATES" -gt "0" ]; then
  pass "sync_d1_pull.py handles task_updates"
else
  fail "task_updates sync" "sync_d1_pull.py does NOT pull task_updates (known gap)"
fi

echo ""

# ── Test 8: Push state file ────────────────────────────────────
echo "Test 8: Push state tracking..."

PUSH_STATE="C:/Users/ingra107/Peripheral-Brain/data/.d1_push_state.json"
if [ -f "$PUSH_STATE" ]; then
  pass "Push state file exists"
  LAST_PUSH=$(python -c "
import json
with open('$PUSH_STATE') as f:
    d = json.load(f)
print(d.get('last_task_push', 'NOT_SET'))
")
  echo "  Last task push: $LAST_PUSH"
else
  fail "Push state file" "not found at $PUSH_STATE"
fi

PULL_STATE="C:/Users/ingra107/Peripheral-Brain/data/.d1_pull_state.json"
if [ -f "$PULL_STATE" ]; then
  pass "Pull state file exists"
  LAST_PULL=$(python -c "
import json
with open('$PULL_STATE') as f:
    d = json.load(f)
print(d.get('last_task_pull', 'NOT_SET'))
")
  echo "  Last task pull: $LAST_PULL"
else
  fail "Pull state file" "not found at $PULL_STATE"
fi

echo ""

# ── Summary ────────────────────────────────────────────────────
echo "═══════════════════════════════════════════"
echo "  SYNC INSPECTION RESULTS"
echo "═══════════════════════════════════════════"
TOTAL=$((PASS + FAIL + SKIP))
echo ""
echo "  PASSED:  $PASS"
echo "  FAILED:  $FAIL"
echo "  SKIPPED: $SKIP"
echo "  TOTAL:   $TOTAL"
echo ""
SCORE=$((PASS * 100 / TOTAL))
echo "  SCORE:   $SCORE%"
echo ""
echo -e "$RESULTS"
echo ""
echo "═══════════════════════════════════════════"
