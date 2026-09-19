import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../auth';
import {
	type DuplicateGroup,
	type DuplicateRecordType,
	duplicateCandidatesQueryKey,
} from './merge-candidate-view';

/**
 * The duplicate sets this organization's records of one type suggest, refetched
 * on focus.
 */
export function useDuplicateCandidates(recordType: DuplicateRecordType) {
	return useQuery({
		queryKey: duplicateCandidatesQueryKey(recordType),
		queryFn: async ({ signal }) => {
			const response = await sessionFetch(
				new URL(`/records/${recordType}/duplicates`, getServerUrl()),
				{ signal },
			);
			if (!response.ok) {
				throw new Error(`Could not look for duplicates (${response.status}).`);
			}
			const body = (await response.json()) as { readonly groups: readonly DuplicateGroup[] };
			return body.groups;
		},
		staleTime: 15_000,
		refetchOnWindowFocus: true,
	});
}
