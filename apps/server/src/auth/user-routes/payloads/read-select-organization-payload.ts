import type { JsonRequest, Parsed } from './parsed.js';
import { readJsonObject } from './read-json-object.js';
import { readNonEmptyString } from './read-non-empty-string.js';

export async function readSelectOrganizationPayload(
	request: JsonRequest,
): Promise<
	Parsed<{ readonly organizationId: string; readonly pendingAuthenticationToken: string }>
> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const organizationId = readNonEmptyString(raw.value.organizationId);
	if (organizationId === null) {
		return { ok: false, reason: 'organizationId is required.' };
	}

	const pendingAuthenticationToken = readNonEmptyString(raw.value.pendingAuthenticationToken);
	if (pendingAuthenticationToken === null) {
		return { ok: false, reason: 'pendingAuthenticationToken is required.' };
	}

	return { ok: true, value: { organizationId, pendingAuthenticationToken } };
}
