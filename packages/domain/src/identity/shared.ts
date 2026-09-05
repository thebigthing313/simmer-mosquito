import {
	createIssues,
	requiredUuid,
	validateOrganizationCommandContext,
} from '../command-validation.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';

/**
 * The identity commands an organization can send.
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

export interface OrganizationIdentityCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface OrganizationIdentityCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export function organizationPayload(
	input: OrganizationIdentityCommandInput,
): OrganizationIdentityCommandPayload {
	return { organizationId: input.organizationId, actorProfileId: input.actorProfileId };
}

export function validateOrganizationBase(
	input: OrganizationIdentityCommandInput,
	issues: DomainValidationIssue[],
): void {
	validateOrganizationCommandContext(input, issues);
}

export function validateOrganizationIdCommand<T extends OrganizationIdentityCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateOrganizationBase(input, issues);
	requiredUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}
