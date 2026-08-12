import type { OrganizationRow } from '@simmer-mosquito/sync';
import { readResponseBody } from './command-error';

export function createOrganizationMutationHandlers(options: { readonly serverUrl: string }) {
	return {
		onUpdate: async ({ transaction }: CollectionMutationHandlerInput<OrganizationRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeOrganization(
						`${options.serverUrl}/organization/current`,
						toOrganizationPayload(mutation.modified, mutation.original),
					);
					return result.txid;
				}),
			);

			return { txid: txids };
		},
	};
}

interface CollectionMutationHandlerInput<TRow> {
	readonly transaction: {
		readonly mutations: readonly {
			readonly original: Partial<TRow>;
			readonly modified: TRow;
		}[];
	};
}

interface OrganizationMutationResult {
	readonly txid: number;
}

interface OrganizationWritePayload {
	readonly name: string;
	readonly mainContactEmail: string | null;
	readonly phoneNumber: string | null;
	readonly mailingCountry: string | null;
	readonly mailingAddressLine1: string | null;
	readonly mailingAddressLine2: string | null;
	readonly mailingLocality: string | null;
	readonly mailingRegion: string | null;
	readonly mailingPostalCode: string | null;
	readonly settings?: OrganizationRow['settings'] | undefined;
	readonly expectedUpdatedAt: string | null;
}

function toOrganizationPayload(
	row: OrganizationRow,
	original: Partial<OrganizationRow>,
): OrganizationWritePayload {
	return {
		name: row.name,
		mainContactEmail: row.mainContactEmail,
		phoneNumber: row.phoneNumber,
		mailingCountry: row.mailingCountry,
		mailingAddressLine1: row.mailingAddressLine1,
		mailingAddressLine2: row.mailingAddressLine2,
		mailingLocality: row.mailingLocality,
		mailingRegion: row.mailingRegion,
		mailingPostalCode: row.mailingPostalCode,
		...(row.settings === original.settings ? {} : { settings: row.settings }),
		expectedUpdatedAt: original.updatedAt ?? null,
	};
}

async function writeOrganization(
	url: string,
	body: OrganizationWritePayload,
): Promise<OrganizationMutationResult> {
	const result = await sendOrganizationWrite(url, body);
	if (isOrganizationConflict(result)) {
		const retryResult = await sendOrganizationWrite(url, { ...body, expectedUpdatedAt: null });
		if (!retryResult.ok) {
			throw new Error(messageForOrganizationWriteError(retryResult.body));
		}
		return retryResult.body;
	}

	if (!result.ok) {
		throw new Error(messageForOrganizationWriteError(result.body));
	}

	return result.body;
}

async function sendOrganizationWrite(
	url: string,
	body: OrganizationWritePayload,
): Promise<
	| { readonly ok: true; readonly body: OrganizationMutationResult }
	| {
			readonly ok: false;
			readonly status: number;
			readonly body: OrganizationMutationError;
	  }
> {
	const response = await fetch(url, {
		method: 'PATCH',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify(body),
	});
	const result = (await readResponseBody(response)) as
		| OrganizationMutationResult
		| OrganizationMutationError;

	if (!response.ok || !('txid' in result)) {
		return { ok: false, status: response.status, body: result as OrganizationMutationError };
	}

	return { ok: true, body: result };
}

function isOrganizationConflict(
	result: Awaited<ReturnType<typeof sendOrganizationWrite>>,
): boolean {
	return (
		result.ok === false && result.status === 409 && result.body.error === 'organization_conflict'
	);
}

function messageForOrganizationWriteError(result: OrganizationMutationError): string {
	return 'reason' in result && typeof result.reason === 'string'
		? result.reason
		: 'message' in result && typeof result.message === 'string'
			? result.message
			: 'Unable to save organization details.';
}

interface OrganizationMutationError {
	readonly error: string;
	readonly reason?: string;
	readonly message?: string;
	readonly updatedAt?: string;
}
