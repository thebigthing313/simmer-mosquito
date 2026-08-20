import {
	createIssues,
	nullableText as normalizeNullableText,
	requiredText as normalizeRequiredText,
	throwIfIssues,
} from '../command-validation.js';
import {
	type AgencyIdentityCommandInput,
	type AgencyIdentityCommandPayload,
	agencyPayload,
	type IdentityDomainCommand,
	validateAgencyBase,
} from './shared.js';

/**
 * The agency's own details: its name, who to contact, and where to post things.
 *
 * Not its settings. Those are seven `organizationSettings.*` commands writing a
 * JSON document, and they share this row. Before ADR 0013 the columns were an
 * identity write and the document was commands, which is two contracts on one
 * row; this is the half that had no vocabulary.
 */
export interface OrganizationDetailChanges {
	readonly name?: string;
	readonly mainContactEmail?: string | null;
	readonly phoneNumber?: string | null;
	readonly mailingCountry?: string | null;
	readonly mailingAddressLine1?: string | null;
	readonly mailingAddressLine2?: string | null;
	readonly mailingLocality?: string | null;
	readonly mailingRegion?: string | null;
	readonly mailingPostalCode?: string | null;
}

export interface UpdateOrganizationDetailsCommandInput
	extends AgencyIdentityCommandInput,
		OrganizationDetailChanges {
	/**
	 * The `updated_at` the editor was looking at, or `null` to write regardless.
	 *
	 * Shape is checked here; whether it still matches the stored row is the
	 * server's, and a mismatch is the 409 the details sheet shows.
	 */
	readonly expectedUpdatedAt?: string | null;
}

export type UpdateOrganizationDetailsCommand = IdentityDomainCommand<
	'identity.updateOrganizationDetails',
	AgencyIdentityCommandPayload & {
		readonly changes: OrganizationDetailChanges;
		readonly expectedUpdatedAt: string | null;
	}
>;

/**
 * The mailing regions an agency address can name.
 *
 * The address is US-shaped, and an unrecognized code was silently dropped to
 * `null` by the route this replaces. It is refused here instead: a state nobody
 * can spell is a typo, and writing an address with the state missing is the
 * worse of the two answers.
 */
const US_STATE_CODES: ReadonlySet<string> = new Set([
	'AL',
	'AK',
	'AZ',
	'AR',
	'CA',
	'CO',
	'CT',
	'DE',
	'FL',
	'GA',
	'HI',
	'ID',
	'IL',
	'IN',
	'IA',
	'KS',
	'KY',
	'LA',
	'ME',
	'MD',
	'MA',
	'MI',
	'MN',
	'MS',
	'MO',
	'MT',
	'NE',
	'NV',
	'NH',
	'NJ',
	'NM',
	'NY',
	'NC',
	'ND',
	'OH',
	'OK',
	'OR',
	'PA',
	'RI',
	'SC',
	'SD',
	'TN',
	'TX',
	'UT',
	'VT',
	'VA',
	'WA',
	'WV',
	'WI',
	'WY',
	'DC',
]);

const DETAIL_KEYS = [
	'name',
	'mainContactEmail',
	'phoneNumber',
	'mailingCountry',
	'mailingAddressLine1',
	'mailingAddressLine2',
	'mailingLocality',
	'mailingRegion',
	'mailingPostalCode',
] as const;

export function updateOrganizationDetailsCommand(
	input: UpdateOrganizationDetailsCommandInput,
): UpdateOrganizationDetailsCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);

	const present = DETAIL_KEYS.filter((key) => input[key] !== undefined);
	if (present.length === 0) {
		issues.push({ path: 'changes', message: 'At least one agency detail must change.' });
	}

	const changes: Record<string, string | null> = {};
	if (input.name !== undefined) {
		changes.name = normalizeRequiredText(input.name, 'name', issues, 200);
	}
	if (input.mainContactEmail !== undefined) {
		changes.mainContactEmail = normalizeNullableText(
			input.mainContactEmail,
			'mainContactEmail',
			issues,
			320,
		);
	}
	if (input.phoneNumber !== undefined) {
		changes.phoneNumber = normalizeNullableText(input.phoneNumber, 'phoneNumber', issues, 50);
	}
	if (input.mailingCountry !== undefined) {
		changes.mailingCountry =
			normalizeNullableText(input.mailingCountry, 'mailingCountry', issues, 2)?.toUpperCase() ??
			null;
	}
	if (input.mailingAddressLine1 !== undefined) {
		changes.mailingAddressLine1 = normalizeNullableText(
			input.mailingAddressLine1,
			'mailingAddressLine1',
			issues,
			200,
		);
	}
	if (input.mailingAddressLine2 !== undefined) {
		changes.mailingAddressLine2 = normalizeNullableText(
			input.mailingAddressLine2,
			'mailingAddressLine2',
			issues,
			200,
		);
	}
	if (input.mailingLocality !== undefined) {
		changes.mailingLocality = normalizeNullableText(
			input.mailingLocality,
			'mailingLocality',
			issues,
			200,
		);
	}
	if (input.mailingRegion !== undefined) {
		const region =
			normalizeNullableText(input.mailingRegion, 'mailingRegion', issues, 2)?.toUpperCase() ?? null;
		if (region !== null && !US_STATE_CODES.has(region)) {
			issues.push({ path: 'mailingRegion', message: 'mailingRegion must be a US state code.' });
		}
		changes.mailingRegion = region;
	}
	if (input.mailingPostalCode !== undefined) {
		changes.mailingPostalCode = normalizeNullableText(
			input.mailingPostalCode,
			'mailingPostalCode',
			issues,
			20,
		);
	}

	const expectedUpdatedAt = normalizeExpectedUpdatedAt(input.expectedUpdatedAt, issues);
	throwIfIssues('Update organization details command is invalid.', issues);

	return {
		type: 'identity.updateOrganizationDetails',
		payload: { ...agencyPayload(input), changes, expectedUpdatedAt },
	};
}

function normalizeExpectedUpdatedAt(
	value: string | null | undefined,
	issues: ReturnType<typeof createIssues>,
): string | null {
	if (value === undefined || value === null || value === '') {
		return null;
	}
	if (Number.isNaN(new Date(value).getTime())) {
		issues.push({ path: 'expectedUpdatedAt', message: 'expectedUpdatedAt must be a timestamp.' });
		return null;
	}
	return value;
}
