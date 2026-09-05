/**
 * What one press of Save on the agency details sheet means.
 *
 * The sheet is the only one in the workspace that spans two write vocabularies.
 * Eight of its fields are columns on `organizations` and the ninth, the timezone,
 * is a key inside the settings document — so a save can be an identity write, an
 * `organizationSettings.updateTimezone` command, or one of each, and nothing on
 * screen distinguishes them.
 *
 * Both failures are quiet. Naming the timezone command when the timezone did not
 * move sends a command with nothing to change, which the domain refuses — so
 * correcting a typo in the phone number would fail on the half of the save that
 * was never asked for. Skipping the details write when only the timezone moved
 * would send a request that asks for nothing, which is the empty patch the whole
 * seam exists to suppress.
 */

import type { Organization } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import {
	type OrganizationDetailsFields,
	organizationDetailsPlan,
} from '../../../../hooks/mutations/use-organization-settings-mutations';

const TIMEZONE = 'America/Los_Angeles';

const STORED: Organization = {
	id: '11111111-1111-4111-8111-111111111111',
	workos_organization_id: 'org_01',
	name: 'Coastal MAD',
	slug: 'coastal-mad',
	settings: null,
	main_contact_email: 'office@coastal.test',
	phone_number: '555-0100',
	mailing_country: 'US',
	mailing_address_line_1: '100 Marsh Road',
	mailing_address_line_2: null,
	mailing_locality: 'Half Moon Bay',
	mailing_region: 'CA',
	mailing_postal_code: '94019',
	created_at: new Date('2026-01-01T00:00:00.000Z'),
	updated_at: new Date('2026-08-18T00:00:00.000Z'),
	updated_by_profile_id: null,
};

function fields(overrides: Partial<OrganizationDetailsFields> = {}): OrganizationDetailsFields {
	return {
		name: STORED.name,
		mainContactEmail: STORED.main_contact_email,
		phoneNumber: STORED.phone_number,
		mailingAddressLine1: STORED.mailing_address_line_1,
		mailingAddressLine2: STORED.mailing_address_line_2,
		mailingLocality: STORED.mailing_locality,
		mailingRegion: STORED.mailing_region,
		mailingPostalCode: STORED.mailing_postal_code,
		timezone: TIMEZONE,
		...overrides,
	};
}

describe('organizationDetailsPlan', () => {
	it('sends nothing when the sheet was opened and closed', () => {
		expect(organizationDetailsPlan(fields(), STORED, TIMEZONE)).toEqual({
			details: null,
			timezone: null,
		});
	});

	it('sends only the details when only a column moved', () => {
		const plan = organizationDetailsPlan(fields({ phoneNumber: '555-0199' }), STORED, TIMEZONE);

		expect(plan.timezone).toBeNull();
		expect(plan.details).toMatchObject({ phoneNumber: '555-0199', name: 'Coastal MAD' });
	});

	it('sends only the command when only the timezone moved', () => {
		const plan = organizationDetailsPlan(fields({ timezone: 'America/Denver' }), STORED, TIMEZONE);

		// The details write is skipped entirely rather than sent unchanged: the row
		// would be rewritten to its own values, and its `updated_at` would move for
		// a change nobody made.
		expect(plan.details).toBeNull();
		expect(plan.timezone).toBe('America/Denver');
	});

	it('sends both when the sheet changed one of each', () => {
		const plan = organizationDetailsPlan(
			fields({ name: 'Coastal Vector Control', timezone: 'America/Denver' }),
			STORED,
			TIMEZONE,
		);

		expect(plan.details?.name).toBe('Coastal Vector Control');
		expect(plan.timezone).toBe('America/Denver');
	});

	it('treats clearing an optional line as a change', () => {
		// `''` never reaches here — the form converts an emptied input to `null` —
		// so the comparison is `null` against a stored string, which it has to see.
		const plan = organizationDetailsPlan(fields({ mailingAddressLine2: null }), STORED, TIMEZONE);

		expect(plan.details).toBeNull();

		const cleared = organizationDetailsPlan(fields({ mailingLocality: null }), STORED, TIMEZONE);
		expect(cleared.details?.mailingLocality).toBeNull();
	});

	it('fills a mailing country the stored row never had', () => {
		// There is no country field: the address is US-shaped, so the plan states
		// `US` and compares it. An agency whose row predates that gets it written
		// on the next save rather than staying null forever.
		const plan = organizationDetailsPlan(fields(), { ...STORED, mailing_country: null }, TIMEZONE);

		expect(plan.details?.mailingCountry).toBe('US');
	});
});
