import type { LinkProps } from '@tanstack/react-router';
import type {
	ShellCrumb,
	ShellDomain,
	ShellNavGroup,
	ShellNavItem,
	ShellStandalonePage,
} from './types';

/**
 * Turning a path into "where am I" — the active domain, the active item, and the
 * breadcrumb trail.
 *
 * These were app-local while only `apps/web` had a shell. Nothing in them was
 * ever web-specific; they only *looked* it because they closed over that app's
 * domain list at module scope. Taking the navigation as an argument is the whole
 * change, and it is what lets `apps/admin` mount the same chrome.
 */

/** Longest-prefix active match, so nested record paths still light their item. */
export function pathMatches(activePath: string, target: string): boolean {
	if (target === '/') {
		return activePath === '/';
	}

	return activePath === target || activePath.startsWith(`${target}/`);
}

/** Flat list of every item across all domains, paired with its owning domain + group. */
export function flattenNavItems(domains: readonly ShellDomain[]): readonly {
	readonly domain: ShellDomain;
	readonly group: ShellNavGroup;
	readonly item: ShellNavItem;
}[] {
	return domains.flatMap((domain) =>
		domain.groups.flatMap((group) => group.items.map((item) => ({ domain, group, item }))),
	);
}

/** Resolve the active domain + group + item for a path, falling back to the first domain. */
export function resolveActive(
	domains: readonly ShellDomain[],
	activePath: string,
): {
	readonly domain: ShellDomain;
	readonly group: ShellNavGroup | null;
	readonly item: ShellNavItem | null;
} {
	let best: {
		readonly domain: ShellDomain;
		readonly group: ShellNavGroup;
		readonly item: ShellNavItem;
	} | null = null;
	let bestLength = -1;

	for (const candidate of flattenNavItems(domains)) {
		const target = candidate.item.to;
		if (target !== undefined && pathMatches(activePath, target) && target.length > bestLength) {
			best = candidate;
			bestLength = target.length;
		}
	}

	if (best !== null) {
		return best;
	}

	const [first] = domains;
	if (first === undefined) {
		throw new Error('Shell domains must not be empty.');
	}

	return { domain: first, group: null, item: null };
}

/** The first navigable destination of a domain (used when its icon is clicked). */
export function firstDestination(domain: ShellDomain): LinkProps['to'] | null {
	for (const group of domain.groups) {
		const [item] = group.items;
		if (item?.to !== undefined) {
			return item.to;
		}
	}

	return null;
}

function titleCase(segment: string): string {
	return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function looksLikeRecordId(segment: string): boolean {
	return /\d/.test(segment) || /^[0-9a-f]{8,}$/i.test(segment);
}

/**
 * Breadcrumb trail for a path: the active domain, the active item, and any
 * meaningful trailing segments. A trailing segment uses its registered label
 * when one is supplied (e.g. a record's name), otherwise a record id renders as
 * `#id` and any other segment is title-cased.
 */
export function buildBreadcrumbs(
	domains: readonly ShellDomain[],
	activePath: string,
	options?: {
		readonly standalonePages?: readonly ShellStandalonePage[];
		readonly labels?: ReadonlyMap<string, string>;
	},
): readonly ShellCrumb[] {
	const standalone = options?.standalonePages?.find((page) => pathMatches(activePath, page.path));
	if (standalone !== undefined) {
		return standalone.crumbs;
	}

	const { domain, group, item } = resolveActive(domains, activePath);
	const crumbs: ShellCrumb[] = [{ label: domain.label }];

	if (item === null) {
		return crumbs;
	}

	if (group?.label !== undefined) {
		crumbs.push({ label: group.label });
	}

	crumbs.push({ label: item.label, to: item.to });

	const itemSegments = item.to?.split('/').filter(Boolean) ?? [];
	const pathSegments = activePath.split('/').filter(Boolean);
	const trailing = pathSegments.slice(itemSegments.length);
	for (const segment of trailing) {
		const override = options?.labels?.get(segment);
		if (override !== undefined && override !== '') {
			crumbs.push({ label: override });
			continue;
		}
		crumbs.push({ label: looksLikeRecordId(segment) ? `#${segment}` : titleCase(segment) });
	}

	return crumbs;
}
