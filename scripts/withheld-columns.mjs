/**
 * Columns one table withholds, and why.
 *
 * `OMIT` in `generate-table-schemas.mjs` is a property of the column — geometry
 * is too heavy to stream, and a soft-deleted row is filtered by the shape
 * predicate before it exists for a client. This is a property of the *audience*:
 * the column is ordinary, and this particular table's readers are not the people
 * it is for.
 *
 * Two scripts read it, which is why it is its own file rather than a constant in
 * the generator: `generate-table-schemas.mjs` and `check-search-corpus.mjs`.
 *
 * `generate-table-schemas.mjs` emits both halves of the withholding from here —
 * the column's absence from the schema, and the drift check's licence to expect
 * it absent. That matters because the drift check is what makes a new column a
 * build error, and an entry here is the only way to answer it other than adding
 * the column to the schema. Withholding by hand-editing a schema file lasts until
 * the next `pnpm generate:schemas`; withholding here is the statement itself.
 *
 * `check-search-corpus.mjs` reads it for the opposite direction: a withheld
 * column must not be indexed, because the search endpoint has no column list of
 * its own and would put it back on the wire.
 *
 * Withheld means no client receives it, not that no command carries it. The
 * invite dialog sends `invited_email` and `/commands/memberships` writes it. The
 * command payload type takes its columns from `packages/db/src/tables.ts` rather
 * than from these schemas, so nothing has to say that twice.
 *
 * The emitted `Drift<…>` constrains these names to `keyof …Table`, so a column
 * that is renamed or dropped by a migration fails the build rather than sitting
 * here withholding nothing.
 */

export const WITHHELD = {
	memberships: {
		reason:
			'an invited address and the handle on a live WorkOS invitation, and the `memberships` shape is eager for every signed-in agency user down to a viewer. The shape is eager because of the role ladder, which is a reason for `role`, `status` and `profile_id` and not for these two: an invited address is the private contact detail of somebody who has not accepted yet, and `workos_invitation_id` is a handle on a grant in the second system. The handlers that need them read them server-side inside the transaction, and the operator console reads them over REST',
		columns: ['invited_email', 'workos_invitation_id'],
	},
	organizations: {
		reason:
			"the operator's view of an agency rather than the agency's own record. They are written and read in the operator console (`apps/admin`), which reaches them over REST; `subscription_notes` in particular is what operators write *about* an agency. An agency that should see its own subscription state is a product decision to make deliberately, not a column to leave streaming by default",
		columns: [
			'subscription_status',
			'billing_mode',
			'billing_contact_name',
			'billing_contact_email',
			'subscription_notes',
		],
	},
};

export function withheldColumnsFor(table) {
	return new Set(WITHHELD[table]?.columns ?? []);
}
