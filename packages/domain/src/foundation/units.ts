/**
 * The global unit catalog, as commands.
 *
 * Units of measure are SIMMER's rather than an agency's — no `organization_id`,
 * and every agency records amounts against them — so these are operator
 * commands like the taxonomy's, typed on `OperatorFoundationCommandInput`.
 *
 * ## Why `code` carries an acknowledgement and the other fields do not
 *
 * `units` deliberately holds no conversion factor and no base-unit column; the
 * arithmetic lives in `organization-settings/unit-conversion.ts`, keyed by the
 * unit's **`code`**. That makes `code` a join key into a hand-maintained table
 * rather than a label, and renaming one does not fail: it unhooks the unit from
 * conversion, so a roll-up that used to total across units quietly stops being
 * available and callers fall back to reporting each unit separately.
 *
 * Nothing else on the row does that. `unit_name` and `abbreviation` are what a
 * reader sees, `unit_type` and `unit_system` are what a field filters on, and a
 * wrong value there is visible immediately. So the guard is on `code` alone, and
 * only when `code` is actually among the changes — an edit that leaves it be is
 * not asking for confirmation of anything.
 *
 * ## What is not validated here
 *
 * `code`, `unit_name` and `abbreviation` each carry a unique index. Uniqueness is
 * a context-dependent rule — it is a fact about the other rows, not about this
 * command — so it belongs to the server inside the write transaction, per
 * `docs/domain-command-contract.md`. These builders only settle what can be
 * decided from the input alone.
 */

import {
	UNIT_SYSTEMS,
	UNIT_TYPES,
	type UnitSystem,
	type UnitType,
} from '../column-vocabularies.js';
import {
	createIssues,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';
import {
	type FoundationDomainCommand,
	normalizeRequiredDomainId,
	type OperatorFoundationCommandInput,
	type OperatorFoundationCommandPayload,
	operatorPayload,
	validateOperatorBase,
	validateOperatorIdCommand,
} from './shared.js';

export { UNIT_SYSTEMS, UNIT_TYPES, type UnitSystem, type UnitType };

export interface CreateUnitCommandInput extends OperatorFoundationCommandInput {
	readonly unitId: DomainId;
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: string;
	readonly unitSystem: string;
}

export type CreateUnitCommand = FoundationDomainCommand<
	'foundation.createUnit',
	OperatorFoundationCommandPayload & {
		readonly unitId: DomainId;
		readonly code: string;
		readonly unitName: string;
		readonly abbreviation: string;
		readonly unitType: UnitType;
		readonly unitSystem: UnitSystem;
	}
>;

export interface UpdateUnitCommandInput extends OperatorFoundationCommandInput {
	readonly unitId: DomainId;
	readonly code?: string;
	readonly unitName?: string;
	readonly abbreviation?: string;
	readonly unitType?: string;
	readonly unitSystem?: string;
	readonly acknowledgedUnitCodeChange?: boolean;
}

export type UpdateUnitCommand = FoundationDomainCommand<
	'foundation.updateUnit',
	OperatorFoundationCommandPayload & {
		readonly unitId: DomainId;
		readonly changes: Readonly<{
			readonly code?: string;
			readonly unitName?: string;
			readonly abbreviation?: string;
			readonly unitType?: UnitType;
			readonly unitSystem?: UnitSystem;
		}>;
		readonly acknowledgedUnitCodeChange: boolean;
	}
>;

export interface UnitIdCommandInput extends OperatorFoundationCommandInput {
	readonly unitId: DomainId;
}

export type DeleteUnitCommand = FoundationDomainCommand<
	'foundation.deleteUnit',
	OperatorFoundationCommandPayload & { readonly unitId: DomainId }
>;

function normalizeUnitType(
	value: string | undefined,
	issues: DomainValidationIssue[],
): UnitType | undefined {
	if (value === undefined) {
		return undefined;
	}
	const normalized = value.trim().toLowerCase();
	if (!UNIT_TYPES.includes(normalized as UnitType)) {
		issues.push({ path: 'unitType', message: `unitType must be one of ${UNIT_TYPES.join(', ')}.` });
		return undefined;
	}

	return normalized as UnitType;
}

function normalizeUnitSystem(
	value: string | undefined,
	issues: DomainValidationIssue[],
): UnitSystem | undefined {
	if (value === undefined) {
		return undefined;
	}
	const normalized = value.trim().toLowerCase();
	if (!UNIT_SYSTEMS.includes(normalized as UnitSystem)) {
		issues.push({
			path: 'unitSystem',
			message: `unitSystem must be one of ${UNIT_SYSTEMS.join(', ')}.`,
		});
		return undefined;
	}

	return normalized as UnitSystem;
}

export function createUnitCommand(input: CreateUnitCommandInput): CreateUnitCommand {
	const issues = createIssues();
	validateOperatorBase(input, issues);
	requireUuid(input.unitId, 'unitId', issues);
	const code = normalizeRequiredText(input.code, 'code', issues, 40);
	const unitName = normalizeRequiredText(input.unitName, 'unitName', issues, 100);
	const abbreviation = normalizeRequiredText(input.abbreviation, 'abbreviation', issues, 20);
	const unitType = normalizeUnitType(input.unitType, issues);
	const unitSystem = normalizeUnitSystem(input.unitSystem, issues);
	if (input.unitType === undefined) {
		issues.push({ path: 'unitType', message: 'unitType is required.' });
	}
	if (input.unitSystem === undefined) {
		issues.push({ path: 'unitSystem', message: 'unitSystem is required.' });
	}
	throwIfIssues('Create unit command is invalid.', issues);

	return {
		type: 'foundation.createUnit',
		payload: {
			...operatorPayload(input),
			unitId: normalizeRequiredDomainId(input.unitId),
			code,
			unitName,
			abbreviation,
			// Present by construction: an absent or unrecognised value raised an issue
			// above, and `throwIfIssues` did not return.
			unitType: unitType as UnitType,
			unitSystem: unitSystem as UnitSystem,
		},
	};
}

export function updateUnitCommand(input: UpdateUnitCommandInput): UpdateUnitCommand {
	const issues = validateOperatorIdCommand(input, 'unitId');
	const hasCode = input.code !== undefined;
	const hasName = input.unitName !== undefined;
	const hasAbbreviation = input.abbreviation !== undefined;
	const hasType = input.unitType !== undefined;
	const hasSystem = input.unitSystem !== undefined;

	if (!hasCode && !hasName && !hasAbbreviation && !hasType && !hasSystem) {
		issues.push({ path: 'changes', message: 'At least one unit field must change.' });
	}

	const code = hasCode ? normalizeRequiredText(input.code, 'code', issues, 40) : undefined;
	const unitName = hasName
		? normalizeRequiredText(input.unitName, 'unitName', issues, 100)
		: undefined;
	const abbreviation = hasAbbreviation
		? normalizeRequiredText(input.abbreviation, 'abbreviation', issues, 20)
		: undefined;
	const unitType = normalizeUnitType(input.unitType, issues);
	const unitSystem = normalizeUnitSystem(input.unitSystem, issues);

	// Only when the code is what moved. `unit-conversion.ts` matches units by
	// code, so a rename unhooks this unit from every total that crosses units —
	// silently, because an unknown code makes a total unavailable rather than
	// wrong.
	if (hasCode && input.acknowledgedUnitCodeChange !== true) {
		issues.push({
			path: 'acknowledgedUnitCodeChange',
			message:
				'Changing a unit code detaches it from the conversion table, and requires acknowledgement.',
		});
	}

	throwIfIssues('Update unit command is invalid.', issues);

	return {
		type: 'foundation.updateUnit',
		payload: {
			...operatorPayload(input),
			unitId: normalizeRequiredDomainId(input.unitId),
			changes: {
				...(code !== undefined ? { code } : {}),
				...(unitName !== undefined ? { unitName } : {}),
				...(abbreviation !== undefined ? { abbreviation } : {}),
				...(unitType !== undefined ? { unitType } : {}),
				...(unitSystem !== undefined ? { unitSystem } : {}),
			},
			acknowledgedUnitCodeChange: input.acknowledgedUnitCodeChange ?? false,
		},
	};
}

export function deleteUnitCommand(input: UnitIdCommandInput): DeleteUnitCommand {
	const issues = validateOperatorIdCommand(input, 'unitId');
	throwIfIssues('Delete unit command is invalid.', issues);
	return {
		type: 'foundation.deleteUnit',
		payload: { ...operatorPayload(input), unitId: normalizeRequiredDomainId(input.unitId) },
	};
}
