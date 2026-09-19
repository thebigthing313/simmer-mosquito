import {
	expandFormulationApplicationCommands,
	recordChemicalApplicationCommand,
} from '@simmer-mosquito/domain';
import type { FieldOption, MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type {
	FormulationComponentListing,
	InsecticideListing,
} from '../../../hooks/queries/chemical-roster-view';
import type { UnitType } from '../../../hooks/queries/use-unit-labels';
import {
	domainValidator,
	FORM_VALIDATION_CONTEXT,
	validationLocationSource,
} from '../../../lib/domain-validation';
import { todayInTimeZone } from '../../../lib/local-date';
import { insecticideDisplayName } from '../control-display';

/** Non-empty sentinel: Radix Select forbids empty-string item values. */
export const noSelectionValue = 'none';

/** Shared empty list, so an unselected formulation keeps a stable identity. */
export const NO_COMPONENTS: readonly FormulationComponentListing[] = [];

/** The components of every formulation the caller supplied, keyed by formulation. */
export function groupComponentsByFormulation(
	components: readonly FormulationComponentListing[] | undefined,
): ReadonlyMap<string, readonly FormulationComponentListing[]> {
	const grouped = new Map<string, FormulationComponentListing[]>();
	for (const component of components ?? []) {
		const bucket = grouped.get(component.formulationId);
		if (bucket === undefined) {
			grouped.set(component.formulationId, [component]);
		} else {
			bucket.push(component);
		}
	}
	return grouped;
}

/** Domain issue path → the form field holding it. */
const APPLICATION_FIELD_PATHS: Readonly<Record<string, string>> = {
	insecticideId: 'insecticideId',
	amountApplied: 'amountApplied',
	applicationUnitId: 'applicationUnitId',
	applicationDate: 'applicationDate',
	applicatorProfileId: 'applicatorProfileId',
	applicationMethodId: 'applicationMethodId',
	vehicleId: 'vehicleId',
	equipmentId: 'equipmentId',
	addressId: 'addressId',
	metadata: 'metadata',
};

/**
 * The same map for a formulation entry, where the product and the amount are the
 * mix's. Anything the expansion reports per component (`components.0.ratio`)
 * lands on the form alert.
 */
const FORMULATION_FIELD_PATHS: Readonly<Record<string, string>> = {
	...APPLICATION_FIELD_PATHS,
	insecticideId: 'formulationId',
	totalAmount: 'amountApplied',
	batchSize: 'formulationId',
	components: 'formulationId',
};

/**
 * Amounts are recorded as a product quantity, so only the unit types a chemical
 * treatment can be measured in are offered (matching the insecticide catalog's
 * default-usage-unit choices).
 */
export function isApplicationUnitType(unitType: UnitType): boolean {
	return unitType === 'volume' || unitType === 'weight' || unitType === 'count';
}

/**
 * Whether the operator is entering one product or a saved mix. A formulation is
 * a calculator, not a record: choosing one splits the total into one
 * single-insecticide application per component product
 * (`docs/control-operations-domain.md`).
 */
export type ApplicationProductMode = 'insecticide' | 'formulation';

/** The chosen mix, as the expansion needs it: how big a batch is, and what is in one. */
export interface ApplicationMix {
	/** The mix's batch size, or `NaN` when no mix is chosen. */
	readonly batchSize: number;
	/** The chosen mix's component products, empty when no mix is chosen. */
	readonly components: readonly FormulationComponentListing[];
}

/**
 * The form's rules, straight from the domain builder. A mix is validated as
 * what it becomes, through the same expansion the save runs; an unchosen mix
 * reaches the expansion as no components and a `NaN` batch size, and both
 * issues map onto the formulation field.
 */
export function validateApplication(
	value: ApplicationFormValues,
	geometry: DrawGeometry | null,
	requireLocation: boolean,
	mix: ApplicationMix,
) {
	const shared = {
		...FORM_VALIDATION_CONTEXT,
		locationSource: validationLocationSource(geometry, requireLocation),
		applicationDate: value.applicationDate,
		applicatorProfileId:
			value.applicatorProfileId === noSelectionValue ? null : value.applicatorProfileId,
		applicationMethodId:
			value.applicationMethodId === noSelectionValue ? null : value.applicationMethodId,
		vehicleId: value.vehicleId === noSelectionValue ? null : value.vehicleId,
		equipmentId: value.equipmentId === noSelectionValue ? null : value.equipmentId,
		addressId: value.addressId,
		metadata: value.metadata,
	};
	if (value.productMode === 'formulation') {
		return domainValidator(
			() =>
				expandFormulationApplicationCommands({
					...shared,
					totalAmount: value.amountApplied as number,
					batchSize: mix.batchSize,
					components: mix.components.map((component, index) => ({
						insecticideId: component.insecticideId,
						amount: component.amount,
						unitId: component.unitId,
						applicationId: placeholderApplicationId(index),
					})),
				}),
			FORMULATION_FIELD_PATHS,
		)({ value });
	}
	return domainValidator(
		() =>
			recordChemicalApplicationCommand({
				...shared,
				applicationId: FORM_VALIDATION_CONTEXT.organizationId,
				insecticideId: value.insecticideId,
				amountApplied: value.amountApplied as number,
				applicationUnitId: value.applicationUnitId,
			}),
		APPLICATION_FIELD_PATHS,
	)({ value });
}

export interface ApplicationFormValues {
	readonly productMode: ApplicationProductMode;
	/** An insecticide id, or '' when unset (placeholder shown). Single-product entry. */
	readonly insecticideId: string;
	/** A formulation id, or '' when unset. Formulation entry. */
	readonly formulationId: string;
	/** The amount that went out, of the product, or of the whole mix. */
	readonly amountApplied: number | null;
	/** A unit id, or '' when unset. Defaults from the chosen insecticide. */
	readonly applicationUnitId: string;
	/** `YYYY-MM-DD`: the day the application was made. */
	readonly applicationDate: string;
	/** `noSelectionValue` or an application method id. */
	readonly applicationMethodId: string;
	/** `noSelectionValue` or the applicator's profile id. */
	readonly applicatorProfileId: string;
	/** Profile ids of everyone else who worked this application. */
	readonly additionalPersonnelIds: readonly string[];
	/** Ids of the applied product's lots this treatment drew from. */
	readonly insecticideBatchIds: readonly string[];
	/** Lots per component product, keyed by insecticide id. Formulation entry. */
	readonly componentBatchIds: Readonly<Record<string, readonly string[]>>;
	/** `noSelectionValue` or a vehicle id. */
	readonly vehicleId: string;
	/** `noSelectionValue` or an equipment id. */
	readonly equipmentId: string;
	/**
	 * Optional address the application was made at, reference data only. The
	 * application's own point is the authoritative location.
	 */
	readonly addressId: string | null;
	/** Optional larval context: the habitat this treatment was performed against. */
	readonly habitatId: string | null;
	/** Values for the custom fields the chosen application method declares. */
	readonly metadata: MetadataValue;
	/** Create only: saved as the application's first comment. Ignored on edit. */
	readonly comment: string;
}

export function defaultApplicationFormValues(timeZone: string): ApplicationFormValues {
	return {
		productMode: 'insecticide',
		insecticideId: '',
		formulationId: '',
		amountApplied: null,
		applicationUnitId: '',
		applicationDate: todayInTimeZone(timeZone),
		applicationMethodId: noSelectionValue,
		applicatorProfileId: noSelectionValue,
		additionalPersonnelIds: [],
		insecticideBatchIds: [],
		componentBatchIds: {},
		vehicleId: noSelectionValue,
		equipmentId: noSelectionValue,
		addressId: null,
		habitatId: null,
		metadata: null,
		comment: '',
	};
}

// --- helpers ----------------------------------------------------------------

/** Prepend the "not set" sentinel every optional select needs. */
export function optionalOptions(
	options: readonly FieldOption[],
	emptyLabel: string,
): readonly FieldOption[] {
	return [{ label: emptyLabel, value: noSelectionValue }, ...options];
}

/** A component product's name, for a label or a breakdown row. */
export function productLabel(
	insecticides: readonly InsecticideListing[],
	insecticideId: string,
): string {
	const insecticide = insecticides.find((row) => row.id === insecticideId);
	return insecticide === undefined ? 'Unknown insecticide' : insecticideDisplayName(insecticide);
}

/**
 * A well-formed stand-in id per generated application, so the expansion runs its
 * real rules during validation. The save mints the ids that are actually stored.
 */
function placeholderApplicationId(index: number): string {
	return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}
