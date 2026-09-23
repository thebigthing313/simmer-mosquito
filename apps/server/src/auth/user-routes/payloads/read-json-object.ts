import type { JsonRequest, Parsed } from './parsed.js';

export async function readJsonObject(
	request: JsonRequest,
): Promise<Parsed<Record<string, unknown>>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}

	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}

	return { ok: true, value: raw as Record<string, unknown> };
}
