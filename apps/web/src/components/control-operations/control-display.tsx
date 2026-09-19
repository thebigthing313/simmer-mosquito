import { lookupUnitConversion, totalInUnit, type UnitDefaults } from '@simmer-mosquito/domain';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { calendarDateParts } from '../../lib/local-date';
import { unreadable } from '../../lib/unreadable-input';

/** As much of a unit as anything here reads: its conversion key and its label. */
interface MeasureUnit {
	readonly code: string;
	readonly abbreviation: string;
}

// Shared labelling for the control-operations routes.

/** Insecticides display by trade name; `shorthand` is a data-entry abbreviation. */
export function insecticideDisplayName(insecticide: { readonly tradeName: string }): string {
	return insecticide.tradeName;
}

/**
 * `12 gal`, the compact amount+unit pairing used across tables and cards. The
 * unit is structural so both read paths satisfy it.
 */
export function formatAmount(
	amount: number,
	unit: { readonly abbreviation: string } | undefined,
): string {
	return formatMeasure(amount, unit?.abbreviation ?? null);
}

/**
 * The same, taking the abbreviation the query joined. A function rather than a
 * projection because a whole number keeps its form and a fraction takes two
 * places.
 */
export function formatMeasure(amount: number, abbreviation: string | null): string {
	const value = readAmount(amount);
	return abbreviation === null ? value : `${value} ${abbreviation}`;
}

/**
 * The number half of {@link formatMeasure}. A non-finite amount is handed back
 * and warned about; see `lib/unreadable-input`.
 */
function readAmount(amount: number): string {
	if (!Number.isFinite(amount)) {
		return unreadable('formatMeasure', amount);
	}
	return Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
}

/**
 * Date-only columns arrive as `YYYY-MM-DD`; render them without a timezone
 * shift. The `Date` is a local one on purpose, so `toLocaleDateString` with no
 * zone reads the same parts back.
 */
export function formatActionDate(value: string): string {
	const parts = calendarDateParts(value);
	if (parts === undefined) {
		return unreadable('formatActionDate', value);
	}
	return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

export function nameById<TRow extends { readonly id: string }>(
	rows: readonly TRow[],
	toName: (row: TRow) => string,
): ReadonlyMap<string, string> {
	return new Map(rows.map((row) => [row.id, toName(row)] as const));
}

/** Which side of the program a control action was performed against. */
export type ControlContext = 'larval' | 'adult' | 'standalone';

/**
 * The context a control action's own links put it in. Separate from the badge
 * because the profile activity log resolves the same three arms in SQL and
 * carries the answer rather than the ids.
 */
export function controlContext({
	habitatId,
	inspectionId,
	collectionId,
}: {
	readonly habitatId?: string | null;
	readonly inspectionId?: string | null;
	readonly collectionId?: string | null;
}): ControlContext {
	if (inspectionId != null || habitatId != null) {
		return 'larval';
	}
	return collectionId == null ? 'standalone' : 'adult';
}

const CONTROL_CONTEXT_BADGE: Readonly<
	Record<ControlContext, { readonly label: string; readonly tone: 'info' | 'neutral' }>
> = {
	larval: { label: 'Larval', tone: 'info' },
	adult: { label: 'Adult', tone: 'info' },
	standalone: { label: 'Standalone', tone: 'neutral' },
};

/** The larval/adult record a control action was performed against, if any. */
export function ContextBadge({ context }: { readonly context: ControlContext }) {
	const { label, tone } = CONTROL_CONTEXT_BADGE[context];
	return (
		<Badge tone={tone} variant="outline">
			{label}
		</Badge>
	);
}

/**
 * One product's usage, as one number where the units convert and several where
 * they do not. Convertible amounts are totalled into the organization's default
 * unit for that kind of quantity (`settings.unitDefaults`) with the originals
 * named; a larvicide applied both as pouches and by weight stays a list.
 */
export function usageTotal({
	totalsByUnitId,
	unitById,
	unitByCode,
	unitDefaults,
}: {
	readonly totalsByUnitId: ReadonlyMap<string, number>;
	// Structural, so both read paths satisfy it. The code is the conversion key
	// and the abbreviation is what gets printed.
	readonly unitById: ReadonlyMap<string, MeasureUnit>;
	readonly unitByCode: ReadonlyMap<string, MeasureUnit>;
	readonly unitDefaults: UnitDefaults;
}): { readonly text: string; readonly convertedFrom: string | null } {
	const entries = [...totalsByUnitId.entries()].map(([unitId, amount]) => ({
		unit: unitById.get(unitId),
		amount,
	}));

	const separated = entries.map(({ unit, amount }) => formatAmount(amount, unit)).join(' · ');
	if (entries.length < 2) {
		return { text: separated, convertedFrom: null };
	}

	const measured = entries.filter(
		(entry): entry is { unit: MeasureUnit; amount: number } => entry.unit !== undefined,
	);
	if (measured.length !== entries.length) {
		return { text: separated, convertedFrom: null };
	}

	const firstUnit = measured[0]?.unit;
	const lookup =
		firstUnit === undefined ? { kind: 'unknown' as const } : lookupUnitConversion(firstUnit.code);
	if (lookup.kind !== 'convertible') {
		return { text: separated, convertedFrom: null };
	}

	const targetCode = unitDefaults[lookup.unitType];
	const total = totalInUnit(
		measured.map(({ unit, amount }) => ({ unitCode: unit.code, amount })),
		targetCode,
	);
	const targetUnit = unitByCode.get(targetCode);
	if (total === null || targetUnit === undefined) {
		return { text: separated, convertedFrom: null };
	}

	return {
		// Rounded to six places so a total like 12.999999999999998 formats as the
		// 13 it is.
		text: formatAmount(Number.parseFloat(total.toFixed(6)), targetUnit),
		convertedFrom: `Totalled from ${separated}`,
	};
}
