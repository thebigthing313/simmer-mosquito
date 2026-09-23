import { readReason } from './read-reason.js';
import type { WeakPasswordBody } from './wire.js';

export function weakPasswordOutcome(body: WeakPasswordBody): {
	readonly status: 'weak_password';
	readonly reason: string;
} {
	return { status: 'weak_password', reason: readReason(body, 'Choose a stronger password.') };
}
