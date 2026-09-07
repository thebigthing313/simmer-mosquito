import {
	basePayload,
	actorDefaultProfileId as normalizeActorDefaultProfileId,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateNotFutureLocalDate,
} from '../command-validation.js';
import type { DomainId, LocalDateString } from '../shared.js';
import {
	actorDefaultProfileIdField,
	normalizeUpdateFields,
	notFutureLocalDateField,
	referenceIdField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
} from '../update-command-fields.js';
import {
	type LarvalCommandInput,
	type LarvalCommandPayload,
	type LarvalDomainCommand,
	larvaeCountField,
	validatePositiveInteger,
	validateSampleSpeciesBase,
} from './shared.js';

export interface AddSampleSpeciesCountCommandInput extends LarvalCommandInput {
	readonly sampleSpeciesId: DomainId;
	readonly sampleId: DomainId;
	readonly speciesId: DomainId;
	readonly larvaeCount: number;
	readonly identifiedByProfileId?: DomainId | null;
	readonly identifiedAt: LocalDateString;
}

export interface SampleSpeciesCountPayload extends LarvalCommandPayload {
	readonly sampleSpeciesId: DomainId;
	readonly sampleId: DomainId;
	readonly speciesId: DomainId;
	readonly larvaeCount: number;
	readonly identifiedByProfileId: DomainId;
	readonly identifiedAt: LocalDateString;
}

export type AddSampleSpeciesCountCommand = LarvalDomainCommand<
	'larvalSurveillance.addSampleSpeciesCount',
	SampleSpeciesCountPayload
>;

export const SAMPLE_SPECIES_COUNT_UPDATE_FIELDS = {
	speciesId: referenceIdField,
	larvaeCount: larvaeCountField,
	identifiedByProfileId: actorDefaultProfileIdField,
	identifiedAt: notFutureLocalDateField,
} satisfies UpdateFieldSet;

export type UpdateSampleSpeciesCountCommandInput = LarvalCommandInput &
	UpdateFieldsInput<typeof SAMPLE_SPECIES_COUNT_UPDATE_FIELDS> & {
		readonly sampleSpeciesId: DomainId;
	};

export type UpdateSampleSpeciesCountCommand = LarvalDomainCommand<
	'larvalSurveillance.updateSampleSpeciesCount',
	LarvalCommandPayload & {
		readonly sampleSpeciesId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof SAMPLE_SPECIES_COUNT_UPDATE_FIELDS>;
	}
>;

export interface DeleteSampleSpeciesCountCommandInput extends LarvalCommandInput {
	readonly sampleSpeciesId: DomainId;
}

export type DeleteSampleSpeciesCountCommand = LarvalDomainCommand<
	'larvalSurveillance.deleteSampleSpeciesCount',
	LarvalCommandPayload & { readonly sampleSpeciesId: DomainId }
>;

export function addSampleSpeciesCountCommand(
	input: AddSampleSpeciesCountCommandInput,
): AddSampleSpeciesCountCommand {
	const issues = validateSampleSpeciesBase(input);
	requireUuid(input.sampleId, 'sampleId', issues);
	requireUuid(input.speciesId, 'speciesId', issues);
	validatePositiveInteger(input.larvaeCount, 'larvaeCount', issues);
	validateNotFutureLocalDate(input.identifiedAt, 'identifiedAt', issues);
	normalizeOptionalUuid(input.identifiedByProfileId, 'identifiedByProfileId', issues);
	throwIfIssues('Add sample species count command is invalid.', issues);

	return {
		type: 'larvalSurveillance.addSampleSpeciesCount',
		payload: {
			...basePayload(input),
			sampleSpeciesId: normalizeRequiredId(input.sampleSpeciesId),
			sampleId: normalizeRequiredId(input.sampleId),
			speciesId: normalizeRequiredId(input.speciesId),
			larvaeCount: input.larvaeCount,
			identifiedByProfileId: normalizeActorDefaultProfileId(
				input.identifiedByProfileId,
				input.actorProfileId,
			),
			identifiedAt: input.identifiedAt,
		},
	};
}

export function updateSampleSpeciesCountCommand(
	input: UpdateSampleSpeciesCountCommandInput,
): UpdateSampleSpeciesCountCommand {
	const issues = validateSampleSpeciesBase(input);
	const changes = normalizeUpdateFields(
		input,
		SAMPLE_SPECIES_COUNT_UPDATE_FIELDS,
		'At least one sample species field must change.',
		issues,
	);
	throwIfIssues('Update sample species count command is invalid.', issues);

	return {
		type: 'larvalSurveillance.updateSampleSpeciesCount',
		payload: {
			...basePayload(input),
			sampleSpeciesId: normalizeRequiredId(input.sampleSpeciesId),
			changes,
		},
	};
}

export function deleteSampleSpeciesCountCommand(
	input: DeleteSampleSpeciesCountCommandInput,
): DeleteSampleSpeciesCountCommand {
	const issues = validateSampleSpeciesBase(input);
	throwIfIssues('Delete sample species count command is invalid.', issues);
	return {
		type: 'larvalSurveillance.deleteSampleSpeciesCount',
		payload: {
			...basePayload(input),
			sampleSpeciesId: normalizeRequiredId(input.sampleSpeciesId),
		},
	};
}
