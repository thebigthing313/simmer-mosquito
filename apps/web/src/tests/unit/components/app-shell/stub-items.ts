import type { WebShellDomain } from '../../../../components/app-shell/navigation';

/** A sidebar item, read off the domain type because the register does not export it. */
type WebShellNavItem = WebShellDomain['groups'][number]['items'][number];

/**
 * The sidebar's unbuilt destinations, read off the register rather than
 * counted in prose.
 *
 * Two suites walk domains to groups to items for the `stub: true` mark, the
 * navigation suite for their ids and the upcoming-page suite for their paths.
 * Each used to write the walk itself, and the docblock over
 * `shellSearchCandidates` and `docs/dashboard-spec.md` each carried a count of
 * what the walk finds, and by 2026-09-17 the two disagreed with each other and
 * with the register (#1097). The walk is here once, and the count is nowhere:
 * a suite maps what it needs off the items, and the register is the only
 * place that says how many there are.
 */
export function stubItems(domains: readonly WebShellDomain[]): readonly WebShellNavItem[] {
	return domains
		.flatMap((domain) => domain.groups)
		.flatMap((group) => group.items)
		.filter((item) => item.stub === true);
}
