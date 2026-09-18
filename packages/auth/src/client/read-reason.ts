import type { AuthJsonBody } from './create-auth-json-post.js';

export function readReason(data: AuthJsonBody, fallback: string): string {
	return typeof data.reason === 'string' && data.reason.trim() !== '' ? data.reason : fallback;
}
