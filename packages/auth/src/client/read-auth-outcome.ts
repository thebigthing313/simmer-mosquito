import type { AuthErrorOutcome } from './outcomes.js';
import { readReason } from './read-reason.js';

export type WireBody = { readonly ok: true } | { readonly ok: false; readonly status: string };

export type Refused<TBody extends WireBody> = Extract<TBody, { readonly ok: false }>;

/** Every refused status the body can carry except `invalid_payload`, which is always the error arm. */
export type RefusedStatus<TBody extends WireBody> = Exclude<
	Refused<TBody>['status'],
	'invalid_payload'
>;

/**
 * Read a wire body as an outcome. `refused` is keyed by every status the body
 * type can carry, so a status the server adds is a `tsc` error here until the
 * client names its outcome. Anything outside the type, an `invalid_payload`,
 * the interlock's 403 or an unreadable response, is the `error` arm carrying
 * the body's `reason` when it has one.
 */
export function readAuthOutcome<TBody extends WireBody, TOutcome>(
	body: unknown,
	readers: {
		readonly ok: (body: Extract<TBody, { readonly ok: true }>) => TOutcome;
		readonly refused: {
			readonly [TStatus in RefusedStatus<TBody>]: (
				body: Extract<TBody, { readonly status: TStatus }>,
			) => TOutcome;
		};
		readonly fallback: string;
	},
): TOutcome | AuthErrorOutcome {
	const data = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

	if (data.ok === true) {
		return readers.ok(data as Extract<TBody, { readonly ok: true }>);
	}

	const status = data.status;
	if (typeof status === 'string' && Object.hasOwn(readers.refused, status)) {
		const read = (readers.refused as Record<string, (body: unknown) => TOutcome>)[status];
		if (read !== undefined) {
			return read(data);
		}
	}

	return { status: 'error', reason: readReason(data, readers.fallback) };
}
