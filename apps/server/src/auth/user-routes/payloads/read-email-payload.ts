import type { JsonRequest, Parsed } from './parsed.js';
import { readEmail } from './read-email.js';
import { readJsonObject } from './read-json-object.js';

export async function readEmailPayload(
	request: JsonRequest,
): Promise<Parsed<{ readonly email: string }>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const email = readEmail(raw.value.email);
	if (email === null) {
		return { ok: false, reason: 'A valid email is required.' };
	}

	return { ok: true, value: { email } };
}
