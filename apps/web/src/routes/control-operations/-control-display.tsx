import { lookupUnitConversion, totalInUnit, type UnitDefaults } from '@simmer-mosquito/domain';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';

/** As much of a unit as anything here reads: its conversion key and its label. */
interface MeasureUnit {
	readonly code: string;
	readonly abbreviation: string;
}

// Shared labelling for the control-operations routes. Control actions reference
// methods, units, profiles, and (optionally) a habitat or address, so most screens
// need the same handful of name lookups.

/**
 * Insecticides display by trade name everywhere. `shorthand` is an
 * organization's internal abbreviation for data entry, not a name operators
 * should have to read.
 */
export function insecticideDisplayName(insecticide: { readonly tradeName: string }): string {
	return insecticide.tradeName;
}

/**
 * `12 gal` — the compact amount+unit pairing used across tables and cards.
 *
 * The unit is structural rather than a `UnitRow` so that both read paths satisfy
 * it: the camelCase rows the unmigrated surfaces still hold, and the projections
 * the query hooks return. Only the abbreviation is ever read.
 */
export function formatAmount(
	amount: number,
	unit: { readonly abbreviation: string } | undefined,
): string {
	return formatMeasure(amount, unit?.abbreviation ?? null);
}

/**
 * The same, taking the abbreviation the query joined rather than a row to look it
 * up in. What the surfaces reading through `hooks/queries` call.
 *
 * Stays a function rather than becoming a projection because the rule is
 * conditional on the value: a whole number keeps its form and a fraction takes
 * two places, which no compiled `select` can express.
 */
export function formatMeasure(amount: number, abbreviation: string | null): string {
	const value = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
	return abbreviation === null ? value : `${value} ${abbreviation}`;
}

/** Date-only columns arrive as `YYYY-MM-DD`; render them without a timezone shift. */
export function formatActionDate(value: string): string {
	const [yearPart, monthPart, dayPart] = value.slice(0, 10).split('-');
	if (yearPart === undefined || monthPart === undefined || dayPart === undefined) {
		return value;
	}
	const year = Number.parseInt(yearPart, 10);
	const month = Number.parseInt(monthPart, 10);
	const day = Number.parseInt(dayPart, 10);
	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
		return value;
	}
	return new Date(year, month - 1, day).toLocaleDateString(undefined, {
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

/** The larval/adult record a control action was performed against, if any. */
export function ContextBadge({
	habitatId,
	inspectionId,
	collectionId,
}: {
	readonly habitatId?: string | null;
	readonly inspectionId?: string | null;
	readonly collectionId?: string | null;
}) {
	if (inspectionId != null || habitatId != null) {
		return (
			<Badge tone="info" variant="outline">
				Larval
			</Badge>
		);
	}
	if (collectionId != null) {
		return (
			<Badge tone="info" variant="outline">
				Adult
			</Badge>
		);
	}
	return (
		<Badge tone="neutral" variant="outline">
			Standalone
		</Badge>
	);
}

/**
 * One product's usage, as one number where that is honest and several where it
 * is not.
 *
 * The same product can be recorded in gallons on one job and fluid ounces on
 * the next, and `12 gal · 128 fl oz` is a true answer to a question nobody
 * asked. Where the units convert, they are totalled into whichever the
 * organization has chosen for that kind of quantity (`settings.unitDefaults`)
 * and the originals are named, so an operator who recorded ounces can tell why
 * the screen says gallons.
 *
 * Where they do not convert — a larvicide applied both as pouches and by
 * weight — the separated list stands. Nothing is lost and nothing is invented.
 */
export function usageTotal({
	totalsByUnitId,
	unitById,
	unitByCode,
	unitDefaults,
}: {
	readonly totalsByUnitId: ReadonlyMap<string, number>;
	// Structural, so both read paths satisfy it: the camelCase `UnitRow` the
	// unmigrated surfaces hold, and the `UnitLabel` the query hook returns. The
	// code is the conversion key and the abbreviation is what gets printed;
	// nothing here reads anything else off a unit.
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
		// Converting introduces drift a reader should never see: twelve gallons
		// plus a hundred and twenty-eight fluid ounces is exactly thirteen
		// gallons, and doubles make it 12.999999999999998, which then formats as
		// "13.00 gal" and looks like a measurement rather than a total. Six places
		// is far finer than any amount anybody applies, so this only ever removes
		// the arithmetic's own noise.
		text: formatAmount(Number.parseFloat(total.toFixed(6)), targetUnit),
		convertedFrom: `Totalled from ${separated}`,
	};
}
