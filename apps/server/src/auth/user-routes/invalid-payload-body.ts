import type { InvalidPayloadBody } from '@simmer-mosquito/auth/browser';

export function invalidPayloadBody(reason: string): InvalidPayloadBody {
	return { ok: false, status: 'invalid_payload', reason };
}
