import {
	createIssues,
	nullableText as normalizeNullableText,
	optionalUuid as normalizeOptionalUuid,
	normalizeRequiredDomainId,
	requiredText as normalizeRequiredText,
	organizationPayload,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateOrganizationBase,
	validateOrganizationIdCommand,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	normalizeUpdateFields,
	nullableReferenceIdField,
	nullableTextField,
	requiredTextField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
} from '../update-command-fields.js';
import {
	type FoundationDomainCommand,
	type OperatorFoundationCommandInput,
	type OperatorFoundationCommandPayload,
	type OrganizationFoundationCommandInput,
	type OrganizationFoundationCommandPayload,
	operatorPayload,
	validateOperatorBase,
	validateOperatorIdCommand,
} from './shared.js';

export interface CreateGenusCommandInput extends OperatorFoundationCommandInput {
	readonly genusId: DomainId;
	readonly abbreviation: string;
	readonly name: string;
}

export type CreateGenusCommand = FoundationDomainCommand<
	'foundation.createGenus',
	OperatorFoundationCommandPayload & {
		readonly genusId: DomainId;
		readonly abbreviation: string;
		readonly name: string;
	}
>;

export const GENUS_UPDATE_FIELDS = {
	abbreviation: requiredTextField(20),
	name: requiredTextField(200),
} satisfies UpdateFieldSet;

export type UpdateGenusCommandInput = OperatorFoundationCommandInput &
	UpdateFieldsInput<typeof GENUS_UPDATE_FIELDS> & {
		readonly genusId: DomainId;
		readonly acknowledgedTaxonomyLabelChange?: boolean;
	};

export type UpdateGenusCommand = FoundationDomainCommand<
	'foundation.updateGenus',
	OperatorFoundationCommandPayload & {
		readonly genusId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof GENUS_UPDATE_FIELDS>;
		readonly acknowledgedTaxonomyLabelChange: boolean;
	}
>;

export interface GenusIdCommandInput extends OperatorFoundationCommandInput {
	readonly genusId: DomainId;
}

export type DeleteGenusCommand = FoundationDomainCommand<
	'foundation.deleteGenus',
	OperatorFoundationCommandPayload & { readonly genusId: DomainId }
>;

export interface CreateSpeciesCommandInput extends OperatorFoundationCommandInput {
	readonly speciesId: DomainId;
	readonly genusId?: DomainId | null;
	readonly epithet: string;
	readonly commonName?: string | null;
	readonly displayName: string;
}

export type CreateSpeciesCommand = FoundationDomainCommand<
	'foundation.createSpecies',
	OperatorFoundationCommandPayload & {
		readonly speciesId: DomainId;
		readonly genusId: DomainId | null;
		readonly epithet: string;
		readonly commonName: string | null;
		readonly displayName: string;
	}
>;

export const SPECIES_UPDATE_FIELDS = {
	genusId: nullableReferenceIdField,
	epithet: requiredTextField(200),
	commonName: nullableTextField(200),
	displayName: requiredTextField(200),
} satisfies UpdateFieldSet;

export type UpdateSpeciesCommandInput = OperatorFoundationCommandInput &
	UpdateFieldsInput<typeof SPECIES_UPDATE_FIELDS> & {
		readonly speciesId: DomainId;
		readonly acknowledgedTaxonomyMeaningChange?: boolean;
	};

export type UpdateSpeciesCommand = FoundationDomainCommand<
	'foundation.updateSpecies',
	OperatorFoundationCommandPayload & {
		readonly speciesId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof SPECIES_UPDATE_FIELDS>;
		readonly acknowledgedTaxonomyMeaningChange: boolean;
	}
>;

export interface SpeciesIdCommandInput extends OperatorFoundationCommandInput {
	readonly speciesId: DomainId;
}

export type DeleteSpeciesCommand = FoundationDomainCommand<
	'foundation.deleteSpecies',
	OperatorFoundationCommandPayload & { readonly speciesId: DomainId }
>;

export interface SelectOrganizationSpeciesCommandInput extends OrganizationFoundationCommandInput {
	readonly organizationSpeciesId: DomainId;
	readonly speciesId: DomainId;
}

export type SelectOrganizationSpeciesCommand = FoundationDomainCommand<
	'foundation.selectOrganizationSpecies',
	OrganizationFoundationCommandPayload & {
		readonly organizationSpeciesId: DomainId;
		readonly speciesId: DomainId;
	}
>;

export interface UnselectOrganizationSpeciesCommandInput
	extends OrganizationFoundationCommandInput {
	readonly organizationSpeciesId: DomainId;
}

export type UnselectOrganizationSpeciesCommand = FoundationDomainCommand<
	'foundation.unselectOrganizationSpecies',
	OrganizationFoundationCommandPayload & { readonly organizationSpeciesId: DomainId }
>;

export function createGenusCommand(input: CreateGenusCommandInput): CreateGenusCommand {
	const issues = createIssues();
	validateOperatorBase(input, issues);
	requireUuid(input.genusId, 'genusId', issues);
	const abbreviation = normalizeRequiredText(input.abbreviation, 'abbreviation', issues, 20);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	throwIfIssues('Create genus command is invalid.', issues);
	return {
		type: 'foundation.createGenus',
		payload: {
			...operatorPayload(input),
			genusId: normalizeRequiredDomainId(input.genusId),
			abbreviation,
			name,
		},
	};
}

export function updateGenusCommand(input: UpdateGenusCommandInput): UpdateGenusCommand {
	const issues = validateOperatorIdCommand(input, 'genusId');
	const changes = normalizeUpdateFields(
		input,
		GENUS_UPDATE_FIELDS,
		'At least one genus field must change.',
		issues,
	);
	throwIfIssues('Update genus command is invalid.', issues);
	return {
		type: 'foundation.updateGenus',
		payload: {
			...operatorPayload(input),
			genusId: normalizeRequiredDomainId(input.genusId),
			changes,
			acknowledgedTaxonomyLabelChange: input.acknowledgedTaxonomyLabelChange ?? false,
		},
	};
}

export function deleteGenusCommand(input: GenusIdCommandInput): DeleteGenusCommand {
	const issues = validateOperatorIdCommand(input, 'genusId');
	throwIfIssues('Delete genus command is invalid.', issues);
	return {
		type: 'foundation.deleteGenus',
		payload: { ...operatorPayload(input), genusId: normalizeRequiredDomainId(input.genusId) },
	};
}

export function createSpeciesCommand(input: CreateSpeciesCommandInput): CreateSpeciesCommand {
	const issues = createIssues();
	validateOperatorBase(input, issues);
	requireUuid(input.speciesId, 'speciesId', issues);
	const genusId = normalizeOptionalUuid(input.genusId, 'genusId', issues);
	const epithet = normalizeRequiredText(input.epithet, 'epithet', issues, 200);
	const commonName = normalizeNullableText(input.commonName, 'commonName', issues, 200);
	const displayName = normalizeRequiredText(input.displayName, 'displayName', issues, 200);
	throwIfIssues('Create species command is invalid.', issues);
	return {
		type: 'foundation.createSpecies',
		payload: {
			...operatorPayload(input),
			speciesId: normalizeRequiredDomainId(input.speciesId),
			genusId,
			epithet,
			commonName,
			displayName,
		},
	};
}

export function updateSpeciesCommand(input: UpdateSpeciesCommandInput): UpdateSpeciesCommand {
	const issues = validateOperatorIdCommand(input, 'speciesId');
	const changes = normalizeUpdateFields(
		input,
		SPECIES_UPDATE_FIELDS,
		'At least one species field must change.',
		issues,
	);
	throwIfIssues('Update species command is invalid.', issues);
	return {
		type: 'foundation.updateSpecies',
		payload: {
			...operatorPayload(input),
			speciesId: normalizeRequiredDomainId(input.speciesId),
			changes,
			acknowledgedTaxonomyMeaningChange: input.acknowledgedTaxonomyMeaningChange ?? false,
		},
	};
}

export function deleteSpeciesCommand(input: SpeciesIdCommandInput): DeleteSpeciesCommand {
	const issues = validateOperatorIdCommand(input, 'speciesId');
	throwIfIssues('Delete species command is invalid.', issues);
	return {
		type: 'foundation.deleteSpecies',
		payload: { ...operatorPayload(input), speciesId: normalizeRequiredDomainId(input.speciesId) },
	};
}

export function selectOrganizationSpeciesCommand(
	input: SelectOrganizationSpeciesCommandInput,
): SelectOrganizationSpeciesCommand {
	const issues = createIssues();
	validateOrganizationBase(input, issues);
	requireUuid(input.organizationSpeciesId, 'organizationSpeciesId', issues);
	requireUuid(input.speciesId, 'speciesId', issues);
	throwIfIssues('Select organization species command is invalid.', issues);
	return {
		type: 'foundation.selectOrganizationSpecies',
		payload: {
			...organizationPayload(input),
			organizationSpeciesId: normalizeRequiredDomainId(input.organizationSpeciesId),
			speciesId: normalizeRequiredDomainId(input.speciesId),
		},
	};
}

export function unselectOrganizationSpeciesCommand(
	input: UnselectOrganizationSpeciesCommandInput,
): UnselectOrganizationSpeciesCommand {
	const issues = validateOrganizationIdCommand(input, 'organizationSpeciesId');
	throwIfIssues('Unselect organization species command is invalid.', issues);
	return {
		type: 'foundation.unselectOrganizationSpecies',
		payload: {
			...organizationPayload(input),
			organizationSpeciesId: normalizeRequiredDomainId(input.organizationSpeciesId),
		},
	};
}
