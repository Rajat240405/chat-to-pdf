# ChatGPT Mapping Safety Report

**Task:** Task 2 Hardening — Safety Fix 1: Cycle guard in `normalizeFromMapping()`  
**Date:** 2026-06-24  
**Status:** ✅ Implemented and validated  
**Tests:** 22/22 passed · TypeScript exit code 0

---

## 1. Problem Statement

`normalizeFromMapping()` performs a depth-first walk of the ChatGPT `mapping` object — a dictionary of conversation nodes linked by parent/children references. The function followed the last child of each node recursively.

The previous implementation had **no cycle detection**:

```typescript
// BEFORE (unsafe)
function walk(nodeId: string) {
  const node = mapping[nodeId];
  if (!node) return;
  ordered.push(node);
  const children = node.children ?? [];
  if (children.length > 0) {
    walk(children[children.length - 1]);  // ← could recurse forever
  }
}
```

If any node's child list pointed back to a previously visited node — a cycle — `walk()` would recurse indefinitely until the JavaScript engine raised a `RangeError: Maximum call stack size exceeded`, crashing the process. This was documented as a 🔴 Low-safety risk in `CHATGPT_PARSING_AUDIT.md` (Section 3c).

### Why cycles are possible in practice

- **Corrupted share pages** — A network error or CDN edge cache could serve a partial or malformed `__NEXT_DATA__` payload
- **Future OpenAI branching features** — Chat edit/regeneration already produces a tree; new features (forking, merging threads) could introduce back-edges
- **Adversarial or synthetic inputs** — Any API route or test that constructs a `mapping` object manually could produce a cycle inadvertently

---

## 2. Fix Applied

**File:** `src/providers/chatgpt.ts`  
**Lines changed:** 289–301 (three additions, zero deletions of logic)

### Diff

```diff
   const ordered: RawNode[] = [];

+  // Cycle guard: every nodeId that has been enqueued is recorded here.
+  // Without this, a malformed mapping where A.children includes B and
+  // B.children includes A causes walk() to recurse indefinitely and crash
+  // the process with a JavaScript stack overflow error.
+  const visited = new Set<string>();

-  // DFS from the root, always taking the LAST child (most recent branch)
+  // DFS from the root, always following the LAST child (most recent branch).
+  // visited ensures each node is visited at most once, breaking all cycles.
   function walk(nodeId: string) {
+    if (visited.has(nodeId)) return;  // cycle detected — stop traversal here
     const node = mapping[nodeId];
     if (!node) return;
+    visited.add(nodeId);  // mark BEFORE recursing so re-entry is caught immediately
     ordered.push(node);
```

### Why `visited.add()` is placed before the recursive call

```
walk("A")
  → visited.add("A")       ← marked first
  → walk("B")              ← recurse
    → visited.add("B")
    → walk("A")            ← cycle edge
      → visited.has("A") → return  ← caught immediately
```

If `visited.add()` were placed *after* `ordered.push()` but *before* the recursive `walk()` call, it would still work. Placing it before `ordered.push()` is equally valid. The critical invariant is that the node is marked **before** its children are walked — i.e., before the recursive call that could re-enter this node. All three placement options are correct. The chosen placement (before `ordered.push`) is the most conservative: even if `ordered.push` were to throw, the node would still be marked visited.

### Behaviour in the non-cyclic case

In all normal ChatGPT mapping graphs (no cycles), the guard is never triggered. `visited.has(nodeId)` returns `false` for every node on the first visit, and `visited.add(nodeId)` is a O(1) Set insertion. **There is no change in traversal order, output, or observable behaviour for valid inputs.**

---

## 3. Test Results

**Script:** `scripts/validate-chatgpt-mapping-safety.mjs`

```
=== Suite 1 — Correct traversal (no cycles) ===

  ✅ Linear A→B→C: 3 messages returned
  ✅ Linear A→B→C: order is A,B,C
  ✅ Linear A→B→C: roles correct
  ✅ Linear A→B→C: content correct
  ✅ Branched: 3 messages returned (last-child wins)
  ✅ Branched: order is A,B,C (not B2)
  ✅ Branched: B2 (older branch) not present

=== Suite 2 — Cycle safety (guarded normalizeFromMapping) ===

  ✅ Simple cycle (A→B→A): does NOT time out
  ✅ Simple cycle: returns Array
  ✅ Simple cycle: A and B both present
  ✅ Simple cycle: order is A then B
  ✅ Self-ref cycle (A→A): does NOT time out
  ✅ Self-ref cycle: returns exactly 1 msg
  ✅ Self-ref cycle: message is A
  ✅ Long cycle (A→B→C→D→B): does NOT time out
  ✅ Long cycle: 4 messages (A,B,C,D)
  ✅ Long cycle: correct order A,B,C,D

=== Suite 3 — Regression proof: unguarded version hangs on cycles ===

  ✅ Unguarded version times out or stack-overflows on simple cycle

=== Suite 4 — Edge cases ===

  ✅ Empty mapping: returns []
  ✅ No-roots mapping: returns []
  ✅ Dangling child ref: does NOT throw or hang
  ✅ Dangling child ref: A is returned

Results: 22/22 passed · tsc --noEmit exit code 0
```

### Suite descriptions

| Suite | Purpose | Network? |
|-------|---------|:--------:|
| 1 — Correct traversal | Verifies that the fix does not change output for acyclic graphs | No |
| 2 — Cycle safety | Verifies that cyclic graphs terminate correctly without hanging | No |
| 3 — Regression proof | Proves the **unguarded** version actually hangs on the same inputs (200 ms timeout) | No |
| 4 — Edge cases | Empty mapping, no-root mapping, dangling child ID references | No |

---

## 4. Graph Fixtures Used

| Name | Structure | Expected outcome |
|------|-----------|-----------------|
| `LINEAR` | A → B → C | 3 messages: A, B, C in order |
| `BRANCHED` | A → B → {B2, C} | 3 messages: A, B, C (B2 = older branch, discarded) |
| `SIMPLE_CYCLE` | A → B → A | 2 messages: A, B (cycle edge A→ ignored on second visit) |
| `SELF_REF` | A → A | 1 message: A (self-edge ignored on second visit) |
| `LONG_CYCLE` | A → B → C → D → B | 4 messages: A, B, C, D (D→B cycle ignored) |
| `EMPTY` | `{}` | `[]` |
| `NO_ROOTS` | A.parent=B, B.parent=A | `[]` (no roots detected) |
| `DANGLING_REF` | A → GHOST (not in mapping) | 1 message: A (GHOST silently skipped) |

---

## 5. Files Changed

| File | Change type | Detail |
|------|------------|--------|
| `src/providers/chatgpt.ts` | Modified (3 lines added, 0 deleted) | `visited` Set declared; `visited.has()` guard at top of `walk()`; `visited.add()` before recursion |
| `scripts/validate-chatgpt-mapping-safety.mjs` | New | 22-case validation suite across 4 test suites |
| `docs/CHATGPT_MAPPING_SAFETY_REPORT.md` | New | This file |

**Files NOT changed:** `claude.ts`, `gemini.ts`, `types.ts`, `index.ts`, fetch layer, `normalizeFromLinear`, `assembleConversation`, `extractTextContent`, `shouldKeepNode`, `normalizeNode`, all app pages, all API routes.

---

## 6. Remaining Hardening Items (from Audit)

The following items from `CHATGPT_PARSING_AUDIT.md` were explicitly out of scope for this task and remain open:

| Priority | Item | Risk |
|:--------:|------|------|
| 2 | Add `> 0` guard to `data.create_time` in `assembleConversation` | `1970-01-01` metadata on zero timestamps |
| 3 | Record matched JSON path in `metadata["chatgptJsonPath"]` | Silent path-4 fallback undetectable in production |
| 4 | Expose `metadata["filteredMessageCount"]` | Silent message drops unobservable |
| 5 | Add a 5th candidate path to `findConversationData` | Future OpenAI schema change not covered |
