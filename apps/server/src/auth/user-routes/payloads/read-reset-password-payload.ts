import type { JsonRequest, Parsed } from './parsed.js';
import { readJsonObject } from './read-json-object.js';
import { readNonEmptyString } from './read-non-empty-string.js';
import { readPassword } from './read-password.js';

export async function readResetPasswordPayload(
	request: JsonRequest,
): Promise<Parsed<{ readonly token: string; readonly newPassword: string }>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const token = readNonEmptyString(raw.value.token);
	if (token === null) {
		return { ok: false, reason: 'token is required.' };
	}

	const newPassword = readPassword(raw.value.newPassword);
	if (newPassword === null) {
		return { ok: false, reason: 'newPassword is required.' };
	}

	return { ok: true, value: { token, newPassword } };
}
