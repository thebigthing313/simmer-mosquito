/**
 * The agency's details, and the document this route no longer writes.
 *
 * `PATCH /organization/current` used to carry the whole organization settings
 * document alongside the nine detail columns, because the client sent whatever
 * the row diff produced. Two things followed from that, and neither announced
 * itself:
 *
 * The document was not validated. It went through `resolveOrganizationSettings`,
 * which is deliberately lenient — it substitutes a default and records an issue
 * rather than refusing — and the issues were dropped. A timezone the agency could
 * not use was stored as the default and the admin was told the save succeeded.
 * None of the referenced-row checks ran either: a Species Key Binding naming a
 * deleted species, or a unit default naming a code that is not that kind of unit,
 * were both accepted here and refused by the seven command routes.
 *
 * And a save rewrote settings nobody touched, from the editor's own copy.
 *
 * The seven `organizationSettings.*` routes own the document now. What this file
 * pins is that this route does not: a `settings` key in the body is ignored, not
 * merged and not written. That matters most during a deploy, when an older
 * browser is still sending one.
 */

import { describe, expect, it } from 'vitest';
import { readOrganizationPayload } from '../../organization-commands.js';

function request(body: unknown): { readonly json: () => Promise<unknown> } {
	return { json: () => Promise.resolve(body) };
}

describe('readOrganizationPayload', () => {
	it('reads the details a sheet sends', async () => {
		const result = await readOrganizationPayload(
			request({
				name: 'Coastal MAD',
				mainContactEmail: 'office@coastal.test',
				phoneNumber: '555-0100',
				mailingCountry: 'us',
				mailingAddressLine1: '100 Marsh Road',
				mailingLocality: 'Half Moon Bay',
				mailingRegion: 'ca',
				mailingPostalCode: '94019',
				expectedUpdatedAt: '2026-08-18T00:00:00.000Z',
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.payload).toMatchObject({
			name: 'Coastal MAD',
			mailingCountry: 'US',
			mailingRegion: 'CA',
		});
	});

	it('ignores a settings document an older client still sends', async () => {
		const result = await readOrganizationPayload(
			request({
				name: 'Coastal MAD',
				settings: { timezone: 'America/Denver', unitDefaults: { weight: 'lb' } },
				expectedUpdatedAt: null,
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		// Absent from the payload, so it cannot reach the update set — the route is
		// no longer a way to write settings without validating them.
		expect('settings' in result.payload).toBe(false);
	});

	it('refuses a body with no name', async () => {
		const result = await readOrganizationPayload(request({ phoneNumber: '555-0100' }));

		expect(result).toMatchObject({ ok: false, reason: 'name is required.' });
	});

	it('refuses a body that is not JSON, and one that is not an object', async () => {
		const notJson = await readOrganizationPayload({
			json: () => Promise.reject(new Error('boom')),
		});
		const notObject = await readOrganizationPayload(request(['Coastal MAD']));

		expect(notJson).toMatchObject({ ok: false });
		expect(notObject).toMatchObject({ ok: false });
	});

	it('drops a mailing region that is not a US state code', async () => {
		// The country is forced to `US` by the client, so the region is checked
		// against the state list rather than stored as typed.
		const result = await readOrganizationPayload(
			request({ name: 'Coastal MAD', mailingRegion: 'Kent' }),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}
		expect(result.payload.mailingRegion).toBeNull();
	});

	it('reports an unparseable expectedUpdatedAt rather than sending NaN to Postgres', async () => {
		const result = await readOrganizationPayload(
			request({ name: 'Coastal MAD', expectedUpdatedAt: 'yesterday' }),
		);

		expect(result).toMatchObject({ ok: false });
	});
});
