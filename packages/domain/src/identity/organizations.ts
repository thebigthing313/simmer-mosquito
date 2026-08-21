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
 * The one country an agency address can name.
 *
 * SIMMER does not expect an agency outside the US. A mosquito control district
 * is a US institution, and the rest of the product already assumes it: the
 * agency timezone picker offers US zones only, and the mailing region is
 * checked against the state codes below. The country is the field that was
 * never told, so a direct caller could write an address in a state that is a
 * state of somewhere else. Both halves refuse now, and this is where the
 * assumption is written down rather than implied by a select. See "An agency
 * address is US-shaped" in `docs/identity-domain.md` for what would have to
 * change if a non-US agency ever appears.
 */
const US_COUNTRY_CODE = 'US';

/**
 * The mailing regions an agency address can name.
 *
 * An unrecognized code was silently dropped to `null` by the route this
 * replaces. It is refused here instead: a state nobody can spell is a typo, and
 * writing an address with the state missing is the worse of the two answers.
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

/**
 * Every detail but the name, and how long each may be.
 *
 * The name is the only required one, so it is normalized on its own. The other
 * eight are nullable text and differ from each other in nothing but the limit.
 */
const NULLABLE_DETAIL_LIMITS = {
	mainContactEmail: 320,
	phoneNumber: 50,
	mailingCountry: 2,
	mailingAddressLine1: 200,
	mailingAddressLine2: 200,
	mailingLocality: 200,
	mailingRegion: 2,
	mailingPostalCode: 20,
} as const;

type NullableDetailKey = keyof typeof NULLABLE_DETAIL_LIMITS;

const NULLABLE_DETAIL_KEYS = Object.keys(NULLABLE_DETAIL_LIMITS) as readonly NullableDetailKey[];

const DETAIL_KEYS: readonly (keyof OrganizationDetailChanges)[] = ['name', ...NULLABLE_DETAIL_KEYS];

/**
 * The two details that are codes rather than free text.
 *
 * Both are upper-cased and then required to be one of a fixed set, and both say
 * the same thing: an agency address is US-shaped. They are a pair here so that
 * neither can be given the rule while the other is forgotten, which is how the
 * country came to be written with no check at all.
 */
const CODED_DETAILS: readonly {
	readonly key: NullableDetailKey;
	readonly isAllowed: (code: string) => boolean;
	readonly message: string;
}[] = [
	{
		key: 'mailingCountry',
		isAllowed: (code) => code === US_COUNTRY_CODE,
		message: 'mailingCountry must be US.',
	},
	{
		key: 'mailingRegion',
		isAllowed: (code) => US_STATE_CODES.has(code),
		message: 'mailingRegion must be a US state code.',
	},
];

export function updateOrganizationDetailsCommand(
	input: UpdateOrganizationDetailsCommandInput,
): UpdateOrganizationDetailsCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);

	if (DETAIL_KEYS.every((key) => input[key] === undefined)) {
		issues.push({ path: 'changes', message: 'At least one agency detail must change.' });
	}

	const changes: Record<string, string | null> = {};
	if (input.name !== undefined) {
		changes.name = normalizeRequiredText(input.name, 'name', issues, 200);
	}
	for (const key of NULLABLE_DETAIL_KEYS) {
		if (input[key] !== undefined) {
			changes[key] = normalizeNullableText(input[key], key, issues, NULLABLE_DETAIL_LIMITS[key]);
		}
	}
	for (const { key, isAllowed, message } of CODED_DETAILS) {
		const value = changes[key];
		// Absent leaves the column alone and `null` clears it. An agency that has
		// not filled its address in is not an error; only a code that names
		// somewhere else is.
		if (typeof value !== 'string') {
			continue;
		}
		const code = value.toUpperCase();
		if (!isAllowed(code)) {
			issues.push({ path: key, message });
		}
		changes[key] = code;
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
