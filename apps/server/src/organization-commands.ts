import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import { isRecord } from './command-payload.js';
import { denyIdentityWrite } from './roles.js';

type OrganizationCommandDb = Kysely<SimmerDatabase>;

export function registerOrganizationCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: OrganizationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.patch('/organization/current', options.authContextMiddleware, async (context) => {
		const payloadResult = await readOrganizationPayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const authContext = context.get('authContext');
		const refusal = denyIdentityWrite(context, 'organization.updateDetails');
		if (refusal !== null) {
			return refusal;
		}

		const result = await options.db.transaction().execute(async (trx) => {
			const organization = await trx
				.selectFrom('organizations')
				.select(['id', 'updated_at'])
				.where('id', '=', authContext.organization.id)
				.where('deleted_at', 'is', null)
				.executeTakeFirst();

			if (organization === undefined) {
				return { kind: 'not_found' as const };
			}

			if (
				payloadResult.payload.expectedUpdatedAt !== null &&
				organization.updated_at.getTime() !== payloadResult.payload.expectedUpdatedAt.getTime()
			) {
				return { kind: 'conflict' as const, updatedAt: organization.updated_at.toISOString() };
			}

			const row = await trx
				.updateTable('organizations')
				.set({
					name: payloadResult.payload.name,
					main_contact_email: payloadResult.payload.mainContactEmail,
					phone_number: payloadResult.payload.phoneNumber,
					mailing_country: payloadResult.payload.mailingCountry,
					mailing_address_line_1: payloadResult.payload.mailingAddressLine1,
					mailing_address_line_2: payloadResult.payload.mailingAddressLine2,
					mailing_locality: payloadResult.payload.mailingLocality,
					mailing_region: payloadResult.payload.mailingRegion,
					mailing_postal_code: payloadResult.payload.mailingPostalCode,
					updated_at: sql`now()`,
					updated_by_profile_id: authContext.profile.id,
				})
				.where('id', '=', authContext.organization.id)
				.where('deleted_at', 'is', null)
				.returning(['id', 'updated_at', 'updated_by_profile_id'])
				.executeTakeFirstOrThrow();

			const txidRow = await sql<{
				readonly txid: string;
			}>`select pg_current_xact_id()::xid::text as txid`
				.execute(trx)
				.then((queryResult) => queryResult.rows[0]);

			return {
				kind: 'ok' as const,
				organizationId: row.id,
				updatedAt: row.updated_at.toISOString(),
				updatedByProfileId: row.updated_by_profile_id,
				txid: Number(txidRow?.txid ?? 0),
			};
		});

		if (result.kind === 'not_found') {
			return context.json({ error: 'organization_not_found' }, 404);
		}
		if (result.kind === 'conflict') {
			return context.json({ error: 'organization_conflict', updatedAt: result.updatedAt }, 409);
		}

		return context.json(result);
	});
}

interface OrganizationPayload {
	readonly name: string;
	readonly mainContactEmail: string | null;
	readonly phoneNumber: string | null;
	readonly mailingCountry: string | null;
	readonly mailingAddressLine1: string | null;
	readonly mailingAddressLine2: string | null;
	readonly mailingLocality: string | null;
	readonly mailingRegion: string | null;
	readonly mailingPostalCode: string | null;
	readonly expectedUpdatedAt: Date | null;
}

type PayloadResult =
	| { readonly ok: true; readonly payload: OrganizationPayload }
	| { readonly ok: false; readonly reason: string };

/**
 * Exported for its test.
 *
 * The one thing worth pinning about it is a negative: a `settings` document in
 * the body is not read. It used to be — this route wrote the whole document,
 * passed through a resolver that substitutes defaults rather than refusing, with
 * the issues it reported dropped — and the seven `organizationSettings.*` routes
 * own that now. During a deploy an older browser is still sending one, and it
 * has to be ignored rather than written.
 */
export async function readOrganizationPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}

	if (!isRecord(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}

	const name = readRequiredText(raw.name);
	if (name === null) {
		return { ok: false, reason: 'name is required.' };
	}

	const expectedUpdatedAt = readOptionalDate(raw.expectedUpdatedAt);
	if (expectedUpdatedAt !== null && Number.isNaN(expectedUpdatedAt.getTime())) {
		return { ok: false, reason: 'expectedUpdatedAt must be an ISO timestamp.' };
	}

	return {
		ok: true,
		payload: {
			name,
			mainContactEmail: readOptionalText(raw.mainContactEmail),
			phoneNumber: readOptionalText(raw.phoneNumber),
			mailingCountry: readOptionalText(raw.mailingCountry)?.toUpperCase() ?? null,
			mailingAddressLine1: readOptionalText(raw.mailingAddressLine1),
			mailingAddressLine2: readOptionalText(raw.mailingAddressLine2),
			mailingLocality: readOptionalText(raw.mailingLocality),
			mailingRegion: readUsStateCode(raw.mailingRegion),
			mailingPostalCode: readOptionalText(raw.mailingPostalCode),
			expectedUpdatedAt,
		},
	};
}

function readRequiredText(value: unknown): string | null {
	const text = readOptionalText(value);
	return text === null ? null : text;
}

function readOptionalText(value: unknown): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readUsStateCode(value: unknown): string | null {
	const code = readOptionalText(value)?.toUpperCase() ?? null;
	if (code === null) {
		return null;
	}
	return US_STATE_CODES.has(code) ? code : null;
}

function readOptionalDate(value: unknown): Date | null {
	if (value === undefined || value === null || value === '') {
		return null;
	}
	if (typeof value !== 'string') {
		return new Date(Number.NaN);
	}
	return new Date(value);
}

const US_STATE_CODES = new Set([
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
