import type { SpeciesSex, SpeciesStatus } from '../column-vocabularies.js';
import {
	basePayload,
	actorDefaultProfileId as normalizeActorDefaultProfileId,
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
	passThroughField,
	referenceIdField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
} from '../update-command-fields.js';
import {
	type AdultCommandInput,
	type AdultCommandPayload,
	type DomainCommand,
	speciesCountField,
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

export const COLLECTION_SPECIES_COUNT_UPDATE_FIELDS = {
	count: speciesCountField,
	speciesId: referenceIdField,
	sex: passThroughField<SpeciesSex | null>(),
	status: passThroughField<SpeciesStatus | null>(),
	identifiedByProfileId: actorDefaultProfileIdField,
	identifiedDate: notFutureLocalDateField,
} satisfies UpdateFieldSet;

export type UpdateCollectionSpeciesCountCommandInput = AdultCommandInput &
	UpdateFieldsInput<typeof COLLECTION_SPECIES_COUNT_UPDATE_FIELDS> & {
		readonly collectionSpeciesId: DomainId;
	};

export interface UpdateCollectionSpeciesCountCommandPayload extends AdultCommandPayload {
	readonly collectionSpeciesId: DomainId;
	readonly changes: UpdateFieldsChanges<typeof COLLECTION_SPECIES_COUNT_UPDATE_FIELDS>;
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
	const changes = normalizeUpdateFields(
		input,
		COLLECTION_SPECIES_COUNT_UPDATE_FIELDS,
		'At least one species count field must change.',
		issues,
	);
	throwIfIssues('Update collection species count command is invalid.', issues);

	return {
		type: 'adultSurveillance.updateCollectionSpeciesCount',
		payload: {
			...basePayload(input),
			collectionSpeciesId: normalizeRequiredId(input.collectionSpeciesId),
			changes,
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
