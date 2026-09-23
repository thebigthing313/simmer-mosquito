import {
	LARVAL_DENSITIES,
	type LarvalDensity,
	type ResolvedLarvalInspectionEntryPolicy,
} from '@simmer-mosquito/domain';
import type { InspectionResult } from '../../../hooks/mutations/use-inspection-mutations';
import type { SchemaCatalogListing } from '../../../hooks/queries/catalog-roster-view';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { densityLabel, type LifeStageFlags } from '../../larval-display';

export type InspectionLocationMode = 'habitat' | 'adhoc';

/** Non-empty sentinels: Radix Select forbids empty-string item values. */
export const unsetDensityValue = 'unset';
export const noHabitatTypeValue = 'none';

export interface InspectionFormValues {
	/** Whether the inspection is tied to an existing habitat or an ad-hoc location. */
	readonly locationMode: InspectionLocationMode;
	/** The target habitat when `locationMode === 'habitat'`. */
	readonly habitatId: string | null;
	/** Optional habitat type for an ad-hoc inspection (`noHabitatTypeValue` = none). */
	readonly habitatTypeId: string;
	/** Optional linked address for an ad-hoc inspection. */
	readonly addressId: string | null;
	/** `YYYY-MM-DD` calendar day the inspection was performed. */
	readonly inspectionDate: string;
	/** Attribution; left null defaults to the acting profile server-side. */
	readonly inspectedByProfileId: string | null;
	/** Profile ids of everyone else who worked this inspection. */
	readonly additionalPersonnelIds: readonly string[];
	readonly isWet: boolean;
	/** `unsetDensityValue` or a `LarvalDensity`. */
	readonly density: string;
	readonly dipCount: number | null;
	readonly larvaeCount: number | null;
	readonly lifeStages: LifeStageFlags;
	/** Specimens collected during this inspection, written once it lands. */
	readonly samples: readonly InspectionSampleDraft[];
	/** Optional comment to attach to the inspection on save (blank = none). */
	readonly comment: string;
}

/**
 * A specimen the crew is recording alongside the inspection. The id is minted
 * here so a row keeps its identity while the form is open.
 */
export interface InspectionSampleDraft {
	readonly id: string;
	/** Blank records an unlabeled sample; the domain has a command for each. */
	readonly label: string;
}

/** Domain issue path → the form field holding it. */
export const INSPECTION_FIELD_PATHS: Readonly<Record<string, string>> = {
	habitatId: 'habitatId',
	habitatTypeId: 'habitatTypeId',
	addressId: 'addressId',
	inspectionDate: 'inspectionDate',
	inspectedByProfileId: 'inspectedByProfileId',
	dipCount: 'dipCount',
	density: 'density',
	larvaeCount: 'larvaeCount',
};

/**
 * `inspectedByProfileId` is seeded with the acting profile rather than left
 * null, so the field names the person the inspection will be attributed to.
 */
export function defaultInspectionFormValues(
	today: string,
	inspectedByProfileId: string | null,
): InspectionFormValues {
	return {
		locationMode: 'habitat',
		habitatId: null,
		habitatTypeId: noHabitatTypeValue,
		addressId: null,
		inspectionDate: today,
		inspectedByProfileId,
		additionalPersonnelIds: [],
		isWet: true,
		density: unsetDensityValue,
		dipCount: null,
		larvaeCount: null,
		lifeStages: emptyLifeStages(),
		samples: [],
		comment: '',
	};
}

interface ResultColumn {
	readonly show: boolean;
	readonly required: boolean;
}

interface ResultColumns {
	readonly density: ResultColumn;
	readonly dips: ResultColumn;
	readonly larvae: ResultColumn;
}

/**
 * Which abundance inputs the organization's entry policy makes meaningful, and
 * which it insists on, mirroring `normalizeLarvalInspectionResult`. Hybrid
 * requires density or the count pair, which no single field can be marked
 * for; the section's note carries that rule.
 */
export function resultColumnsForMode(
	mode: ResolvedLarvalInspectionEntryPolicy['mode'],
): ResultColumns {
	switch (mode) {
		case 'density_only':
			return {
				density: { show: true, required: true },
				dips: { show: true, required: false },
				larvae: { show: false, required: false },
			};
		case 'count_and_dips_required':
			return {
				density: { show: false, required: false },
				dips: { show: true, required: true },
				larvae: { show: true, required: true },
			};
		default:
			return {
				density: { show: true, required: false },
				dips: { show: true, required: false },
				larvae: { show: true, required: false },
			};
	}
}

/** What the section says it needs, when no one field can carry the rule. */
export function findingsRequirement(
	mode: ResolvedLarvalInspectionEntryPolicy['mode'],
): string | null {
	return mode === 'hybrid'
		? 'Record a density, or a larvae count with the dips it came from.'
		: null;
}

/** Whether anything the dry branch would discard has been entered. */
export function hasLarvalData(values: InspectionFormValues): boolean {
	return (
		values.density !== unsetDensityValue ||
		values.dipCount !== null ||
		values.larvaeCount !== null ||
		Object.values(values.lifeStages).some(Boolean) ||
		values.samples.length > 0
	);
}

export function emptyLifeStages(): LifeStageFlags {
	return {
		hasEggs: false,
		hasFirstInstar: false,
		hasSecondInstar: false,
		hasThirdInstar: false,
		hasFourthInstar: false,
		hasPupae: false,
	};
}

export function densityOptions() {
	return [
		{ label: 'Not recorded', value: unsetDensityValue },
		...LARVAL_DENSITIES.map((density) => ({ label: densityLabel(density), value: density })),
	];
}

export function habitatTypeOptions(habitatTypes: readonly SchemaCatalogListing[]) {
	return [
		{ label: 'Unassigned type', value: noHabitatTypeValue },
		...lifecycleOptions(
			habitatTypes,
			(type) => type.isActive,
			(type) => type.name,
		),
	];
}

export function profileOptions(profiles: readonly ProfileListing[]) {
	return lifecycleOptions(
		profiles,
		(profile) => profile.isActive,
		(profile) => profile.displayName,
	);
}

/**
 * What the inspector found, in the vocabulary the write hook takes. A dry
 * inspection carries no abundance and no life stages, so the values are
 * reduced to a consistent result here.
 */
export function inspectionResultOf(values: InspectionFormValues): InspectionResult {
	const wet = values.isWet;
	return {
		inspectionDate: values.inspectionDate,
		inspectedByProfileId: values.inspectedByProfileId,
		isWet: wet,
		dipCount: wet ? values.dipCount : null,
		density: wet && values.density !== unsetDensityValue ? (values.density as LarvalDensity) : null,
		larvaeCount: wet ? values.larvaeCount : null,
		hasEggs: wet && values.lifeStages.hasEggs,
		hasFirstInstar: wet && values.lifeStages.hasFirstInstar,
		hasSecondInstar: wet && values.lifeStages.hasSecondInstar,
		hasThirdInstar: wet && values.lifeStages.hasThirdInstar,
		hasFourthInstar: wet && values.lifeStages.hasFourthInstar,
		hasPupae: wet && values.lifeStages.hasPupae,
	};
}
