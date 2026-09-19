import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import {
	recordCollectedAdHocCollectionCommand,
	recordCollectedTrapCollectionCommand,
	setAdHocCollectionCommand,
	setTrapCollectionCommand,
} from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type { CollectionFields } from '../../../hooks/mutations/use-collection-mutations';
import type { CatalogListing } from '../../../hooks/queries/catalog-roster-view';
import type { ProfileListing } from '../../../hooks/queries/use-profile-roster';
import type { TrapOption } from '../../../hooks/queries/use-trap-options';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../../lib/domain-validation';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { isPendingCollection as isPendingCollectionRow } from '../adult-display';
import { collectionTimingStamps } from './collection-timing';

export type CollectionSourceMode = 'trap' | 'adhoc';

/** Non-empty sentinels: Radix Select forbids empty-string item values. */
export const noLureValue = 'none';
export const noUnitValue = 'none';

/**
 * Domain issue path to the form field holding it. Timing issues nest under the
 * `timing` object the builder validates, so they map onto whichever date field
 * the current timing mode shows.
 */
const COLLECTION_FIELD_PATHS: Readonly<Record<string, string>> = {
	trapId: 'trapId',
	collectionMethodId: 'collectionMethodId',
	collectionLureId: 'collectionLureId',
	addressId: 'addressId',
	setByProfileId: 'setByProfileId',
	collectedByProfileId: 'collectedByProfileId',
	'timing.collectedAt': 'collectedAt',
	'timing.startedAt': 'startedAt',
	// The two set commands take `startedAt` directly rather than a timing, so the
	// same field is reported under a second path and needs both entries.
	startedAt: 'startedAt',
	'timing.collectionDate': 'collectionDate',
	'timing.durationAmount': 'durationAmount',
	'timing.durationUnitId': 'durationUnitId',
};

/**
 * Whether the trap has been emptied yet, asked of the form's own values. The
 * rule is the badge's, so the form and the record cannot disagree.
 */
export function isPendingCollectionDraft(value: CollectionFormValues): boolean {
	return isPendingCollectionRow({
		collectedAt: value.collectedAt,
		collectionTimingMode: value.timingMode,
	});
}

/**
 * A collection has six command shapes (trap or ad-hoc, crossed with exact
 * timestamps, date-plus-duration, or not yet emptied) and the validator picks
 * the same one the save will.
 */
export function validateCollection(value: CollectionFormValues, geometry: DrawGeometry | null) {
	const pending = isPendingCollectionDraft(value);
	const timing =
		value.timingMode === 'exact_timestamps'
			? ({
					mode: 'exact_timestamps',
					startedAt: parseDateValue(value.startedAt),
					collectedAt: parseDateValue(value.collectedAt),
				} as never)
			: ({
					mode: 'collection_date_duration',
					collectionDate: value.collectionDate ?? '',
					durationAmount: value.durationAmount as number,
					durationUnitId: value.durationUnitId === noUnitValue ? '' : value.durationUnitId,
				} as never);
	const base = {
		...FORM_VALIDATION_CONTEXT,
		collectionId: FORM_VALIDATION_CONTEXT.organizationId,
		timing,
		setByProfileId: value.setByProfileId,
		collectedByProfileId: value.collectedByProfileId,
	};
	const adHoc = {
		collectionMethodId: value.collectionMethodId,
		locationSource: { kind: 'geometry' as const, geometry: (geometry ?? null) as never },
		collectionLureId: value.collectionLureId === noLureValue ? null : value.collectionLureId,
		addressId: value.addressId,
	};

	return domainValidator(() => {
		if (pending) {
			// The set commands take `startedAt` directly rather than a timing, and
			// carry no collected half at all.
			const startedAt = parseDateValue(value.startedAt);
			return value.sourceMode === 'trap'
				? setTrapCollectionCommand({ ...base, trapId: value.trapId ?? '', startedAt })
				: setAdHocCollectionCommand({ ...base, ...adHoc, startedAt });
		}
		return value.sourceMode === 'trap'
			? recordCollectedTrapCollectionCommand({ ...base, trapId: value.trapId ?? '' })
			: recordCollectedAdHocCollectionCommand({ ...base, ...adHoc });
	}, COLLECTION_FIELD_PATHS)({ value });
}

/** `YYYY-MM-DD` to a Date the builder can range-check; invalid stays invalid. */
function parseDateValue(value: string | null): Date {
	return new Date(value ?? '');
}

/** Where the chosen trap stands, as the context outline the map draws behind the form. */
export function trapPoint(trap: TrapOption | null): GeoJsonGeometry | null {
	if (trap === null) {
		return null;
	}
	return { type: 'Point', coordinates: [trap.longitude, trap.latitude] };
}

export interface CollectionFormValues {
	readonly sourceMode: CollectionSourceMode;
	/** Target trap when `sourceMode === 'trap'`. */
	readonly trapId: string | null;
	/** Ad-hoc address when `sourceMode === 'adhoc'`. */
	readonly addressId: string | null;
	/** Method id, or '' when unset. Derived from the trap in trap mode. */
	readonly collectionMethodId: string;
	/** `noLureValue` or a lure id. */
	readonly collectionLureId: string;
	readonly timingMode: AdultCollectionTimingMode;
	/** `YYYY-MM-DD` the trap was set (exact mode, optional). */
	readonly startedAt: string | null;
	/** `YYYY-MM-DD` specimens were retrieved (exact mode, required). */
	readonly collectedAt: string | null;
	/** `YYYY-MM-DD` collection date (date + duration mode). */
	readonly collectionDate: string | null;
	readonly durationAmount: number | null;
	/** `noUnitValue` until picked; required in date + duration mode. */
	readonly durationUnitId: string;
	readonly setByProfileId: string | null;
	readonly collectedByProfileId: string | null;
	/** Profile ids of everyone else who worked this collection. */
	readonly additionalPersonnelIds: readonly string[];
	readonly hasProblem: boolean;
	/** Values for the custom fields the collection method declares. */
	readonly metadata: MetadataValue;
	/** Create only: saved as the collection's first comment. Ignored on edit. */
	readonly comment: string;
}

export function defaultCollectionFormValues(
	today: string,
	trapId: string | null,
	/** The default timing mode, from organization settings. */
	timingMode: AdultCollectionTimingMode,
): CollectionFormValues {
	return {
		sourceMode: 'trap',
		trapId,
		addressId: null,
		collectionMethodId: '',
		collectionLureId: noLureValue,
		timingMode,
		startedAt: null,
		collectedAt: timingMode === 'exact_timestamps' ? today : null,
		collectionDate: timingMode === 'collection_date_duration' ? today : null,
		durationAmount: null,
		durationUnitId: noUnitValue,
		setByProfileId: null,
		collectedByProfileId: null,
		additionalPersonnelIds: [],
		hasProblem: false,
		metadata: null,
		comment: '',
	};
}

/**
 * What the form holds, as the write seam takes it. The "no lure" and "no unit"
 * sentinels stop here, and the typed days become instants off one clock; see
 * `collectionTimingStamps`.
 */
export function collectionFieldsFrom(
	values: CollectionFormValues,
	timeZone: string,
): CollectionFields {
	const exact = values.timingMode === 'exact_timestamps';
	const stamps = collectionTimingStamps(values, timeZone);
	return {
		collectionMethodId: values.collectionMethodId,
		collectionLureId: values.collectionLureId === noLureValue ? null : values.collectionLureId,
		addressId: values.addressId,
		timing: {
			timingMode: values.timingMode,
			startedAt: stamps.startedAt,
			collectedAt: stamps.collectedAt,
			collectionDate: exact ? null : values.collectionDate,
			durationAmount: exact ? null : values.durationAmount,
			durationUnitId: exact || values.durationUnitId === noUnitValue ? null : values.durationUnitId,
		},
		setByProfileId: values.setByProfileId,
		collectedByProfileId: values.collectedByProfileId,
		hasProblem: values.hasProblem,
		metadata: values.metadata,
	};
}

export function lureOptions(lures: readonly CatalogListing[]) {
	return [
		{ label: 'No lure', value: noLureValue },
		...lifecycleOptions(
			lures,
			(lure) => lure.isActive,
			(lure) => lure.name,
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
