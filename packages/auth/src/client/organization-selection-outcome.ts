import type { OrganizationSelectionRequiredOutcome } from './outcomes.js';
import type { OrganizationSelectionRequiredBody } from './wire.js';

export function organizationSelectionOutcome(
	body: OrganizationSelectionRequiredBody,
): OrganizationSelectionRequiredOutcome {
	return {
		status: 'organization_selection_required',
		pendingAuthenticationToken: body.pendingAuthenticationToken,
		organizations: body.organizations,
	};
}
