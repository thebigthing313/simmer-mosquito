import { readRawData } from './read-raw-data.js';

/**
 * The machine code on a WorkOS error. Most exceptions carry it as `code`; the
 * OAuth-style `OauthException` carries it in `rawData.error`.
 */
export function readErrorCode(error: unknown): string | undefined {
	if (typeof error === 'object' && error !== null) {
		const code = (error as { readonly code?: unknown }).code;
		if (typeof code === 'string') {
			return code;
		}

		const raw = readRawData(error);
		if (raw !== undefined) {
			if (typeof raw.code === 'string') {
				return raw.code;
			}
			if (typeof raw.error === 'string') {
				return raw.error;
			}
		}
	}

	return undefined;
}
