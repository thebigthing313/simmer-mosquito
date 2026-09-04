import type { SpeciesSex, SpeciesStatus } from '../column-vocabularies.js';
import {
	actorDefaultProfileId as normalizeActorDefaultProfileId,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateNotFutureLocalDate,
} from '../command-validation.js';
import type { DomainId, LocalDateString } from '../shared.js';
import {
	type AdultCommandInput,
	type AdultCommandPayload,
	basePayload,
	type DomainCommand,
	validateSpeciesCount,
	validateSpeciesCountBase,
} from './shared.js';

export interface AddCollectionSpeciesCountCommandInput extends AdultCommandInput {
	readonly collectionSpeciesId: DomainId;
	readonly collectionId: DomainId;
	readonly speciesId: DomainId;
	readonly count: number;
	readonly sex?: SpeciesSex | null;
	readonly status?: SpeciesStatus | null;
	readonly identifiedByProfileId?: DomainId | null;
	readonly identifiedDate: LocalDateString;
}

export interface CollectionSpeciesCountPayload extends AdultCommandPayload {
	readonly collectionSpeciesId: DomainId;
	readonly collectionId: DomainId;
	readonly speciesId: DomainId;
	readonly count: number;
	readonly sex: SpeciesSex | null;
	readonly status: SpeciesStatus | null;
	readonly identifiedByProfileId: DomainId;
	readonly identifiedDate: LocalDateString;
}

export type AddCollectionSpeciesCountCommand = DomainCommand<
	'adultSurveillance.addCollectionSpeciesCount',
	CollectionSpeciesCountPayload
>;

export interface UpdateCollectionSpeciesCountCommandInput extends AdultCommandInput {
	readonly collectionSpeciesId: DomainId;
	readonly count?: number;
	readonly speciesId?: DomainId;
	readonly sex?: SpeciesSex | null;
	readonly status?: SpeciesStatus | null;
	readonly identifiedByProfileId?: DomainId | null;
	readonly identifiedDate?: LocalDateString;
}

export interface UpdateCollectionSpeciesCountCommandPayload extends AdultCommandPayload {
	readonly collectionSpeciesId: DomainId;
	readonly changes: Readonly<{
		readonly count?: number;
		readonly speciesId?: DomainId;
		readonly sex?: SpeciesSex | null;
		readonly status?: SpeciesStatus | null;
		readonly identifiedByProfileId?: DomainId;
		readonly identifiedDate?: LocalDateString;
	}>;
}

export type UpdateCollectionSpeciesCountCommand = DomainCommand<
	'adultSurveillance.updateCollectionSpeciesCount',
	UpdateCollectionSpeciesCountCommandPayload
>;

export interface DeleteCollectionSpeciesCountCommandInput extends AdultCommandInput {
	readonly collectionSpeciesId: DomainId;
}

export type DeleteCollectionSpeciesCountCommand = DomainCommand<
	'adultSurveillance.deleteCollectionSpeciesCount',
	AdultCommandPayload & { readonly collectionSpeciesId: DomainId }
>;

export function addCollectionSpeciesCountCommand(
	input: AddCollectionSpeciesCountCommandInput,
): AddCollectionSpeciesCountCommand {
	const issues = validateSpeciesCountBase(input);
	requireUuid(input.collectionId, 'collectionId', issues);
	requireUuid(input.speciesId, 'speciesId', issues);
	validateSpeciesCount(input.count, 'count', issues);
	validateNotFutureLocalDate(input.identifiedDate, 'identifiedDate', issues);
	throwIfIssues('Add collection species count command is invalid.', issues);

	return {
		type: 'adultSurveillance.addCollectionSpeciesCount',
		payload: {
			...basePayload(input),
			collectionSpeciesId: normalizeRequiredId(input.collectionSpeciesId),
			collectionId: normalizeRequiredId(input.collectionId),
			speciesId: normalizeRequiredId(input.speciesId),
			count: input.count,
			sex: input.sex === undefined ? 'female' : input.sex,
			status: input.status ?? null,
			identifiedByProfileId: normalizeActorDefaultProfileId(
				input.identifiedByProfileId,
				input.actorProfileId,
			),
			identifiedDate: input.identifiedDate,
		},
	};
}

export function updateCollectionSpeciesCountCommand(
	input: UpdateCollectionSpeciesCountCommandInput,
): UpdateCollectionSpeciesCountCommand {
	const issues = validateSpeciesCountBase(input);
	const hasCount = input.count !== undefined;
	const hasSpecies = input.speciesId !== undefined;
	const hasSex = input.sex !== undefined;
	const hasStatus = input.status !== undefined;
	const hasIdentifiedBy = input.identifiedByProfileId !== undefined;
	const hasIdentifiedDate = input.identifiedDate !== undefined;
	if (!hasCount && !hasSpecies && !hasSex && !hasStatus && !hasIdentifiedBy && !hasIdentifiedDate) {
		issues.push({ path: 'changes', message: 'At least one species count field must change.' });
	}
	if (hasCount) {
		validateSpeciesCount(input.count, 'count', issues);
	}
	if (hasSpecies) {
		requireUuid(input.speciesId, 'speciesId', issues);
	}
	if (hasIdentifiedDate) {
		validateNotFutureLocalDate(input.identifiedDate, 'identifiedDate', issues);
	}
	throwIfIssues('Update collection species count command is invalid.', issues);

	return {
		type: 'adultSurveillance.updateCollectionSpeciesCount',
		payload: {
			...basePayload(input),
			collectionSpeciesId: normalizeRequiredId(input.collectionSpeciesId),
			changes: {
				...(hasCount ? { count: input.count } : {}),
				...(hasSpecies ? { speciesId: normalizeRequiredId(input.speciesId) } : {}),
				...(hasSex ? { sex: input.sex } : {}),
				...(hasStatus ? { status: input.status } : {}),
				...(hasIdentifiedBy
					? {
							identifiedByProfileId: normalizeActorDefaultProfileId(
								input.identifiedByProfileId,
								input.actorProfileId,
							),
						}
					: {}),
				...(hasIdentifiedDate ? { identifiedDate: input.identifiedDate } : {}),
			},
		},
	};
}

export function deleteCollectionSpeciesCountCommand(
	input: DeleteCollectionSpeciesCountCommandInput,
): DeleteCollectionSpeciesCountCommand {
	const issues = validateSpeciesCountBase(input);
	throwIfIssues('Delete collection species count command is invalid.', issues);
	return {
		type: 'adultSurveillance.deleteCollectionSpeciesCount',
		payload: {
			...basePayload(input),
			collectionSpeciesId: normalizeRequiredId(input.collectionSpeciesId),
		},
	};
}
