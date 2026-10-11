import type { OrdinalTone, StopTone } from '../../stop-order';

/** The two map tones a Trap Route stop takes: a Trap has no inaccessible flag. */
type TrapStopTone = Extract<StopTone, 'default' | 'inactive'>;

/** What a Trap Route stop's ordinal draws: its map tone, or `resolving`. */
export type TrapOrdinalTone = Extract<OrdinalTone, TrapStopTone | 'resolving'>;

/** The tone of a stop whose Trap has arrived, which the map pin and the badge share. */
export function trapStopTone(stop: { readonly isActive: boolean }): TrapStopTone {
	return stop.isActive ? 'default' : 'inactive';
}

/** The badge's tone: {@link trapStopTone} once the Trap has arrived, `resolving` until then. */
export function trapStopBadgeTone(
	stop:
		| { readonly isResolving: true }
		| { readonly isResolving: false; readonly isActive: boolean },
): TrapOrdinalTone {
	return stop.isResolving ? 'resolving' : trapStopTone(stop);
}
