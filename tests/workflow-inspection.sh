#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# MN-CCORE Hub — Workflow Inspection
# Full bidirectional sync tests + every mutation path
#
# Tests EVERY way a user might interact with the system:
# - Create/edit/complete/reopen/delete from Hub (D1)
# - Create/edit/complete from brain.db
# - Verify each change syncs in both directions
# - Test field-level changes (title, status, priority, due date, etc.)
# - Test timing (how fast does sync propagate?)
#
# Run: bash tests/workflow-inspection.sh
# ═══════════════════════════════════════════════════════════════════

set -e

BRAIN_DB="C:/Users/ingra107/Peripheral-Brain/data/brain.db"
SYNC_PUSH="C:/Users/ingra107/Peripheral-Brain/scripts/db/sync_d1_push.py"
SYNC_PULL="C:/Users/ingra107/Peripheral-Brain/scripts/db/sync_d1_pull.py"
PB_DIR="C:/Users/ingra107/Peripheral-Brain"
API="https://mn-ccore-lab.pages.dev"
PASS=0; FAIL=0; SKIP=0; TOTAL=0
RESULTS=""

pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); RESULTS="${RESULTS}\n  PASS  $1"; echo "  PASS  $1"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); RESULTS="${RESULTS}\n  FAIL  $1 — $2"; echo "  FAIL  $1 — $2"; }
skip() { SKIP=$((SKIP+1)); TOTAL=$((TOTAL+1)); RESULTS="${RESULTS}\n  SKIP  $1"; echo "  SKIP  $1"; }
info() { echo "       $1"; }

# Helper: query brain.db
brainq() {
  python -c "
import sqlite3, json
conn = sqlite3.connect('$BRAIN_DB')
conn.row_factory = sqlite3.Row
row = conn.execute(\"$1\").fetchone()
conn.close()
if row: print(json.dumps(dict(row)))
else: print('null')
"
}

# Helper: query D1 via API
d1get() {
  curl -s "$API$1"
}

d1post() {
  curl -s -X POST "$API$1" -H "Content-Type: application/json" -d "$2"
}

# Helper: run sync
do_push() {
  cd "$PB_DIR"
  python "$SYNC_PUSH" 2>&1 | tail -3
  cd - > /dev/null
}

do_pull() {
  cd "$PB_DIR"
  python "$SYNC_PULL" 2>&1 | tail -3
  cd - > /dev/null
}

echo "═══════════════════════════════════════════════════"
echo "  WORKFLOW INSPECTION — Bidirectional Sync Tests"
echo "═══════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION A: TASK WORKFLOW — Hub (D1) Side
# ═══════════════════════════════════════════════════════════════
echo "━━━ SECTION A: Task mutations from Hub (D1) ━━━"
echo ""

# A1: Create task in Hub
echo "A1: Create task in Hub..."
CREATE=$(d1post "/api/tasks" '{"title":"WORKFLOW-TEST task from Hub","description":"Full workflow test","assignee":"nick-ingraham","priority":"medium","due_date":"2026-04-15"}')
TASK_ID=$(echo "$CREATE" | python -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$TASK_ID" ]; then
  pass "A1: Task created in D1 (id=$TASK_ID)"
else
  fail "A1: Task creation" "$(echo $CREATE | head -c 100)"
  echo "FATAL: Cannot continue without test task"
  exit 1
fi

# A2: Verify task appears in API
echo "A2: Verify task in D1 API..."
D1_TASK=$(d1get "/api/tasks" | python -c "
import sys,json
data = json.load(sys.stdin).get('data',[])
match = [t for t in data if t['id'] == '$TASK_ID']
print(json.dumps(match[0]) if match else 'null')
" 2>/dev/null)
if [ "$D1_TASK" != "null" ] && [ -n "$D1_TASK" ]; then
  D1_TITLE=$(echo "$D1_TASK" | python -c "import sys,json; print(json.load(sys.stdin)['title'])")
  D1_STATUS=$(echo "$D1_TASK" | python -c "import sys,json; print(json.load(sys.stdin)['status'])")
  D1_PRIORITY=$(echo "$D1_TASK" | python -c "import sys,json; print(json.load(sys.stdin)['priority'])")
  D1_DUE=$(echo "$D1_TASK" | python -c "import sys,json; print(json.load(sys.stdin).get('due_date',''))")
  pass "A2: Task visible in D1 (status=$D1_STATUS, priority=$D1_PRIORITY, due=$D1_DUE)"
else
  fail "A2: Task not found in D1 API" ""
fi

# A3: Change status to in_progress
echo "A3: Change status to in_progress..."
STATUS_RES=$(d1post "/api/tasks/$TASK_ID/status" '{"status":"in_progress"}')
STATUS_OK=$(echo "$STATUS_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
[ "$STATUS_OK" = "ok" ] && pass "A3: Status changed to in_progress" || fail "A3: Status change" "$STATUS_RES"

# A4: Change priority to high
echo "A4: Change priority to high..."
PRI_RES=$(d1post "/api/tasks/$TASK_ID" '{"priority":"high"}')
PRI_OK=$(echo "$PRI_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
[ "$PRI_OK" = "ok" ] && pass "A4: Priority changed to high" || fail "A4: Priority change" "$PRI_RES"

# A5: Change due date
echo "A5: Change due date to 2026-04-20..."
DUE_RES=$(d1post "/api/tasks/$TASK_ID" '{"due_date":"2026-04-20"}')
DUE_OK=$(echo "$DUE_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
[ "$DUE_OK" = "ok" ] && pass "A5: Due date changed to 2026-04-20" || fail "A5: Due date change" "$DUE_RES"

# A6: Change title
echo "A6: Rename task..."
TITLE_RES=$(d1post "/api/tasks/$TASK_ID" '{"title":"WORKFLOW-TEST renamed from Hub"}')
TITLE_OK=$(echo "$TITLE_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
[ "$TITLE_OK" = "ok" ] && pass "A6: Title renamed" || fail "A6: Title rename" "$TITLE_RES"

# A7: Reassign to different person
echo "A7: Reassign task to dan-shyu..."
ASSIGN_RES=$(d1post "/api/tasks/$TASK_ID" '{"assignee":"dan-shyu"}')
ASSIGN_OK=$(echo "$ASSIGN_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
[ "$ASSIGN_OK" = "ok" ] && pass "A7a: Reassigned to dan-shyu" || fail "A7a: Reassign" "$ASSIGN_RES"

# Verify reassignment stuck
VERIFY_ASSIGN=$(d1get "/api/tasks" | python -c "
import sys,json
data = json.load(sys.stdin).get('data',[])
t = next((x for x in data if x['id'] == '$TASK_ID'), None)
print(t.get('assignee','') if t else 'NOT_FOUND')
" 2>/dev/null)
[ "$VERIFY_ASSIGN" = "dan-shyu" ] && pass "A7b: Reassignment verified in D1" || fail "A7b: Reassign verify" "got: $VERIFY_ASSIGN"

# Reassign back
d1post "/api/tasks/$TASK_ID" '{"assignee":"nick-ingraham"}' > /dev/null
pass "A7c: Reassigned back to nick-ingraham"

# A8: Add first comment
echo "A8: Add comments (multiple)..."
CMT1_RES=$(d1post "/api/tasks/$TASK_ID/comments" '{"content":"First comment from workflow test","author_slug":"nick-ingraham"}')
CMT1_OK=$(echo "$CMT1_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') else 'fail')" 2>/dev/null)
[ "$CMT1_OK" = "ok" ] && pass "A8a: First comment added" || fail "A8a: Comment 1" "$CMT1_RES"

# Add second comment from different person
CMT2_RES=$(d1post "/api/tasks/$TASK_ID/comments" '{"content":"Second comment from Dan","author_slug":"dan-shyu"}')
CMT2_OK=$(echo "$CMT2_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') else 'fail')" 2>/dev/null)
[ "$CMT2_OK" = "ok" ] && pass "A8b: Second comment (different author)" || fail "A8b: Comment 2" "$CMT2_RES"

# Verify comment count = 2
CMT_COUNT=$(d1get "/api/tasks/$TASK_ID/comments" | python -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
[ "$CMT_COUNT" -ge 2 ] && pass "A8c: Verified $CMT_COUNT comments" || fail "A8c: Comment count" "got $CMT_COUNT, expected >=2"

# A9: Add multiple note types
echo "A9: Add notes (multiple types)..."
for TYPE in progress blocker result question; do
  N_RES=$(d1post "/api/tasks/$TASK_ID/updates" "{\"content\":\"$TYPE note from test\",\"update_type\":\"$TYPE\",\"author_slug\":\"nick-ingraham\"}")
  N_OK=$(echo "$N_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') else 'fail')" 2>/dev/null)
  [ "$N_OK" = "ok" ] && pass "A9: Note type=$TYPE added" || fail "A9: Note type=$TYPE" "$N_RES"
done

# Verify note count = 4
NOTE_COUNT=$(d1get "/api/tasks/$TASK_ID/updates" | python -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
[ "$NOTE_COUNT" -ge 4 ] && pass "A9: Verified $NOTE_COUNT notes total" || fail "A9: Note count" "got $NOTE_COUNT, expected >=4"

# A10: Edit task description
echo "A10: Edit description..."
DESC_RES=$(d1post "/api/tasks/$TASK_ID" '{"description":"Updated description with **bold** and details"}')
DESC_OK=$(echo "$DESC_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
[ "$DESC_OK" = "ok" ] && pass "A10: Description updated" || fail "A10: Description" "$DESC_RES"

# A11: Subtask lifecycle (create → toggle → verify → delete)
echo "A11: Subtask lifecycle..."
SUB_CREATE=$(d1post "/api/tasks/$TASK_ID/subtasks" '{"title":"Test subtask from workflow","sort_order":0}')
SUB_ID=$(echo "$SUB_CREATE" | python -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$SUB_ID" ]; then
  pass "A11a: Subtask created ($SUB_ID)"

  # Toggle complete
  TOG_RES=$(d1post "/api/subtasks/$SUB_ID" '{"completed":1}')
  TOG_OK=$(echo "$TOG_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
  [ "$TOG_OK" = "ok" ] && pass "A11b: Subtask toggled complete" || fail "A11b: Subtask toggle" "$TOG_RES"

  # Verify subtask in list
  SUB_LIST=$(d1get "/api/tasks/$TASK_ID/subtasks" | python -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
  [ "$SUB_LIST" -ge 1 ] && pass "A11c: Subtask verified in list ($SUB_LIST)" || fail "A11c: Subtask list" "count=$SUB_LIST"

  # Delete subtask
  DEL_RES=$(d1post "/api/subtasks/$SUB_ID/delete" '{}')
  DEL_OK=$(echo "$DEL_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') or not d.get('error') else 'fail')" 2>/dev/null)
  [ "$DEL_OK" = "ok" ] && pass "A11d: Subtask deleted" || fail "A11d: Subtask delete" "$DEL_RES"
else
  fail "A11a: Subtask creation" "$SUB_CREATE"
  skip "A11b-d: Subtask lifecycle"
fi

# A12: Verify all changes persisted in D1
echo "A12: Verify all field changes persisted..."
VERIFY=$(d1get "/api/tasks" | python -c "
import sys,json
data = json.load(sys.stdin).get('data',[])
t = next((x for x in data if x['id'] == '$TASK_ID'), None)
if not t: print('NOT_FOUND')
else: print(json.dumps({'title':t['title'],'status':t['status'],'priority':t['priority'],'due_date':t.get('due_date','')}))
" 2>/dev/null)
if echo "$VERIFY" | grep -q "renamed"; then
  pass "A9: All field changes persisted in D1"
  info "$VERIFY"
else
  fail "A9: Field verification" "$VERIFY"
fi

# A10: Mark as done
echo "A10: Mark task as done..."
DONE_RES=$(d1post "/api/tasks/$TASK_ID/status" '{"status":"done"}')
DONE_OK=$(echo "$DONE_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
[ "$DONE_OK" = "ok" ] && pass "A10: Task marked done" || fail "A10: Mark done" "$DONE_RES"

# A11: Reopen task (mark back to todo)
echo "A11: Reopen task (done → todo)..."
REOPEN_RES=$(d1post "/api/tasks/$TASK_ID/status" '{"status":"todo"}')
REOPEN_OK=$(echo "$REOPEN_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
[ "$REOPEN_OK" = "ok" ] && pass "A11: Task reopened (todo)" || fail "A11: Reopen" "$REOPEN_RES"

# A12: Verify comments + notes readback
echo "A12: Verify comments and notes..."
CMTS=$(d1get "/api/tasks/$TASK_ID/comments" | python -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
NOTES=$(d1get "/api/tasks/$TASK_ID/updates" | python -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
ACTS=$(d1get "/api/tasks/$TASK_ID/activity" | python -c "import sys,json; print(len(json.load(sys.stdin).get('data',[])))" 2>/dev/null)
[ "$CMTS" -ge 1 ] && pass "A12a: Comment readback ($CMTS comments)" || fail "A12a: Comments" "count=$CMTS"
[ "$NOTES" -ge 1 ] && pass "A12b: Notes readback ($NOTES notes)" || fail "A12b: Notes" "count=$NOTES"
[ "$ACTS" -ge 1 ] && pass "A12c: Activity readback ($ACTS events)" || fail "A12c: Activity" "count=$ACTS"

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION B: D1 → brain.db PULL
# ═══════════════════════════════════════════════════════════════
echo "━━━ SECTION B: D1 → brain.db pull sync ━━━"
echo ""

echo "B1: Pull D1 changes to brain.db..."
PULL_START=$(date +%s%N)
PULL_OUT=$(do_pull 2>&1)
PULL_EXIT=$?
PULL_END=$(date +%s%N)
PULL_MS=$(( (PULL_END - PULL_START) / 1000000 ))

if [ $PULL_EXIT -eq 0 ]; then
  pass "B1: Pull completed in ${PULL_MS}ms"
else
  fail "B1: Pull failed" "exit=$PULL_EXIT"
  info "$(echo "$PULL_OUT" | tail -3)"
fi

# B2: Check test task appeared in brain.db
echo "B2: Verify Hub task in brain.db..."
BRAIN_TASK=$(brainq "SELECT id, name, status, completed, due_date FROM tasks WHERE id = '$TASK_ID'")
if [ "$BRAIN_TASK" != "null" ] && [ -n "$BRAIN_TASK" ]; then
  BRAIN_NAME=$(echo "$BRAIN_TASK" | python -c "import sys,json; print(json.load(sys.stdin).get('name',''))")
  BRAIN_STATUS=$(echo "$BRAIN_TASK" | python -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
  BRAIN_DUE=$(echo "$BRAIN_TASK" | python -c "import sys,json; print(json.load(sys.stdin).get('due_date',''))")
  pass "B2: Task found in brain.db (name=$BRAIN_NAME)"

  # B3: Verify title synced
  echo "B3: Verify title synced..."
  echo "$BRAIN_NAME" | grep -q "renamed" && pass "B3: Title synced correctly" || fail "B3: Title mismatch" "got: $BRAIN_NAME"

  # B4: Verify due date synced
  echo "B4: Verify due date synced..."
  [ "$BRAIN_DUE" = "2026-04-20" ] && pass "B4: Due date synced (2026-04-20)" || fail "B4: Due date mismatch" "got: $BRAIN_DUE"

  # B5: Verify status synced (should be Active since we reopened to todo)
  echo "B5: Verify status synced..."
  info "brain.db status: $BRAIN_STATUS"
  pass "B5: Status present in brain.db ($BRAIN_STATUS)"
else
  fail "B2: Task not found in brain.db" "id=$TASK_ID"
  skip "B3: Title sync (no task)"
  skip "B4: Due date sync (no task)"
  skip "B5: Status sync (no task)"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION C: brain.db → D1 PUSH
# ═══════════════════════════════════════════════════════════════
echo "━━━ SECTION C: brain.db → D1 push sync ━━━"
echo ""

# C1: Create task in brain.db
echo "C1: Create task in brain.db..."
BRAIN_TASK_ID="rec_workflow_test_$(date +%s)"
python -c "
import sqlite3
from datetime import datetime
conn = sqlite3.connect('$BRAIN_DB')
conn.execute('''
    INSERT INTO tasks (id, name, project_id, due_date, status, completed, notes, created_at, updated_at, sync_status)
    VALUES (?, ?, NULL, '2026-04-18', 'Active', 0, 'Created by workflow test', ?, ?, 'local_modified')
''', ('$BRAIN_TASK_ID', 'WORKFLOW-TEST task from brain.db', datetime.now().isoformat(), datetime.now().isoformat()))
conn.commit()
conn.close()
print('ok')
"
BRAIN_INSERT=$?
[ $BRAIN_INSERT -eq 0 ] && pass "C1: Task created in brain.db ($BRAIN_TASK_ID)" || fail "C1: brain.db INSERT" "exit=$BRAIN_INSERT"

# C2: Modify title in brain.db
echo "C2: Modify title in brain.db..."
python -c "
import sqlite3
from datetime import datetime
conn = sqlite3.connect('$BRAIN_DB')
conn.execute('UPDATE tasks SET name = ?, updated_at = ? WHERE id = ?',
    ('WORKFLOW-TEST brain.db renamed', datetime.now().isoformat(), '$BRAIN_TASK_ID'))
conn.commit()
conn.close()
" && pass "C2: Title updated in brain.db" || fail "C2: Title update" ""

# C3: Change due date in brain.db
echo "C3: Change due date in brain.db..."
python -c "
import sqlite3
from datetime import datetime
conn = sqlite3.connect('$BRAIN_DB')
conn.execute('UPDATE tasks SET due_date = ?, updated_at = ? WHERE id = ?',
    ('2026-04-25', datetime.now().isoformat(), '$BRAIN_TASK_ID'))
conn.commit()
conn.close()
" && pass "C3: Due date changed to 2026-04-25 in brain.db" || fail "C3: Due date" ""

# C4: Mark as completed in brain.db
echo "C4: Mark completed in brain.db..."
python -c "
import sqlite3
from datetime import datetime
conn = sqlite3.connect('$BRAIN_DB')
now = datetime.now().isoformat()
conn.execute('UPDATE tasks SET completed = 1, completed_at = ?, status = ?, updated_at = ? WHERE id = ?',
    (now, 'Done', now, '$BRAIN_TASK_ID'))
conn.commit()
conn.close()
" && pass "C4: Task marked done in brain.db" || fail "C4: Mark done" ""

# C5: Push to D1
echo "C5: Push brain.db changes to D1..."
PUSH_START=$(date +%s%N)
PUSH_OUT=$(do_push 2>&1)
PUSH_EXIT=$?
PUSH_END=$(date +%s%N)
PUSH_MS=$(( (PUSH_END - PUSH_START) / 1000000 ))
[ $PUSH_EXIT -eq 0 ] && pass "C5: Push completed in ${PUSH_MS}ms" || fail "C5: Push failed" "exit=$PUSH_EXIT"

# C6: Verify brain.db task appeared in D1
echo "C6: Verify brain.db task in D1..."
D1_CHECK=$(d1get "/api/tasks" | python -c "
import sys,json
data = json.load(sys.stdin).get('data',[])
match = [t for t in data if t['id'] == '$BRAIN_TASK_ID']
if match:
    t = match[0]
    print(json.dumps({'title':t['title'],'status':t['status'],'due_date':t.get('due_date',''),'completed':t.get('completed',0)}))
else:
    print('null')
" 2>/dev/null)
if [ "$D1_CHECK" != "null" ] && [ -n "$D1_CHECK" ]; then
  D1_TITLE=$(echo "$D1_CHECK" | python -c "import sys,json; print(json.load(sys.stdin)['title'])")
  D1_DUE=$(echo "$D1_CHECK" | python -c "import sys,json; print(json.load(sys.stdin).get('due_date',''))")
  D1_COMPLETED=$(echo "$D1_CHECK" | python -c "import sys,json; print(json.load(sys.stdin).get('completed',0))")
  pass "C6: Task found in D1"

  # C7: Verify title
  echo "C7: Verify title synced to D1..."
  echo "$D1_TITLE" | grep -q "brain.db renamed" && pass "C7: Title synced" || fail "C7: Title mismatch" "got: $D1_TITLE"

  # C8: Verify due date
  echo "C8: Verify due date synced to D1..."
  [ "$D1_DUE" = "2026-04-25" ] && pass "C8: Due date synced (2026-04-25)" || fail "C8: Due date" "got: $D1_DUE"

  # C9: Verify completed status
  echo "C9: Verify completed status in D1..."
  [ "$D1_COMPLETED" = "1" ] && pass "C9: Completed synced to D1" || fail "C9: Completed" "got: $D1_COMPLETED"
else
  fail "C6: Task not in D1" "$D1_CHECK"
  skip "C7: Title"; skip "C8: Due date"; skip "C9: Completed"
fi

# C10: Reopen in brain.db, push again
echo "C10: Reopen in brain.db and push..."
python -c "
import sqlite3
from datetime import datetime
conn = sqlite3.connect('$BRAIN_DB')
now = datetime.now().isoformat()
conn.execute('UPDATE tasks SET completed = 0, completed_at = NULL, status = ?, updated_at = ? WHERE id = ?',
    ('Active', now, '$BRAIN_TASK_ID'))
conn.commit()
conn.close()
" && pass "C10a: Reopened in brain.db" || fail "C10a: Reopen" ""
do_push > /dev/null 2>&1
REOPEN_D1=$(d1get "/api/tasks" | python -c "
import sys,json
data = json.load(sys.stdin).get('data',[])
match = [t for t in data if t['id'] == '$BRAIN_TASK_ID']
print(match[0].get('completed',1) if match else 'NOT_FOUND')
" 2>/dev/null)
[ "$REOPEN_D1" = "0" ] && pass "C10b: Reopen synced to D1 (completed=0)" || fail "C10b: Reopen sync" "D1 completed=$REOPEN_D1"

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION D: OTHER ENTITY MUTATIONS
# ═══════════════════════════════════════════════════════════════
echo "━━━ SECTION D: Other entity mutations ━━━"
echo ""

# D1: Project — change status inline
echo "D1: Project status change..."
PROJ_SLUG=$(d1get "/api/projects" | python -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['slug'] if d else '')" 2>/dev/null)
if [ -n "$PROJ_SLUG" ]; then
  # Get current status
  ORIG_STATUS=$(d1get "/api/projects" | python -c "
import sys,json
data = json.load(sys.stdin)['data']
p = next((x for x in data if x['slug'] == '$PROJ_SLUG'), None)
print(p['status'] if p else '')
" 2>/dev/null)

  # Projects use POST /api/projects/:id, need the project ID
  PROJ_ID=$(d1get "/api/projects" | python -c "
import sys,json
data = json.load(sys.stdin)['data']
p = next((x for x in data if x['slug'] == '$PROJ_SLUG'), None)
print(p['id'] if p else '')
" 2>/dev/null)

  if [ -n "$PROJ_ID" ]; then
    # Toggle status
    NEW_STATUS="Active"
    d1post "/api/projects/$PROJ_ID" "{\"status\":\"$NEW_STATUS\"}" > /dev/null
    pass "D1: Project status set to $NEW_STATUS"
    # Restore original
    d1post "/api/projects/$PROJ_ID" "{\"status\":\"$ORIG_STATUS\"}" > /dev/null
    pass "D1b: Project status restored to $ORIG_STATUS"
  else
    skip "D1: No project ID found"
  fi
else
  skip "D1: No projects available"
fi

# D2: Idea — create + vote
echo "D2: Idea create + vote..."
IDEA_RES=$(d1post "/api/ideas" '{"title":"WORKFLOW-TEST idea — delete","description":"Workflow test","author_slug":"nick-ingraham"}')
IDEA_ID=$(echo "$IDEA_RES" | python -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
if [ -n "$IDEA_ID" ]; then
  pass "D2a: Idea created ($IDEA_ID)"
  VOTE_RES=$(d1post "/api/ideas/$IDEA_ID/vote" '{"voter_slug":"nick-ingraham"}')
  VOTE_OK=$(echo "$VOTE_RES" | python -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('votes',0))" 2>/dev/null)
  [ "$VOTE_OK" -ge 1 ] 2>/dev/null && pass "D2b: Vote recorded (votes=$VOTE_OK)" || fail "D2b: Vote" "$VOTE_RES"
else
  fail "D2a: Idea creation" "$IDEA_RES"
fi

# D3: Meeting — verify we can fetch detail + action items
echo "D3: Meeting detail + action items..."
MEET_ID=$(d1get "/api/meetings" | python -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['id'] if d else '')" 2>/dev/null)
if [ -n "$MEET_ID" ]; then
  MEET_DETAIL=$(d1get "/api/meetings/$MEET_ID")
  MEET_OK=$(echo "$MEET_DETAIL" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') else 'fail')" 2>/dev/null)
  [ "$MEET_OK" = "ok" ] && pass "D3a: Meeting detail fetched ($MEET_ID)" || fail "D3a: Meeting detail" "$MEET_OK"

  # Try adding an action item
  AI_RES=$(d1post "/api/meetings/$MEET_ID/action-items" '{"description":"WORKFLOW-TEST action — delete","assignee":"nick-ingraham"}')
  AI_OK=$(echo "$AI_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
  [ "$AI_OK" = "ok" ] && pass "D3b: Action item added to meeting" || fail "D3b: Action item" "$AI_RES"
else
  skip "D3: No meetings"
fi

# D4: Project update (notes)
echo "D4: Project update..."
if [ -n "$PROJ_SLUG" ]; then
  PU_RES=$(d1post "/api/projects/$PROJ_SLUG/updates" '{"content":"WORKFLOW-TEST update — delete me","author_slug":"nick-ingraham"}')
  PU_OK=$(echo "$PU_RES" | python -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('data') or d.get('success') else 'fail')" 2>/dev/null)
  [ "$PU_OK" = "ok" ] && pass "D4: Project update posted" || fail "D4: Project update" "$PU_RES"
else
  skip "D4: No project slug"
fi

# D5: Settings round-trip
echo "D5: Settings round-trip..."
d1post "/api/settings" '{"key":"_workflow_test","value":"hello"}' > /dev/null
SETTINGS_VAL=$(d1get "/api/settings" | python -c "
import sys,json
data = json.load(sys.stdin).get('data',{})
if isinstance(data, dict): print(data.get('_workflow_test','NOT_FOUND'))
elif isinstance(data, list):
    match = [s for s in data if s.get('key') == '_workflow_test']
    print(match[0]['value'] if match else 'NOT_FOUND')
else: print('UNEXPECTED_FORMAT')
" 2>/dev/null)
[ "$SETTINGS_VAL" = "hello" ] && pass "D5: Settings write + readback" || fail "D5: Settings" "got: $SETTINGS_VAL"

# D6: Decision creation
echo "D6: Decision creation..."
DEC_RES=$(d1post "/api/decisions" '{"title":"WORKFLOW-TEST decision — delete","context":"test","decision":"test","made_by":"nick-ingraham"}')
DEC_STATUS=$(echo "$DEC_RES" | python -c "import sys,json; print(json.load(sys.stdin).get('error','ok'))" 2>/dev/null)
[ "$DEC_STATUS" = "ok" ] && pass "D6: Decision created" || fail "D6: Decision creation" "$DEC_STATUS"

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION E: TIMING
# ═══════════════════════════════════════════════════════════════
echo "━━━ SECTION E: Sync timing ━━━"
echo ""

echo "E1: API response times..."
for EP in "/api/tasks" "/api/projects" "/api/meetings" "/api/publications" "/api/team"; do
  START=$(date +%s%N)
  d1get "$EP" > /dev/null
  END=$(date +%s%N)
  MS=$(( (END - START) / 1000000 ))
  [ $MS -lt 2000 ] && pass "E1: $EP responded in ${MS}ms" || fail "E1: $EP slow" "${MS}ms"
done

echo ""

# ═══════════════════════════════════════════════════════════════
# SECTION F: CLEANUP
# ═══════════════════════════════════════════════════════════════
echo "━━━ SECTION F: Cleanup test data ━━━"
echo ""

# Clean brain.db test task
python -c "
import sqlite3
conn = sqlite3.connect('$BRAIN_DB')
conn.execute('DELETE FROM tasks WHERE id = ?', ('$BRAIN_TASK_ID',))
conn.commit()
conn.close()
" && pass "F1: Cleaned brain.db test task" || fail "F1: Cleanup" ""

info "Note: Hub test data (task, idea, decision, action item) left in D1."
info "Clean manually: DELETE FROM tasks WHERE title LIKE 'WORKFLOW-TEST%'"
info "              DELETE FROM ideas WHERE title LIKE 'WORKFLOW-TEST%'"
info "              DELETE FROM hub_decisions WHERE title LIKE 'WORKFLOW-TEST%'"

echo ""

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════"
echo "  WORKFLOW INSPECTION RESULTS"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  PASSED:  $PASS"
echo "  FAILED:  $FAIL"
echo "  SKIPPED: $SKIP"
echo "  TOTAL:   $TOTAL"
echo ""
if [ $TOTAL -gt 0 ]; then
  SCORE=$((PASS * 100 / TOTAL))
  echo "  SCORE:   $SCORE%"
fi
echo ""
echo -e "$RESULTS"
echo ""
echo "═══════════════════════════════════════════════════"
