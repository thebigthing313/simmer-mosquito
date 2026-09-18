import type { WeakPasswordBody } from '@simmer-mosquito/auth/browser';

export function weakPasswordBody(reason: string): WeakPasswordBody {
	return { ok: false, status: 'weak_password', reason };
}
