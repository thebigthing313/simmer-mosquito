/**
 * Which organization the session is in.
 *
 * The `organizations` shape is scoped to the signed-in membership's
 * organization, so this collection holds exactly one row and this is really
 * "read that row". It is still written as a query rather than an index into the
 * collection because the row arrives over sync like any other, and a query is
 * what re-renders when it does.
 *
 * Suspense, because the id is a precondition rather than a detail: an
 * org-scoped query handed an empty id is not a slower query, it is a query for
 * nothing. Every caller is already below the shell's boundary, which does not
 * draw until the organization is known — so this suspends where the shell
 * already did and nothing new blanks.
 */

import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { organizations } from '../../lib/collections/organizations';
import type { OrganizationIdentity } from './organization-view';

export function useOrganizationIdentity(): OrganizationIdentity | undefined {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ organization: organizations() })
				.select(({ organization }) => ({ id: organization.id, name: organization.name })),
		[],
	);

	return result.data[0];
}
