/**
 * What a control action looks like above the query layer.
 *
 * Not a hook, so not a `use-` file: the three hooks that return these live beside
 * it. Three interfaces rather than one with a discriminant, because the three
 * actions only *look* alike — an application names a product and a set of
 * batches, a biocontrol release names an organism, a source reduction names
 * neither — and a union would make every surface narrow before it could read the
 * one field it came for.
 *
 * ## The amount and its unit
 *
 * All three record a quantity against a unit the organization chose, and all
 * three carry it as a number plus the unit's abbreviation rather than a
 * formatted string. `formatAmount` in
 * `routes/control-operations/-control-display.tsx` is what turns the pair into
 * `12 gal`, and it stays a function because the rule is conditional on the
 * value — integers keep their form, fractions take two places — which a
 * projection cannot express.
 *
 * `unitAbbreviation` is `null` only while the unit has not streamed; the column
 * behind it is not nullable on any of the three. Units are eager, so in practice
 * that window does not exist.
 */

import type { LinkedAddress } from './address-view';

/** What every control action carries, whatever it did. */
interface ControlActionBase {
	readonly id: string;
	/** `YYYY-MM-DD`. A `date` column, so a string — never a `Date`. */
	readonly actionDate: string;
	readonly addressId: string | null;
	/** Joined, not looked up — see `address-view.ts` for why it is nested here. */
	readonly address: LinkedAddress;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
	readonly requestedControlActionId: string | null;
	readonly missionItemId: string | null;
	readonly latitude: number;
	readonly longitude: number;
	readonly geometryKind: string;
	readonly metadata: unknown;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
}

/** A chemical application: a product put out at an amount, by a method. */
export interface ChemicalApplication extends ControlActionBase {
	readonly insecticideId: string;
	/** The product's trade name — what an application is titled by. */
	readonly productName: string;
	/**
	 * `null` when the application names no method, which every surface
	 * distinguishes from a method it could not resolve. Guard on `methodId`.
	 */
	readonly methodId: string | null;
	readonly methodName: string | null;
	readonly applicatorProfileId: string | null;
	readonly applicatorName: string | null;
	readonly amountApplied: number;
	readonly unitId: string;
	readonly unitAbbreviation: string | null;
	readonly vehicleId: string | null;
	/** `null` when no vehicle was recorded. Guard on `vehicleId`, as with the method. */
	readonly vehicleName: string | null;
	readonly equipmentId: string | null;
	readonly equipmentName: string | null;
	/** The adult collection this was applied against, if any. */
	readonly collectionId: string | null;
}

/** A biocontrol release: an organism put out at an amount. */
export interface BiocontrolAction extends ControlActionBase {
	readonly methodId: string;
	/** Never null — a release must name a method. `Unknown method` while streaming. */
	readonly methodName: string;
	readonly technicianProfileId: string | null;
	readonly technicianName: string | null;
	readonly amountReleased: number;
	readonly unitId: string;
	readonly unitAbbreviation: string | null;
}

/** A source reduction: sources eliminated, by a method. */
export interface SourceReduction extends ControlActionBase {
	readonly methodId: string;
	/** Never null — a source reduction must name a method. */
	readonly methodName: string;
	readonly technicianProfileId: string | null;
	readonly technicianName: string | null;
	readonly sourcesEliminated: number;
	readonly unitId: string;
	readonly unitAbbreviation: string | null;
}
