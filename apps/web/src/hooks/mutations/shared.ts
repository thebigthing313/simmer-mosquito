/**
 * What every mutation hook in this folder shares.
 *
 * The other half of `hooks/queries`. That folder turns Postgres columns into the
 * vocabulary a page speaks; this one turns a page's values back into columns. One
 * place knows both spellings, which is the whole point — without it a route
 * component would be assigning `source_reduction_method_id` again, and that is
 * how the reads got into trouble.
 *
 * One hook per file, named for the hook, as in `hooks/queries`. A file here that
 * is not a `use-` file is not a hook: this one.
 *
 * ## Why these are hooks rather than plain functions
 *
 * `apps/admin` writes through plain functions (`lib/collections/writes.ts`), and
 * for three global catalogs that is right — a genus is not written on behalf of
 * anyone. Every agency write is. It carries the acting Profile, the Agency it
 * belongs to, and on some tables the agency's clock, and a plain function would
 * have to be handed all three at every call site. A hook reads them once from the
 * auth snapshot and returns operations already bound to them, so a form's submit
 * handler passes what the user typed and nothing else.
 *
 * ## Every write names the command it means
 *
 * Through `mutateCollection`, which takes the intent as an argument rather than
 * leaving it to be remembered in a metadata bag. The server no longer infers a
 * command from which fields arrived, so an unnamed write is a malformed request —
 * and naming it in the type is what makes forgetting a compile error instead of a
 * failure at the click.
 *
 * A save that means two commands against one row names both. It cannot be two
 * writes: TanStack DB merges two updates to a key and keeps only the last
 * `metadata`, so the first command's fields would travel under the second's name
 * and be dropped behind a 200.
 *
 * ## What a hook must not do
 *
 * Name an intent the change set has nothing for. Each server-side builder reads
 * the fields it takes and ignores the rest, and the domain refuses a command with
 * nothing to change — so an edit that always names every intent fails whenever
 * the user touched only one group of fields. Which intents a save means is a
 * function of what actually changed, and working that out is this folder's job.
 *
 * Commands that write more than one row do not belong here as single mutations.
 * `SingleRowCommandType` keeps them out at the type level; they need
 * `createTransaction` grouping the optimistic mutations, because otherwise a
 * second record stays on screen showing its old state.
 */

/**
 * Ids are minted by the caller, not by the write.
 *
 * SIMMER writes carry their own ids so they are replay-safe, and a create often
 * needs the id before it fires — to warm an on-demand subset, or to write the
 * child rows that reference it the moment the parent lands. A write that minted
 * its own would hand it back too late for either.
 */
export function newRecordId(): string {
	return crypto.randomUUID();
}

/**
 * The timestamps an optimistic row carries.
 *
 * The server writes its own with its own clock; these exist so the row on screen
 * is a complete row until the synced one replaces it. `commandRequestFor` strips
 * them from the outgoing body, so nothing here is ever what gets stored — and
 * nothing should read them back.
 */
export function optimisticStamp(): Date {
	return new Date();
}
