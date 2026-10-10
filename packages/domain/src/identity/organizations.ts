import {
	createIssues,
	nullableText as normalizeNullableText,
	requiredText as normalizeRequiredText,
	organizationPayload,
	throwIfIssues,
	validateOrganizationBase,
} from '../command-validation.js';
import { type DomainValidationIssue, isEmailAddress } from '../shared.js';
import type {
	IdentityDomainCommand,
	OrganizationIdentityCommandInput,
	OrganizationIdentityCommandPayload,
} from './shared.js';

/**
 * The organization's own details: its name, who to contact, and where to post
 * things.
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
	/**
	 * Where a map with no rows of its own opens, as the client geocoded it from
	 * the mailing address. Either may arrive alone as a number; clearing sends
	 * both as `null`.
	 */
	readonly mapCenterLat?: number | null;
	readonly mapCenterLng?: number | null;
}

export interface UpdateOrganizationDetailsCommandInput
	extends OrganizationIdentityCommandInput,
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
	OrganizationIdentityCommandPayload & {
		readonly changes: OrganizationDetailChanges;
		readonly expectedUpdatedAt: string | null;
	}
>;

/**
 * The one country an organization address can name.
 *
 * SIMMER does not expect an organization outside the US. A mosquito control
 * district is a US institution, and the rest of the product already assumes it:
 * the organization timezone picker offers US zones only, and the mailing region
 * is checked against the state codes below. The country is the field that was
 * never told, so a direct caller could write an address in a state that is a
 * state of somewhere else. Both halves refuse now, and this is where the
 * assumption is written down rather than implied by a select. See "An
 * organization address is US-shaped" in `docs/identity-domain.md` for what
 * would have to change if a non-US organization ever appears.
 */
const US_COUNTRY_CODE = 'US';

/**
 * The mailing regions an organization address can name.
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
 * Every detail but the name and the map centre, and how long each may be.
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

/** The eight contact details: an organization's Main contact, phone and mailing address. */
export type OrganizationContactDetailKey = keyof typeof NULLABLE_DETAIL_LIMITS;

/** Contact details as a caller sent them: absent, `null`, or text not yet checked. */
export type OrganizationContactDetails = {
	readonly [K in OrganizationContactDetailKey]?: string | null;
};

const NULLABLE_DETAIL_KEYS = Object.keys(
	NULLABLE_DETAIL_LIMITS,
) as readonly OrganizationContactDetailKey[];

/** The map centre's two halves and the range each must sit inside. */
const MAP_CENTER_RANGES = [
	{ key: 'mapCenterLat', limit: 90, message: 'mapCenterLat must be between -90 and 90.' },
	{ key: 'mapCenterLng', limit: 180, message: 'mapCenterLng must be between -180 and 180.' },
] as const;

const DETAIL_KEYS: readonly (keyof OrganizationDetailChanges)[] = [
	'name',
	...NULLABLE_DETAIL_KEYS,
	...MAP_CENTER_RANGES.map(({ key }) => key),
];

/**
 * The two details that are codes rather than free text.
 *
 * Both are upper-cased and then required to be one of a fixed set, and both say
 * the same thing: an organization address is US-shaped. They are a pair here so
 * that neither can be given the rule while the other is forgotten, which is how
 * the country came to be written with no check at all.
 */
const CODED_DETAILS: readonly {
	readonly key: OrganizationContactDetailKey;
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
	validateOrganizationBase(input, issues);

	if (DETAIL_KEYS.every((key) => input[key] === undefined)) {
		issues.push({ path: 'changes', message: 'At least one organization detail must change.' });
	}

	const changes: Record<string, string | number | null> = {};
	if (input.name !== undefined) {
		changes.name = normalizeRequiredText(input.name, 'name', issues, 200);
	}
	const contact = normalizeOrganizationContactDetails(input);
	issues.push(...contact.issues);
	Object.assign(changes, contact.details, mapCenterChanges(input, issues));

	const expectedUpdatedAt = normalizeExpectedUpdatedAt(input.expectedUpdatedAt, issues);
	throwIfIssues('Update organization details command is invalid.', issues);

	return {
		type: 'identity.updateOrganizationDetails',
		payload: { ...organizationPayload(input), changes, expectedUpdatedAt },
	};
}

/**
 * The contact details that arrived, trimmed, coded, and checked.
 *
 * A key left out stays out of `details`, and blank text comes back as `null`.
 * The two codes are upper-cased, the Main contact must be an email address, and
 * each detail is held to its length. Nothing is thrown: a refusal is an entry
 * in `issues`, so a caller that answers before writing to a second system can
 * refuse without catching. `updateOrganizationDetailsCommand` and the operator
 * console's Organization create both read their rules from here.
 */
export function normalizeOrganizationContactDetails(input: OrganizationContactDetails): {
	readonly details: { [K in OrganizationContactDetailKey]?: string | null };
	readonly issues: readonly DomainValidationIssue[];
} {
	const issues = createIssues();
	const details: { [K in OrganizationContactDetailKey]?: string | null } = {};
	for (const key of NULLABLE_DETAIL_KEYS) {
		if (input[key] !== undefined) {
			details[key] = normalizeNullableText(input[key], key, issues, NULLABLE_DETAIL_LIMITS[key]);
		}
	}
	for (const { key, isAllowed, message } of CODED_DETAILS) {
		const value = details[key];
		// Absent leaves the column alone and `null` clears it. An organization that
		// has not filled its address in is not an error; only a code that names
		// somewhere else is.
		if (typeof value !== 'string') {
			continue;
		}
		const code = value.toUpperCase();
		if (!isAllowed(code)) {
			issues.push({ path: key, message });
		}
		details[key] = code;
	}
	// Absent leaves the column alone and `null` clears it, so only a string is
	// checked. Its case is kept: lowercasing a stored Main contact is a decision
	// of its own.
	if (typeof details.mainContactEmail === 'string' && !isEmailAddress(details.mainContactEmail)) {
		issues.push({
			path: 'mainContactEmail',
			message: 'mainContactEmail must be a valid email address.',
		});
	}
	return { details, issues };
}

/**
 * The map centre's halves that arrived, each checked against its range.
 *
 * Clearing is the one thing done as a pair: a `null` must come with a `null`,
 * because half a centre on a row that had one is a centre nobody chose. A
 * number may arrive alone. The client sends the columns that changed, so a new
 * geocode that lands on the stored latitude sends only the longitude, and the
 * row already has the other half. A lone number on a row with no centre is
 * stored state, so the server's writer refuses it.
 */
function mapCenterChanges(
	input: OrganizationDetailChanges,
	issues: ReturnType<typeof createIssues>,
): Partial<Record<'mapCenterLat' | 'mapCenterLng', number | null>> {
	if ((input.mapCenterLat === null) !== (input.mapCenterLng === null)) {
		issues.push({
			path: 'mapCenterLat',
			message: 'mapCenterLat and mapCenterLng are cleared together, both null.',
		});
		return {};
	}
	const changes: Partial<Record<'mapCenterLat' | 'mapCenterLng', number | null>> = {};
	for (const { key, limit, message } of MAP_CENTER_RANGES) {
		const value = input[key];
		if (value === undefined) {
			continue;
		}
		if (!isCoordinate(value, limit)) {
			issues.push({ path: key, message });
		}
		changes[key] = value;
	}
	return changes;
}

/** `null`, or a finite number no further from zero than `limit`. */
function isCoordinate(value: number | null, limit: number): boolean {
	return value === null || (Number.isFinite(value) && Math.abs(value) <= limit);
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
