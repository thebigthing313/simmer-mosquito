import type { JsonRequest, Parsed } from './parsed.js';
import { readJsonObject } from './read-json-object.js';
import { readNonEmptyString } from './read-non-empty-string.js';

export async function readVerifyEmailPayload(
	request: JsonRequest,
): Promise<Parsed<{ readonly code: string; readonly pendingAuthenticationToken: string }>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const code = readNonEmptyString(raw.value.code);
	if (code === null) {
		return { ok: false, reason: 'code is required.' };
	}

	const pendingAuthenticationToken = readNonEmptyString(raw.value.pendingAuthenticationToken);
	if (pendingAuthenticationToken === null) {
		return { ok: false, reason: 'pendingAuthenticationToken is required.' };
	}

	return { ok: true, value: { code, pendingAuthenticationToken } };
}
