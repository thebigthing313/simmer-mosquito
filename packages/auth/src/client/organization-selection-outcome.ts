import type { AuthJsonBody } from './create-auth-json-post.js';
import type { AuthOrganizationChoice, OrganizationSelectionRequiredOutcome } from './outcomes.js';

export function organizationSelectionOutcome(
	data: AuthJsonBody,
): OrganizationSelectionRequiredOutcome {
	const organizations = Array.isArray(data.organizations)
		? data.organizations.flatMap((entry): AuthOrganizationChoice[] =>
				typeof entry === 'object' &&
				entry !== null &&
				typeof (entry as { id?: unknown }).id === 'string'
					? [
							{
								id: (entry as { id: string }).id,
								name:
									typeof (entry as { name?: unknown }).name === 'string'
										? (entry as { name: string }).name
										: (entry as { id: string }).id,
							},
						]
					: [],
			)
		: [];

	return {
		status: 'organization_selection_required',
		pendingAuthenticationToken:
			typeof data.pendingAuthenticationToken === 'string' ? data.pendingAuthenticationToken : '',
		organizations,
	};
}
