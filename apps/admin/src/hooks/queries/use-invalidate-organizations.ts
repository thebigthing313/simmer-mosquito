import { useQueryClient } from '@tanstack/react-query';
import { organizationKeys } from './organization-keys';

/** Invalidates everything organization-shaped. Used after a create or an invitation. */
export function useInvalidateOrganizations(): () => Promise<void> {
	const queryClient = useQueryClient();
	return async () => {
		await queryClient.invalidateQueries({ queryKey: organizationKeys.all });
	};
}
