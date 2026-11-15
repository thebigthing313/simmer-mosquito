import type { ControlType } from './column-vocabularies.js';
import {
	actorDefaultProfileId,
	nullableText,
	optionalId,
	optionalUuid,
	requiredId,
	requiredUuid,
	validateLocalDate,
} from './command-validation.js';
import type { DomainId, DomainValidationIssue, LocalDateString } from './shared.js';

export type { ControlType };
export type PerformedControlActionKind =
	| 'chemicalApplication'
	| 'sourceReduction'
	| 'outreach'
	| 'biocontrol';

export type ControlActionContext =
	| { readonly kind: 'none' }
	| {
			readonly kind: 'larval';
			readonly habitatId?: DomainId;
			readonly inspectionId?: DomainId;
	  }
	| { readonly kind: 'adult'; readonly collectionId: DomainId };

/** One batch link on a Chemical Application, spelled as its `application_batches` row. */
export interface TreatmentApplicationBatchRow {
	readonly id: DomainId;
	readonly insecticide_batch_id: DomainId;
}

/**
 * One Chemical Application in a Treatment's line set, spelled as its
 * `applications` row with its batch links nested under it.
 *
 * The keys are column names because they are child rows, which keep their
 * column names on `/commands/{table}`. The Treatment's own fields beside them
 * stay `camelCase`.
 */
export interface TreatmentApplicationRow {
	readonly id: DomainId;
	readonly insecticide_id: DomainId;
	readonly amount_applied: number;
	readonly application_unit_id: DomainId;
	readonly application_batches: readonly TreatmentApplicationBatchRow[];
}

/** A line as a caller may pass it: a line with no batches may leave the list out. */
export type TreatmentApplicationRowInput = Omit<TreatmentApplicationRow, 'application_batches'> & {
	readonly application_batches?: readonly TreatmentApplicationBatchRow[];
};

/** The Formulation a Treatment was mixed from, as a caller passes it. */
export interface TreatmentFormulationInput {
	readonly formulationId?: DomainId | null;
	readonly mixAmount?: number | null;
	readonly mixUnitId?: DomainId | null;
}

/** All three set, or all three null. */
export type TreatmentFormulation =
	| {
			readonly formulationId: DomainId;
			readonly mixAmount: number;
			readonly mixUnitId: DomainId;
	  }
	| { readonly formulationId: null; readonly mixAmount: null; readonly mixUnitId: null };

export interface NormalizedTreatmentFields {
	readonly applicationDate: LocalDateString;
	readonly applicatorProfileId: DomainId;
	readonly applicationMethodId: DomainId | null;
	readonly vehicleId: DomainId | null;
	readonly equipmentId: DomainId | null;
	readonly formulation: TreatmentFormulation;
	readonly applications: readonly TreatmentApplicationRow[];
}

export interface NormalizedSourceReductionFields {
	readonly sourceReductionDate: LocalDateString;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: DomainId;
	readonly sourceReductionMethodId: DomainId | null;
	readonly technicianProfileId: DomainId;
}

export interface NormalizedOutreachFields {
	readonly outreachDate: LocalDateString;
	readonly reach: number;
	readonly outreachMethodId: DomainId | null;
	readonly technicianProfileId: DomainId;
	readonly reachDescription: string | null;
}

export interface NormalizedBiocontrolFields {
	readonly biocontrolDate: LocalDateString;
	readonly amountReleased: number;
	readonly releaseUnitId: DomainId;
	readonly biocontrolMethodId: DomainId | null;
	readonly technicianProfileId: DomainId;
}

// These normalizers accumulate issues and return fallback field values for error paths.
// Callers must throw on collected issues before treating returned fields as valid payload data.
export function normalizeTreatmentFields(
	input: TreatmentFormulationInput & {
		readonly actorProfileId: DomainId;
		readonly applicationDate: LocalDateString | undefined;
		readonly applicatorProfileId?: DomainId | null;
		readonly applicationMethodId?: DomainId | null;
		readonly vehicleId?: DomainId | null;
		readonly equipmentId?: DomainId | null;
		readonly applications: readonly TreatmentApplicationRowInput[] | undefined;
	},
	issues: DomainValidationIssue[],
): NormalizedTreatmentFields {
	validateLocalDate(input.applicationDate, 'applicationDate', issues);
	return {
		applicationDate: input.applicationDate ?? '',
		applicatorProfileId: actorDefaultProfileId(input.applicatorProfileId, input.actorProfileId),
		applicationMethodId: optionalUuid(input.applicationMethodId, 'applicationMethodId', issues),
		vehicleId: optionalUuid(input.vehicleId, 'vehicleId', issues),
		equipmentId: optionalUuid(input.equipmentId, 'equipmentId', issues),
		formulation: normalizeTreatmentFormulation(input, issues),
		applications: normalizeTreatmentApplications(input.applications, issues),
	};
}

const FORMULATION_FIELDS = ['formulationId', 'mixAmount', 'mixUnitId'] as const;

/**
 * The Formulation set on a create: all three named, or none of them.
 *
 * A Treatment that names a Formulation without the amount of mix, or the amount
 * without its unit, is a reference the server cannot check the lines against,
 * so the set is refused unless it is whole. `null` and absent both mean "not
 * mixed from a Formulation".
 */
function normalizeTreatmentFormulation(
	input: TreatmentFormulationInput,
	issues: DomainValidationIssue[],
): TreatmentFormulation {
	const named = FORMULATION_FIELDS.filter(
		(field) => input[field] !== undefined && input[field] !== null,
	);
	if (named.length === 0) {
		return { formulationId: null, mixAmount: null, mixUnitId: null };
	}
	if (named.length < FORMULATION_FIELDS.length) {
		for (const field of FORMULATION_FIELDS) {
			if (!named.includes(field)) {
				issues.push({
					path: field,
					message: `${field} is required when ${named.join(' and ')} is set; formulationId, mixAmount and mixUnitId are set together or not at all.`,
				});
			}
		}
		return { formulationId: null, mixAmount: null, mixUnitId: null };
	}
	return {
		formulationId: requiredUuid(input.formulationId, 'formulationId', issues),
		mixAmount: positiveFiniteNumber(input.mixAmount ?? undefined, 'mixAmount', issues),
		mixUnitId: requiredUuid(input.mixUnitId, 'mixUnitId', issues),
	};
}

/**
 * The Formulation set on an edit, where absent means "leave it alone".
 *
 * Naming none of the three leaves the reference as stored and returns
 * `undefined`. Naming all three sets it when all are values and clears it when
 * all are `null`. Anything between is refused, because the stored set would
 * come out half changed.
 */
export function normalizeTreatmentFormulationChange(
	input: TreatmentFormulationInput,
	issues: DomainValidationIssue[],
): TreatmentFormulation | undefined {
	const named = FORMULATION_FIELDS.filter((field) => input[field] !== undefined);
	if (named.length === 0) {
		return undefined;
	}
	if (named.length < FORMULATION_FIELDS.length) {
		for (const field of FORMULATION_FIELDS) {
			if (!named.includes(field)) {
				issues.push({
					path: field,
					message: `${field} is required when ${named.join(' and ')} changes; formulationId, mixAmount and mixUnitId change together.`,
				});
			}
		}
		return undefined;
	}
	const cleared = FORMULATION_FIELDS.filter((field) => input[field] === null);
	if (cleared.length === FORMULATION_FIELDS.length) {
		return { formulationId: null, mixAmount: null, mixUnitId: null };
	}
	if (cleared.length > 0) {
		for (const field of cleared) {
			issues.push({
				path: field,
				message: `${field} cannot be cleared on its own; formulationId, mixAmount and mixUnitId are set or cleared together.`,
			});
		}
		return undefined;
	}
	return normalizeTreatmentFormulation(input, issues);
}

/**
 * A Treatment's line set: at least one Chemical Application, one per Insecticide.
 *
 * Every issue names the line by its index in the list (`applications.N.…`), so
 * a client can put the refusal on the row it came from. A repeated Insecticide
 * is refused here as well as on the server, which checks again against the
 * stored set; a second batch of the same product belongs on the existing line.
 */
export function normalizeTreatmentApplications(
	values: readonly TreatmentApplicationRowInput[] | undefined,
	issues: DomainValidationIssue[],
): readonly TreatmentApplicationRow[] {
	if (!Array.isArray(values)) {
		issues.push({ path: 'applications', message: 'applications must be an array.' });
		return [];
	}
	if (values.length === 0) {
		issues.push({
			path: 'applications',
			message: 'A treatment needs at least one chemical application.',
		});
		return [];
	}
	const lineIds = new Set<string>();
	const batchLinkIds = new Set<string>();
	const lineByInsecticide = new Map<string, number>();
	return values.map((value: TreatmentApplicationRowInput | null | undefined, index) => {
		const path = `applications.${index}`;
		const row: Partial<TreatmentApplicationRowInput> = value ?? {};
		const id = requiredUuid(row.id, `${path}.id`, issues);
		if (id !== '' && lineIds.has(id)) {
			issues.push({ path: `${path}.id`, message: 'Chemical application ids must be unique.' });
		}
		lineIds.add(id);
		const insecticideId = requiredUuid(row.insecticide_id, `${path}.insecticide_id`, issues);
		const firstLine = lineByInsecticide.get(insecticideId);
		if (insecticideId !== '' && firstLine !== undefined) {
			issues.push({
				path: `${path}.insecticide_id`,
				message: `This insecticide is already on line ${firstLine + 1}. A treatment holds one chemical application per insecticide, so put these batches on that line.`,
			});
		} else {
			lineByInsecticide.set(insecticideId, index);
		}
		return {
			id,
			insecticide_id: insecticideId,
			amount_applied: positiveFiniteNumber(row.amount_applied, `${path}.amount_applied`, issues),
			application_unit_id: requiredUuid(
				row.application_unit_id,
				`${path}.application_unit_id`,
				issues,
			),
			application_batches: normalizeTreatmentApplicationBatches(
				row.application_batches ?? [],
				`${path}.application_batches`,
				batchLinkIds,
				issues,
			),
		};
	});
}

function normalizeTreatmentApplicationBatches(
	values: readonly TreatmentApplicationBatchRow[],
	path: string,
	batchLinkIds: Set<string>,
	issues: DomainValidationIssue[],
): readonly TreatmentApplicationBatchRow[] {
	if (!Array.isArray(values)) {
		issues.push({ path, message: `${path} must be an array.` });
		return [];
	}
	const insecticideBatchIds = new Set<string>();
	return values.map((value: TreatmentApplicationBatchRow | null | undefined, index) => {
		const row: Partial<TreatmentApplicationBatchRow> = value ?? {};
		const id = requiredUuid(row.id, `${path}.${index}.id`, issues);
		const insecticideBatchId = requiredUuid(
			row.insecticide_batch_id,
			`${path}.${index}.insecticide_batch_id`,
			issues,
		);
		// Batch link ids are row ids, so they are unique across the whole payload.
		if (id !== '' && batchLinkIds.has(id)) {
			issues.push({ path: `${path}.${index}.id`, message: 'Batch link ids must be unique.' });
		}
		if (insecticideBatchId !== '' && insecticideBatchIds.has(insecticideBatchId)) {
			issues.push({
				path: `${path}.${index}.insecticide_batch_id`,
				message: 'A batch is linked to a chemical application once.',
			});
		}
		batchLinkIds.add(id);
		insecticideBatchIds.add(insecticideBatchId);
		return { id, insecticide_batch_id: insecticideBatchId };
	});
}

export function normalizeSourceReductionFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly sourceReductionDate: LocalDateString | undefined;
		readonly sourcesEliminatedAmount: number | undefined;
		readonly sourcesEliminatedUnitId: DomainId;
		readonly sourceReductionMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
	},
	issues: DomainValidationIssue[],
): NormalizedSourceReductionFields {
	requiredUuid(input.sourcesEliminatedUnitId, 'sourcesEliminatedUnitId', issues);
	validateLocalDate(input.sourceReductionDate, 'sourceReductionDate', issues);
	return {
		sourceReductionDate: input.sourceReductionDate ?? '',
		sourcesEliminatedAmount: positiveFiniteNumber(
			input.sourcesEliminatedAmount,
			'sourcesEliminatedAmount',
			issues,
		),
		sourcesEliminatedUnitId: requiredId(input.sourcesEliminatedUnitId),
		sourceReductionMethodId: optionalUuid(
			input.sourceReductionMethodId,
			'sourceReductionMethodId',
			issues,
		),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
	};
}

export function normalizeMissionSourceReductionFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly sourceReductionDate: LocalDateString | undefined;
		readonly sourcesEliminatedAmount: number | undefined;
		readonly sourcesEliminatedUnitId: DomainId;
		readonly sourceReductionMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
	},
	issues: DomainValidationIssue[],
): NormalizedSourceReductionFields {
	requiredUuid(input.sourcesEliminatedUnitId, 'sourcesEliminatedUnitId', issues);
	validateLocalDate(input.sourceReductionDate, 'sourceReductionDate', issues);
	return {
		sourceReductionDate: input.sourceReductionDate ?? '',
		sourcesEliminatedAmount: positiveFiniteNumber(
			input.sourcesEliminatedAmount,
			'sourcesEliminatedAmount',
			issues,
		),
		sourcesEliminatedUnitId: requiredId(input.sourcesEliminatedUnitId),
		sourceReductionMethodId: optionalUuid(
			input.sourceReductionMethodId,
			'sourceReductionMethodId',
			issues,
		),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
	};
}

export function normalizeOutreachFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly outreachDate: LocalDateString | undefined;
		readonly reach: number | undefined;
		readonly outreachMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
		readonly reachDescription?: string | null;
	},
	issues: DomainValidationIssue[],
): NormalizedOutreachFields {
	validateLocalDate(input.outreachDate, 'outreachDate', issues);
	return {
		outreachDate: input.outreachDate ?? '',
		reach: positiveInteger(input.reach, 'reach', issues),
		outreachMethodId: optionalUuid(input.outreachMethodId, 'outreachMethodId', issues),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
		reachDescription: nullableText(input.reachDescription, 'reachDescription', issues, 2_000),
	};
}

export function normalizeMissionOutreachFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly outreachDate: LocalDateString | undefined;
		readonly reach: number | undefined;
		readonly outreachMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
		readonly reachDescription?: string | null;
	},
	issues: DomainValidationIssue[],
): NormalizedOutreachFields {
	validateLocalDate(input.outreachDate, 'outreachDate', issues);
	return {
		outreachDate: input.outreachDate ?? '',
		reach: positiveInteger(input.reach, 'reach', issues),
		outreachMethodId: optionalUuid(input.outreachMethodId, 'outreachMethodId', issues),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
		reachDescription: nullableText(input.reachDescription, 'reachDescription', issues, 2_000),
	};
}

export function normalizeBiocontrolFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly biocontrolDate: LocalDateString | undefined;
		readonly amountReleased: number | undefined;
		readonly releaseUnitId: DomainId;
		readonly biocontrolMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
	},
	issues: DomainValidationIssue[],
): NormalizedBiocontrolFields {
	requiredUuid(input.releaseUnitId, 'releaseUnitId', issues);
	validateLocalDate(input.biocontrolDate, 'biocontrolDate', issues);
	return {
		biocontrolDate: input.biocontrolDate ?? '',
		amountReleased: positiveFiniteNumber(input.amountReleased, 'amountReleased', issues),
		releaseUnitId: requiredId(input.releaseUnitId),
		biocontrolMethodId: optionalUuid(input.biocontrolMethodId, 'biocontrolMethodId', issues),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
	};
}

export function normalizeMissionBiocontrolFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly biocontrolDate: LocalDateString | undefined;
		readonly amountReleased: number | undefined;
		readonly releaseUnitId: DomainId;
		readonly biocontrolMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
	},
	issues: DomainValidationIssue[],
): NormalizedBiocontrolFields {
	requiredUuid(input.releaseUnitId, 'releaseUnitId', issues);
	validateLocalDate(input.biocontrolDate, 'biocontrolDate', issues);
	return {
		biocontrolDate: input.biocontrolDate ?? '',
		amountReleased: positiveFiniteNumber(input.amountReleased, 'amountReleased', issues),
		releaseUnitId: requiredId(input.releaseUnitId),
		biocontrolMethodId: optionalUuid(input.biocontrolMethodId, 'biocontrolMethodId', issues),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
	};
}

export function validateControlActionContext(
	context: ControlActionContext,
	allowedFor: PerformedControlActionKind | 'requestedAction' | ControlType,
	issues: DomainValidationIssue[],
): ControlActionContext {
	if (context?.kind === 'none') {
		return { kind: 'none' };
	}
	if (context?.kind === 'adult') {
		requiredUuid(context.collectionId, 'context.collectionId', issues);
		if (!['chemicalApplication', 'requestedAction', 'application'].includes(allowedFor)) {
			issues.push({
				path: 'context.kind',
				message: 'Adult collection context is not allowed here.',
			});
		}
		return { kind: 'adult', collectionId: requiredId(context.collectionId) };
	}
	if (context?.kind === 'larval') {
		const hasHabitat = context.habitatId !== undefined && optionalId(context.habitatId) !== null;
		const hasInspection =
			context.inspectionId !== undefined && optionalId(context.inspectionId) !== null;
		if (!hasHabitat && !hasInspection) {
			issues.push({
				path: 'context',
				message: 'Larval context requires habitatId or inspectionId.',
			});
		}
		if (hasHabitat) {
			requiredUuid(context.habitatId, 'context.habitatId', issues);
		}
		if (hasInspection) {
			requiredUuid(context.inspectionId, 'context.inspectionId', issues);
		}
		if (allowedFor === 'outreach') {
			if (hasHabitat) {
				issues.push({
					path: 'context.habitatId',
					message: 'Outreach context cannot reference a habitat directly.',
				});
			}
			if (!hasInspection) {
				issues.push({
					path: 'context.inspectionId',
					message: 'Outreach larval context requires inspectionId.',
				});
			}
		}
		return {
			kind: 'larval',
			...(hasHabitat ? { habitatId: requiredId(context.habitatId) } : {}),
			...(hasInspection ? { inspectionId: requiredId(context.inspectionId) } : {}),
		};
	}
	issues.push({ path: 'context.kind', message: 'context.kind is not supported.' });
	return { kind: 'none' };
}

function positiveFiniteNumber(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive finite number.` });
		return 0;
	}
	return value;
}

function positiveInteger(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive integer.` });
		return 0;
	}
	return value;
}
