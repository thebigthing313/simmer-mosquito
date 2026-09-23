import type { JsonRequest, Parsed } from './parsed.js';
import { readJsonObject } from './read-json-object.js';
import { readNonEmptyString } from './read-non-empty-string.js';

/** `organizationId` is the WorkOS id: this re-seals a WorkOS session, and the SIMMER organization follows. */
export async function readSwitchOrganizationPayload(
	request: JsonRequest,
): Promise<Parsed<{ readonly organizationId: string }>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const organizationId = readNonEmptyString(raw.value.organizationId);
	if (organizationId === null) {
		return { ok: false, reason: 'organizationId is required.' };
	}

	return { ok: true, value: { organizationId } };
}
