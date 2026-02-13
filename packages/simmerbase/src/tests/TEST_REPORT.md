# Simmerbase Test Report

**Date:** 2026-02-13  
**Test Framework:** Vitest v4.0.18  
**Database:** Local Supabase (PostgreSQL via `@supabase/supabase-js` with service key, bypassing RLS)

---

## Summary

| Test Suite      | Tests | Passed | Failed | Status |
|-----------------|-------|--------|--------|--------|
| `fetch.test.ts` | 25    | 25     | 0      | ✅ PASS |
| `insert.test.ts`| 26    | 26     | 0      | ✅ PASS |
| `update.test.ts`| 22    | 22     | 0      | ✅ PASS |
| `delete-rows.test.ts` | 17 | 17  | 0      | ✅ PASS |
| **Total**       | **90**| **90** | **0**  | ✅ **ALL PASS** |

All 90 tests pass and are idempotent (confirmed by running twice consecutively).

---

## Bugs Found & Fixed

### BUG 1: `fetch.ts` — Filter array return path was broken ✅ FIXED

**Severity:** Medium  
**File:** `src/fetch.ts`

**Problem:** The type signature allowed `filter` to return either a query or an array of filter functions. The implementation checked `Array.isArray(options.filter)` — testing the option itself (always a function) rather than its return value. The array code path was dead code.

**Fix Applied:** Simplified to single filter function pattern, consistent with `update` and `deleteRows`:

```typescript
filter?: (query: SupabaseQuery<TTable>) => SupabaseQuery<TTable>;
```

Users chain multiple conditions in a single function: `(q) => q.eq('a', 1).gte('b', 2)`.

---

### BUG 2: `roles` Zod schema used `z.uuid()` but DB column `id` is `number` ✅ FIXED

**Severity:** High  
**File:** `create-types-files.ts`, `src/schemas/roles.ts`

**Problem:** The `FIELD_OVERRIDES` map applied `z.uuid()` to all `id` columns regardless of actual type. The `roles` table has `id: number` (integer), not UUID.

**Fix Applied:** Updated `zodExpressionForField` to check if the field's actual TypeScript type is `number` **before** applying any override — number fields are never overridden to UUID. Regenerated all schemas. The roles schema now correctly uses `id: z.number()`.

---

### BUG 3: `insert.ts` — Row schema validation used `.parse()` instead of `.safeParse()` ✅ FIXED

**Severity:** Low  
**File:** `src/insert.ts`

**Problem:** Return data validation used `.parse()` which throws on failure, unlike `fetch` and `update` which use `.safeParse()` and return errors in the result object.

**Fix Applied:** Changed to `.safeParse()` with proper error return, matching the pattern in `fetch` and `update`.

---

## Improvements Applied

### 1. Standardized error handling across all functions ✅

All four functions now consistently use `.safeParse()` for validation and return errors in the result object. No function throws on schema mismatch.

| Function     | Insert validation | Return validation | Error style |
|-------------|-------------------|-------------------|-------------|
| `fetch`     | N/A               | `.safeParse()` → returns error | ✅ Consistent |
| `insert`    | `.safeParse()` → returns error | `.safeParse()` → returns error | ✅ Consistent |
| `update`    | `.safeParse()` → returns error | `.safeParse()` → returns error | ✅ Consistent |
| `deleteRows`| N/A               | N/A | ✅ Consistent |

### 2. Insert validation reordered ✅

Validation order is now: empty check → max rows check → schema validation. Previously, schema validation ran first (wasteful for 501+ invalid rows).

### 3. Empty update guard ✅

`update()` now returns `{ data: null, count: 0, error: 'No fields provided for update' }` when called with an empty object `{}`, instead of silently sending a no-op to Supabase.

### 4. Count added to insert, update, and delete results ✅

- `insert()` result type: `{ data: T[] | null; count: number; error: Error | null }`
- `update()` result type: `{ data: T[] | null; count: number; error: Error | null }`
- `deleteRows()` result type: `{ success: true; error: null; count: number } | { success: false; error: Error; count: 0 }`

The delete function uses `{ count: 'exact' }` on the Supabase query to get the affected row count.

### 5. Filter type consistency ✅

All functions now use the same single-function filter pattern: `(query: QueryType) => QueryType`. The broken array-return type has been removed from `fetch`.

### 6. Schema-based select for insert and update ✅

Both `insert()` and `update()` now select only the columns defined in the row schema (via `Object.keys(rowSchema.shape).join(',')`), matching the pattern already used by `fetch()`. This reduces payload size and avoids fetching server-only columns.

### 7. Type generation fixed for non-UUID primary keys ✅

`create-types-files.ts` now checks the actual TypeScript type before applying field overrides. Number-typed columns (like `roles.id`) are never overridden to `z.uuid()`.

### 8. Abort signal support ✅

All four functions now accept an optional `signal?: AbortSignal` parameter (via an `options` object) to allow callers to cancel long-running queries:

```typescript
const controller = new AbortController();
const result = await fetch('units', UnitsBaseRowSchema, supabase, {
    signal: controller.signal,
});
```

---

## Test Coverage Summary

### `fetch.ts` — 25 tests
- Basic fetch (no options)
- Schema validation (partial schemas, type mismatches, coerced types, nullable fields)
- Filtering (eq, in, neq, ilike, no matches, single function, chained conditions)
- Pagination (ascending, descending, default order, subsets, out-of-range, combined with filter)
- Edge cases (single column, concurrent fetches, group-scoped, empty results)

### `insert.ts` — 26 tests
- Single and multiple row inserts (with count verification)
- Boundary testing (0 rows, 500 rows, 501 rows)
- Schema validation (invalid UUIDs, missing fields, extra fields, wrong types)
- Database constraints (duplicate PK, FK violations, valid FK)
- Return data validation (schema mismatch returns error, server-generated fields)
- Edge cases (special characters, unicode, long strings, empty string, enums, numeric precision)
- Validation order verification (empty → max → schema)
- Roles table (numeric id validated correctly after schema fix)

### `update.ts` — 22 tests
- Basic updates (single field, multiple fields, null ↔ value transitions, count verification)
- Field preservation after partial updates
- Filter behavior (multi-row, no match, isolation)
- Validation errors (wrong types, invalid enums, empty update body guard)
- Database constraints (FK violations)
- Server-generated fields (updated_at timestamp)
- Edge cases (special chars, unicode, empty string, repeated updates, concurrent, enum transitions)

### `delete-rows.ts` — 17 tests
- Basic deletion (single with count=1, multiple with count=3, no match with count=0)
- Filter variations (eq, ilike, neq)
- Foreign key constraints (protected parent, unprotected, cascade delete order)
- Edge cases (bulk delete, concurrent, isolation, re-delete)
- Safety (filter enforcement, group-scoped deletion)
