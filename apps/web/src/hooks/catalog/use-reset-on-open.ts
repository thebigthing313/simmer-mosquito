import { useEffect, useEffectEvent } from 'react';

/**
 * Refills a record dialog's form whenever it opens, and whenever the row
 * behind it changes while it is open.
 */
export function useResetOnOpen(open: boolean, record: unknown, reset: () => void): void {
	// `reset` is read at effect time and must not re-run the effect, which is
	// what a latest-value ref written during render used to buy. That write is
	// a render-phase ref access the compiler refuses, and `useEffectEvent` is
	// the hook that shape predates (#779, group A).
	const refill = useEffectEvent(() => {
		reset();
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: `record` is the trigger, not a read; a row that changes under an open dialog refills it.
	useEffect(() => {
		if (open) {
			refill();
		}
	}, [open, record]);
}
