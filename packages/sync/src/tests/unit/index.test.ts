import { describe, expect, it } from 'vitest';
import { tableSchemas } from '../../index.js';

describe('collection schemas', () => {
	it('declares no server-only geometry column on any table', () => {
		// Raw geometry is binary and `geojson` runs to megabytes a row; both are
		// served by the `/map/*` endpoints instead. The trigger-maintained centroid
		// (`lat`, `lng`, `geom_type`) may sync, which is why this names columns
		// rather than refusing spatial tables outright.
		//
		// It reads the schemas because they are now what a shape's column list is
		// made of. This walked the descriptors until they stopped deciding it.
		const offending = Object.entries(tableSchemas).flatMap(([table, schema]) =>
			Object.keys(schema.shape)
				.filter((field) => field === 'geom' || field === 'geojson')
				.map((field) => `${table}.${field}`),
		);

		expect(offending).toEqual([]);
	});

	it('keeps the invitation columns off the memberships schema', () => {
		// `memberships` streams eager to every signed-in organization user, viewers
		// included, because the role ladder needs `role`, `status` and
		// `profile_id`. An invited address belongs to somebody who has not
		// accepted, and `workos_invitation_id` is a handle on a live grant in
		// WorkOS. Both are read server-side inside the transaction that needs
		// them, so nothing in a collection is owed either.
		const fields = Object.keys(tableSchemas.memberships.shape);

		expect(fields).not.toContain('invited_email');
		expect(fields).not.toContain('workos_invitation_id');
	});
});
