import { recordTreatmentCommand } from '@simmer-mosquito/domain';
import type { FieldOption, MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import type { useRecordForm } from '../../../hooks/forms/use-record-form';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type {
	TreatmentLineInput,
	TreatmentMix,
	TreatmentValues,
} from '../../../hooks/mutations/use-treatment-mutations';
import type {
	FormulationComponentListing,
	InsecticideListing,
} from '../../../hooks/queries/chemical-roster-view';
import type { UnitType } from '../../../hooks/queries/use-unit-labels';
import {
	FORM_VALIDATION_CONTEXT,
	validateAgainstCommand,
	validationLocationSource,
} from '../../../lib/domain-validation';
import { todayInTimeZone } from '../../../lib/local-date';
import {
	blankLine,
	lineFieldForIssue,
	lineRefusals,
	liveLines,
	type TreatmentLineValue,
	type TreatmentRecipe,
} from './treatment-line-values';

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

/** Domain issue path → the form field holding it, for the visit's own fields. */
const TREATMENT_FIELD_PATHS: Readonly<Record<string, string>> = {
	applicationDate: 'applicationDate',
	applicatorProfileId: 'applicatorProfileId',
	applicationMethodId: 'applicationMethodId',
	vehicleId: 'vehicleId',
	equipmentId: 'equipmentId',
	addressId: 'addressId',
	metadata: 'metadata',
	formulationId: 'formulationId',
	mixAmount: 'mixAmount',
	mixUnitId: 'formulationId',
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
 * How the crew enters the products: one at a time, or from a saved
 * Formulation, whose recipe then sets every row's product, amount and unit.
 */
export type TreatmentEntry = 'products' | 'formulation';

export interface TreatmentFormValues {
	readonly entry: TreatmentEntry;
	/** A formulation id, or '' when none. Set only under formulation entry. */
	readonly formulationId: string;
	/** The finished mix that went out, in the Formulation's batch unit. */
	readonly mixAmount: number | null;
	/** The products, saved rows the crew removed included until Save. */
	readonly lines: readonly TreatmentLineValue[];
	/** `YYYY-MM-DD`: the day the Treatment was made. */
	readonly applicationDate: string;
	/** `noSelectionValue` or an application method id. */
	readonly applicationMethodId: string;
	/** `noSelectionValue` or the applicator's profile id. */
	readonly applicatorProfileId: string;
	/** Profile ids of everyone else who worked this Treatment. */
	readonly additionalPersonnelIds: readonly string[];
	/** `noSelectionValue` or a vehicle id. */
	readonly vehicleId: string;
	/** `noSelectionValue` or an equipment id. */
	readonly equipmentId: string;
	/** Optional address, reference data only. The Treatment's own geometry is its location. */
	readonly addressId: string | null;
	/** Optional larval context: the habitat this Treatment was performed against. */
	readonly habitatId: string | null;
	/** Values for the custom fields the chosen application method declares. */
	readonly metadata: MetadataValue;
	/** Create only: saved as the Treatment's first comment. Ignored on edit. */
	readonly comment: string;
}

/** The form instance the page builds, which the products section and its rows take. */
export type TreatmentForm = ReturnType<typeof useRecordForm<TreatmentFormValues>>;

export function defaultTreatmentFormValues(timeZone: string): TreatmentFormValues {
	return {
		entry: 'products',
		formulationId: '',
		mixAmount: null,
		lines: [blankLine()],
		applicationDate: todayInTimeZone(timeZone),
		applicationMethodId: noSelectionValue,
		applicatorProfileId: noSelectionValue,
		additionalPersonnelIds: [],
		vehicleId: noSelectionValue,
		equipmentId: noSelectionValue,
		addressId: null,
		habitatId: null,
		metadata: null,
		comment: '',
	};
}

/** `noSelectionValue` and '' both mean nothing was picked. */
function nullableSelection(value: string): string | null {
	return value === noSelectionValue || value === '' ? null : value;
}

/** Prepend the "not set" sentinel every optional select needs. */
export function optionalOptions(
	options: readonly FieldOption[],
	emptyLabel: string,
): readonly FieldOption[] {
	return [{ label: emptyLabel, value: noSelectionValue }, ...options];
}

/** What a crew left blank under formulation entry, keyed by field. */
function formulationRefusals(
	value: TreatmentFormValues,
	recipe: TreatmentRecipe,
): Record<string, string> {
	if (value.entry !== 'formulation') {
		return {};
	}
	const refusals: Record<string, string> = {};
	if (value.formulationId === '' || recipe.formulation === undefined) {
		refusals.formulationId = 'Pick a formulation.';
	} else if (recipe.components.length === 0) {
		refusals.formulationId = `${recipe.formulation.formulationName} has no products in it.`;
	}
	if (value.mixAmount === null) {
		refusals.mixAmount = 'Enter the total mix applied.';
	}
	return refusals;
}

/** Each live row's `applications.N.<column>` issue path, mapped onto its field. */
function issuePathMap(lines: readonly TreatmentLineValue[]): Record<string, string> {
	const pathMap: Record<string, string> = { ...TREATMENT_FIELD_PATHS };
	liveLines(lines).forEach((_line, position) => {
		for (const column of ['insecticide_id', 'amount_applied', 'application_unit_id']) {
			const path = `applications.${position}.${column}`;
			const field = lineFieldForIssue(lines, path);
			if (field !== null) {
				pathMap[path] = field;
			}
		}
	});
	return pathMap;
}

/** The Formulation set the builder is handed, whole or not at all. */
function formulationSet(value: TreatmentFormValues, recipe: TreatmentRecipe) {
	return value.entry === 'formulation' &&
		recipe.formulation !== undefined &&
		value.mixAmount !== null
		? {
				formulationId: recipe.formulation.id,
				mixAmount: value.mixAmount,
				mixUnitId: recipe.formulation.batchUnitId,
			}
		: {};
}

/**
 * The form's rules. The rows are checked here first, so a repeated product
 * reads "X is already line 1" on its row rather than as the domain's sentence,
 * and the Formulation set is checked for what the crew left blank. The rest is
 * `recordTreatmentCommand`, the same builder the server runs, with each
 * `applications.N` issue mapped onto row N's field.
 */
export function validateTreatment(
	value: TreatmentFormValues,
	geometry: DrawGeometry | null,
	recipe: TreatmentRecipe,
	insecticides: readonly InsecticideListing[],
) {
	const live = liveLines(value.lines);
	const fields: Record<string, string> = {
		...formulationRefusals(value, recipe),
		...lineRefusals(value.lines, insecticides),
	};
	const form: string[] = [];
	if (live.length === 0 && fields.formulationId === undefined) {
		form.push('Add at least one product.');
	}

	const domain = validateAgainstCommand(
		() =>
			recordTreatmentCommand({
				...FORM_VALIDATION_CONTEXT,
				treatmentId: FORM_VALIDATION_CONTEXT.organizationId,
				locationSource: validationLocationSource(geometry),
				applicationDate: value.applicationDate,
				applicatorProfileId: nullableSelection(value.applicatorProfileId),
				applicationMethodId: nullableSelection(value.applicationMethodId),
				vehicleId: nullableSelection(value.vehicleId),
				equipmentId: nullableSelection(value.equipmentId),
				addressId: value.addressId,
				metadata: value.metadata,
				...formulationSet(value, recipe),
				applications: live.map((line) => ({
					id: line.id,
					insecticide_id: line.insecticideId,
					amount_applied: line.amount ?? Number.NaN,
					application_unit_id: line.unitId,
				})),
			}),
		issuePathMap(value.lines),
	);
	for (const [field, message] of Object.entries(domain?.fields ?? {})) {
		fields[field] ??= message;
	}
	// An empty set is already said above, in the form's own words.
	if (live.length > 0) {
		form.push(...(domain?.form ?? []));
	}

	const hasFields = Object.keys(fields).length > 0;
	if (!hasFields && form.length === 0) {
		return undefined;
	}
	return {
		...(form.length > 0 ? { form: form.join(' ') } : {}),
		...(hasFields ? { fields } : {}),
	};
}

/**
 * The values as the mutation hook takes them: the visit's fields, the
 * Formulation set under formulation entry, and the live rows. A removed row is
 * left out, which is how the revise removes it.
 */
export function treatmentSaveInput(
	value: TreatmentFormValues,
	recipe: TreatmentRecipe,
): {
	readonly values: TreatmentValues;
	readonly mix: TreatmentMix | null;
	readonly lines: readonly TreatmentLineInput[];
} {
	const formulation = value.entry === 'formulation' ? recipe.formulation : undefined;
	return {
		values: {
			actionDate: value.applicationDate,
			methodId: nullableSelection(value.applicationMethodId),
			applicatorProfileId: nullableSelection(value.applicatorProfileId),
			vehicleId: nullableSelection(value.vehicleId),
			equipmentId: nullableSelection(value.equipmentId),
			addressId: value.addressId,
			habitatId: value.habitatId,
			metadata: value.metadata,
		},
		mix:
			formulation === undefined || value.mixAmount === null
				? null
				: {
						formulationId: formulation.id,
						mixAmount: value.mixAmount,
						mixUnitId: formulation.batchUnitId,
					},
		lines: liveLines(value.lines).map((line) => {
			if (line.amount === null) {
				throw new Error('Enter the amount applied on every product.');
			}
			return {
				id: line.id,
				insecticideId: line.insecticideId,
				amountApplied: line.amount,
				unitId: line.unitId,
				insecticideBatchIds: line.batchIds,
			};
		}),
	};
}
