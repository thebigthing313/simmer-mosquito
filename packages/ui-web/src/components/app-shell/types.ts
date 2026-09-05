import type { RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { LinkProps } from '@tanstack/react-router';

/**
 * Shell domain/navigation model.
 *
 * The shell is deliberately decoupled from the router and from any specific data
 * source: it is driven entirely by this model plus the values supplied through
 * {@link ShellContextValue}. Whoever mounts the shell (a router route, a preview
 * harness, a test) decides how navigation and data are wired.
 *
 * It is also decoupled from any one app's authorization model. Nothing the
 * chrome renders reads a role: `apps/web` filters its navigation by role
 * (`shellDomainsForRole`) before handing it over, and `apps/admin`, gated
 * wholesale by the operator allowlist, has nothing to filter. An app that needs
 * per-item role data adds its own field to an item type extending
 * {@link ShellNavItem} — the extra property rides along untouched, because the
 * chrome reads these shapes and never constructs them.
 */

/**
 * Values for the `$segments` of a route template, for a destination built at
 * render time from a record.
 *
 * Route and record are declared apart so `to` stays typed against the route
 * tree. A row per Profile still names `/daily-work/$profileId`, so renaming that
 * route fails the typecheck instead of leaving a sidebar row that navigates
 * nowhere.
 */
export type ShellNavParams = Readonly<Record<string, string>>;

/** A single navigable destination inside a domain's secondary sidebar. */
export interface ShellNavItem {
	readonly id: string;
	readonly label: string;
	/** Type-safe router destination. Compared against the active path for selection. */
	readonly to: LinkProps['to'];
	/** Fills the `$segments` of {@link ShellNavItem.to}. See {@link ShellNavParams}. */
	readonly params?: ShellNavParams;
	readonly icon?: RegistryIcon;
	/** Optional compact count/indicator (e.g. items needing attention). */
	readonly badge?: string | number;
	/**
	 * The destination is wired but not built. Marked in the sidebar so an operator
	 * learns which sections are placeholders from the navigation rather than by
	 * arriving on one.
	 */
	readonly stub?: boolean;
}

/** A labelled (or unlabelled) cluster of items within a domain. */
export interface ShellNavGroup {
	readonly id: string;
	readonly label?: string;
	readonly items: readonly ShellNavItem[];
}

/**
 * A top-level operational domain. Each domain is one icon in the primary rail;
 * selecting it reveals its groups in the secondary sidebar.
 */
export interface ShellDomain {
	readonly id: string;
	readonly label: string;
	/** One-line description surfaced in the secondary sidebar header. */
	readonly summary?: string;
	readonly icon: RegistryIcon;
	readonly groups: readonly ShellNavGroup[];
}

/** An agency the signed-in person can operate within. */
export interface ShellOrganization {
	readonly id: string;
	readonly name: string;
	readonly slug?: string;
	/** Short status/plan line shown under the name in the switcher. */
	readonly detail?: string;
}

/** The signed-in person, as the shell needs to present them. */
export interface ShellUser {
	readonly name: string;
	readonly email: string;
	readonly role?: string;
	readonly avatarUrl?: string;
}

/** A resolved breadcrumb crumb. The last crumb is the current location. */
export interface ShellCrumb {
	readonly label: string;
	readonly to?: LinkProps['to'];
	/** Fills the `$segments` of {@link ShellCrumb.to}. See {@link ShellNavParams}. */
	readonly params?: ShellNavParams;
}

/**
 * A destination reached from the account menu rather than the domain rail. It
 * belongs to no domain, so it carries its own breadcrumb trail instead of
 * falling back to whichever domain happens to sort first.
 */
export interface ShellStandalonePage {
	readonly path: string;
	readonly crumbs: readonly ShellCrumb[];
}

/** An entry in the account dropdown at the foot of the primary rail. */
export interface ShellAccountLink {
	readonly label: string;
	readonly to: string;
	readonly icon?: RegistryIcon;
}
