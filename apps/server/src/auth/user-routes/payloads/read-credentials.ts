import type { JsonRequest, Parsed } from './parsed.js';
import { readEmail } from './read-email.js';
import { readJsonObject } from './read-json-object.js';
import { readNonEmptyString } from './read-non-empty-string.js';
import { readPassword } from './read-password.js';

export interface Credentials {
	readonly email: string;
	readonly password: string;
	readonly firstName: string | null;
	readonly lastName: string | null;
}

export async function readCredentials(
	request: JsonRequest,
	options: { readonly withName?: boolean } = {},
): Promise<Parsed<Credentials>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const email = readEmail(raw.value.email);
	if (email === null) {
		return { ok: false, reason: 'A valid email is required.' };
	}

	const password = readPassword(raw.value.password);
	if (password === null) {
		return { ok: false, reason: 'password is required.' };
	}

	return {
		ok: true,
		value: {
			email,
			password,
			firstName: options.withName ? readNonEmptyString(raw.value.firstName) : null,
			lastName: options.withName ? readNonEmptyString(raw.value.lastName) : null,
		},
	};
}
