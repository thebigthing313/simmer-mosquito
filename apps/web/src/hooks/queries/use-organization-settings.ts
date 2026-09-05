/**
 * How the organization is configured.
 *
 * One place, because organization settings are a single jsonb blob and five
 * surfaces were each parsing it themselves — the timezone, the species key
 * bindings, the unit defaults, the larval density bands, the workspace pages. A
 * blob parsed five times is five chances to disagree about what an absent key
 * means.
 *
 * Always a settings object, never null or undefined.
 * `resolveOrganizationSettings` fills every default, so a surface asking about
 * the timezone before the row has arrived gets `DEFAULT_ORGANIZATION_TIMEZONE`
 * rather than nothing — deliberately, because the obvious alternative is the
 * browser's zone and that is the disagreement an organization timezone exists
 * to remove.
 *
 * ## Why the `useMemo` is not the smell it looks like
 *
 * `shared.ts` says a `useMemo` in a hook body means the transform should have
 * been a compiled `select`. This one cannot be: the settings blob is `unknown`
 * until a domain parser has read it, and `resolveOrganizationSettings` is that
 * parser — arbitrary JavaScript over a value the expression language has no way
 * to look inside. What the `select` still does is narrow the row to the one
 * column, so the organization changing its mailing address does not re-run the
 * parse.
 *
 * The memo is what keeps the returned object stable. Without it every render hands
 * back a fresh settings object, and `useSpeciesKeyBindings` — which memoizes on it
 * — would rebuild its bindings on every render of every surface that shows one.
 */

import { type OrganizationSettings, resolveOrganizationSettings } from '@simmer-mosquito/domain';
import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { organizations } from '../../lib/collections/organizations';

export function useOrganizationSettings(): OrganizationSettings {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ organization: organizations() })
				.select(({ organization }) => ({ settings: organization.settings })),
		[],
	);

	const stored = result.data[0]?.settings;
	return useMemo(() => resolveOrganizationSettings(stored).settings, [stored]);
}
