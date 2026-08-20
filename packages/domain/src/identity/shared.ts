import { createIssues, requiredUuid, validateAgencyCommandContext } from '../command-validation.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';

/**
 * The identity commands an agency can send.
 *
 * Three of the seven identity writes ADR 0013 folds in. The other four are
 * `people.listMemberships`, which is a read behind a POST and never becomes a
 * command, and the three that span WorkOS — inviting somebody, changing a role,
 * ending a membership. Those wait for the spanning rules in
 * `docs/domain-command-contract.md` and for the invitation-id decision in #186.
 *
 * These three touch Postgres and nothing else, so they need no part of that
 * contract: a profile create already mints its own UUID, and the two updates are
 * ordinary single-row writes.
 */
export type IdentityCommandType =
	| 'identity.updateOrganizationDetails'
	| 'identity.createProfile'
	| 'identity.updateProfile';

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
