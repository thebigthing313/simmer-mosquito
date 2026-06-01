import {
	createIssues,
	nullableText as normalizeNullableText,
	optionalUuid as normalizeOptionalUuid,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	type AgencyFoundationCommandInput,
	type AgencyFoundationCommandPayload,
	agencyPayload,
	type FoundationDomainCommand,
	normalizeRequiredDomainId,
	type OperatorFoundationCommandInput,
	type OperatorFoundationCommandPayload,
	operatorPayload,
	validateAgencyBase,
	validateAgencyIdCommand,
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

export interface UpdateGenusCommandInput extends OperatorFoundationCommandInput {
	readonly genusId: DomainId;
	readonly abbreviation?: string;
	readonly name?: string;
	readonly acknowledgedTaxonomyLabelChange?: boolean;
}

export type UpdateGenusCommand = FoundationDomainCommand<
	'foundation.updateGenus',
	OperatorFoundationCommandPayload & {
		readonly genusId: DomainId;
		readonly changes: Readonly<{
			readonly abbreviation?: string;
			readonly name?: string;
		}>;
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

export interface UpdateSpeciesCommandInput extends OperatorFoundationCommandInput {
	readonly speciesId: DomainId;
	readonly genusId?: DomainId | null;
	readonly epithet?: string;
	readonly commonName?: string | null;
	readonly displayName?: string;
	readonly acknowledgedTaxonomyMeaningChange?: boolean;
}

export type UpdateSpeciesCommand = FoundationDomainCommand<
	'foundation.updateSpecies',
	OperatorFoundationCommandPayload & {
		readonly speciesId: DomainId;
		readonly changes: Readonly<{
			readonly genusId?: DomainId | null;
			readonly epithet?: string;
			readonly commonName?: string | null;
			readonly displayName?: string;
		}>;
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

export interface SelectOrganizationSpeciesCommandInput extends AgencyFoundationCommandInput {
	readonly organizationSpeciesId: DomainId;
	readonly speciesId: DomainId;
}

export type SelectOrganizationSpeciesCommand = FoundationDomainCommand<
	'foundation.selectOrganizationSpecies',
	AgencyFoundationCommandPayload & {
		readonly organizationSpeciesId: DomainId;
		readonly speciesId: DomainId;
	}
>;

export interface UnselectOrganizationSpeciesCommandInput extends AgencyFoundationCommandInput {
	readonly organizationSpeciesId: DomainId;
}

export type UnselectOrganizationSpeciesCommand = FoundationDomainCommand<
	'foundation.unselectOrganizationSpecies',
	AgencyFoundationCommandPayload & { readonly organizationSpeciesId: DomainId }
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
	const hasAbbreviation = input.abbreviation !== undefined;
	const hasName = input.name !== undefined;
	if (!hasAbbreviation && !hasName) {
		issues.push({ path: 'changes', message: 'At least one genus field must change.' });
	}
	const abbreviation = hasAbbreviation
		? normalizeRequiredText(input.abbreviation, 'abbreviation', issues, 20)
		: undefined;
	const name = hasName ? normalizeRequiredText(input.name, 'name', issues, 200) : undefined;
	throwIfIssues('Update genus command is invalid.', issues);
	return {
		type: 'foundation.updateGenus',
		payload: {
			...operatorPayload(input),
			genusId: normalizeRequiredDomainId(input.genusId),
			changes: {
				...(abbreviation !== undefined ? { abbreviation } : {}),
				...(name !== undefined ? { name } : {}),
			},
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
	const hasGenus = input.genusId !== undefined;
	const hasEpithet = input.epithet !== undefined;
	const hasCommon = input.commonName !== undefined;
	const hasDisplay = input.displayName !== undefined;
	if (!hasGenus && !hasEpithet && !hasCommon && !hasDisplay) {
		issues.push({ path: 'changes', message: 'At least one species field must change.' });
	}
	const genusId = hasGenus ? normalizeOptionalUuid(input.genusId, 'genusId', issues) : undefined;
	const epithet = hasEpithet
		? normalizeRequiredText(input.epithet, 'epithet', issues, 200)
		: undefined;
	const commonName = hasCommon
		? normalizeNullableText(input.commonName, 'commonName', issues, 200)
		: undefined;
	const displayName = hasDisplay
		? normalizeRequiredText(input.displayName, 'displayName', issues, 200)
		: undefined;
	throwIfIssues('Update species command is invalid.', issues);
	return {
		type: 'foundation.updateSpecies',
		payload: {
			...operatorPayload(input),
			speciesId: normalizeRequiredDomainId(input.speciesId),
			changes: {
				...(hasGenus ? { genusId: genusId ?? null } : {}),
				...(epithet !== undefined ? { epithet } : {}),
				...(hasCommon ? { commonName: commonName ?? null } : {}),
				...(displayName !== undefined ? { displayName } : {}),
			},
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
	validateAgencyBase(input, issues);
	requireUuid(input.organizationSpeciesId, 'organizationSpeciesId', issues);
	requireUuid(input.speciesId, 'speciesId', issues);
	throwIfIssues('Select organization species command is invalid.', issues);
	return {
		type: 'foundation.selectOrganizationSpecies',
		payload: {
			...agencyPayload(input),
			organizationSpeciesId: normalizeRequiredDomainId(input.organizationSpeciesId),
			speciesId: normalizeRequiredDomainId(input.speciesId),
		},
	};
}

export function unselectOrganizationSpeciesCommand(
	input: UnselectOrganizationSpeciesCommandInput,
): UnselectOrganizationSpeciesCommand {
	const issues = validateAgencyIdCommand(input, 'organizationSpeciesId');
	throwIfIssues('Unselect organization species command is invalid.', issues);
	return {
		type: 'foundation.unselectOrganizationSpecies',
		payload: {
			...agencyPayload(input),
			organizationSpeciesId: normalizeRequiredDomainId(input.organizationSpeciesId),
		},
	};
}
