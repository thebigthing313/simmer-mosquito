import { createIssues, requiredUuid, validateAgencyCommandContext } from '../command-validation.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';

/**
 * The identity commands an agency can send.
 *
 * Every identity write ADR 0013 folds in, which is all of them. The one surface
 * left outside is `people.listMemberships`: it is a read behind a POST, and
 * reads have never been commands.
 *
 * The first three touch Postgres and nothing else. The last four span WorkOS
 * and ship under the six rules in `docs/domain-command-contract.md` ->
 * "Commands that span two systems" — see `memberships.ts` for what those rules
 * cost each of them.
 */
export type IdentityCommandType =
	| 'identity.updateOrganizationDetails'
	| 'identity.createProfile'
	| 'identity.updateProfile'
	| 'identity.invite'
	| 'identity.reinvite'
	| 'identity.changeRole'
	| 'identity.endMembership';

export interface IdentityDomainCommand<TType extends IdentityCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

export interface AgencyIdentityCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface AgencyIdentityCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export function agencyPayload(input: AgencyIdentityCommandInput): AgencyIdentityCommandPayload {
	return { organizationId: input.organizationId, actorProfileId: input.actorProfileId };
}

export function validateAgencyBase(
	input: AgencyIdentityCommandInput,
	issues: DomainValidationIssue[],
): void {
	validateAgencyCommandContext(input, issues);
}

export function validateAgencyIdCommand<T extends AgencyIdentityCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requiredUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}
