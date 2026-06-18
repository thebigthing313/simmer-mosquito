import type { RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { LinkProps } from '@tanstack/react-router';

/**
 * Shell domain/navigation model.
 *
 * The shell is deliberately decoupled from the router and from any specific data
 * source: it is driven entirely by this model plus the values supplied through
 * {@link ShellContextValue}. Whoever mounts the shell (a router route, a preview
 * harness, a test) decides how navigation and data are wired.
 */

/** A single navigable destination inside a domain's secondary sidebar. */
export interface ShellNavItem {
	readonly id: string;
	readonly label: string;
	/** Type-safe router destination. Compared against the active path for selection. */
	readonly to: LinkProps['to'];
	readonly icon?: RegistryIcon;
	/** Optional compact count/indicator (e.g. items needing attention). */
	readonly badge?: string | number;
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
}
