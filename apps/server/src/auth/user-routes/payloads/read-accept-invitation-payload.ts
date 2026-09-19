import type { JsonRequest, Parsed } from './parsed.js';
import { readJsonObject } from './read-json-object.js';
import { readNonEmptyString } from './read-non-empty-string.js';
import { readPassword } from './read-password.js';

export async function readAcceptInvitationPayload(request: JsonRequest): Promise<
	Parsed<{
		readonly invitationToken: string;
		readonly password: string;
		readonly firstName: string | null;
		readonly lastName: string | null;
	}>
> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const invitationToken = readNonEmptyString(raw.value.invitationToken);
	if (invitationToken === null) {
		return { ok: false, reason: 'invitationToken is required.' };
	}

	const password = readPassword(raw.value.password);
	if (password === null) {
		return { ok: false, reason: 'password is required.' };
	}

	return {
		ok: true,
		value: {
			invitationToken,
			password,
			firstName: readNonEmptyString(raw.value.firstName),
			lastName: readNonEmptyString(raw.value.lastName),
		},
	};
}
