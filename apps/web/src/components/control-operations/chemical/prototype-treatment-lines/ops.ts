/** PROTOTYPE, throwaway (#1743). The edits every variant can make to the line set. */
import type { Catalog, Line, Mix, Mode, Refusals } from './model';

export interface LineOps {
	readonly add: () => void;
	readonly update: (id: string, patch: Partial<Line>) => void;
	/** A saved line is marked removed (undoable); an unsaved one is dropped. */
	readonly remove: (id: string) => void;
	readonly undoRemove: (id: string) => void;
	/** Sets or clears the mix provenance without touching the lines. */
	readonly setMix: (mix: Mix | null) => void;
	/** Replaces the live lines with one per component of the current mix. */
	readonly fillFromMix: (mix: Mix) => void;
}

export interface VariantProps {
	readonly catalog: Catalog;
	readonly mode: Mode;
	readonly lines: readonly Line[];
	readonly mix: Mix | null;
	readonly refusals: Refusals;
	readonly ops: LineOps;
}
