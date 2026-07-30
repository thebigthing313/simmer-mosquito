import type { HabitatRow, InsecticideRow, UnitRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';

// Shared labelling for the control-operations routes. Control actions reference
// methods, units, profiles, and (optionally) a habitat or address, so most screens
// need the same handful of name lookups.

/** Habitats may be unnamed — fall back to a short id so rows stay identifiable. */
export function habitatDisplayName(habitat: HabitatRow): string {
	const name = habitat.habitatName?.trim() ?? '';
	if (name.length > 0) {
		return name;
	}
	return `Habitat ${habitat.id.slice(0, 8)}`;
}

/**
 * Insecticides display by trade name everywhere. `shorthand` is an agency's
 * internal abbreviation for data entry, not a name operators should have to read.
 */
export function insecticideDisplayName(insecticide: InsecticideRow): string {
	return insecticide.tradeName;
}

/** `12 gal` — the compact amount+unit pairing used across tables and cards. */
export function formatAmount(amount: number, unit: UnitRow | undefined): string {
	const value = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
	return unit === undefined ? value : `${value} ${unit.abbreviation}`;
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

/** Today as `YYYY-MM-DD` in local time — the default for a new action's date field. */
export function todayDateValue(): string {
	const now = new Date();
	const month = `${now.getMonth() + 1}`.padStart(2, '0');
	const day = `${now.getDate()}`.padStart(2, '0');
	return `${now.getFullYear()}-${month}-${day}`;
}

export function nameById<TRow extends { readonly id: string }>(
	rows: readonly TRow[],
	toName: (row: TRow) => string,
): ReadonlyMap<string, string> {
	return new Map(rows.map((row) => [row.id, toName(row)] as const));
}

/**
 * Unit options for an action's amount field, narrowed to the unit types the domain
 * allows for that action (see `isSourceReductionUnitType` / `isBiocontrolUnitType`).
 */
export function unitOptions(
	units: readonly UnitRow[],
	isAllowed: (unitType: UnitRow['unitType']) => boolean,
): readonly { readonly label: string; readonly value: string }[] {
	return units
		.filter((unit) => isAllowed(unit.unitType))
		.slice()
		.sort((first, second) => first.unitName.localeCompare(second.unitName))
		.map((unit) => ({ label: `${unit.unitName} (${unit.abbreviation})`, value: unit.id }));
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
