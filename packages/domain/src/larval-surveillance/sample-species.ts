import {
	actorDefaultProfileId as normalizeActorDefaultProfileId,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId, LocalDateString } from '../shared.js';
import {
	basePayload,
	type LarvalCommandInput,
	type LarvalCommandPayload,
	type LarvalDomainCommand,
	validateLocalDate,
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

export interface UpdateSampleSpeciesCountCommandInput extends LarvalCommandInput {
	readonly sampleSpeciesId: DomainId;
	readonly speciesId?: DomainId;
	readonly larvaeCount?: number;
	readonly identifiedByProfileId?: DomainId | null;
	readonly identifiedAt?: LocalDateString;
}

export type UpdateSampleSpeciesCountCommand = LarvalDomainCommand<
	'larvalSurveillance.updateSampleSpeciesCount',
	LarvalCommandPayload & {
		readonly sampleSpeciesId: DomainId;
		readonly changes: Readonly<{
			readonly speciesId?: DomainId;
			readonly larvaeCount?: number;
			readonly identifiedByProfileId?: DomainId;
			readonly identifiedAt?: LocalDateString;
		}>;
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
	validateLocalDate(input.identifiedAt, 'identifiedAt', issues);
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
	const hasSpecies = input.speciesId !== undefined;
	const hasLarvaeCount = input.larvaeCount !== undefined;
	const hasIdentifiedBy = input.identifiedByProfileId !== undefined;
	const hasIdentifiedAt = input.identifiedAt !== undefined;
	if (!hasSpecies && !hasLarvaeCount && !hasIdentifiedBy && !hasIdentifiedAt) {
		issues.push({ path: 'changes', message: 'At least one sample species field must change.' });
	}
	if (hasSpecies) {
		requireUuid(input.speciesId, 'speciesId', issues);
	}
	if (hasLarvaeCount) {
		validatePositiveInteger(input.larvaeCount, 'larvaeCount', issues);
	}
	if (hasIdentifiedAt) {
		validateLocalDate(input.identifiedAt, 'identifiedAt', issues);
	}
	if (hasIdentifiedBy) {
		normalizeOptionalUuid(input.identifiedByProfileId, 'identifiedByProfileId', issues);
	}
	throwIfIssues('Update sample species count command is invalid.', issues);

	return {
		type: 'larvalSurveillance.updateSampleSpeciesCount',
		payload: {
			...basePayload(input),
			sampleSpeciesId: normalizeRequiredId(input.sampleSpeciesId),
			changes: {
				...(hasSpecies ? { speciesId: normalizeRequiredId(input.speciesId) } : {}),
				...(hasLarvaeCount ? { larvaeCount: input.larvaeCount } : {}),
				...(hasIdentifiedBy
					? {
							identifiedByProfileId: normalizeActorDefaultProfileId(
								input.identifiedByProfileId,
								input.actorProfileId,
							),
						}
					: {}),
				...(hasIdentifiedAt ? { identifiedAt: input.identifiedAt } : {}),
			},
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
