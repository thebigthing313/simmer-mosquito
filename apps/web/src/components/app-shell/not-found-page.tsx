import {
	navDestination,
	nearestAncestorItem,
	type ShellCrumb,
	useBreadcrumbTrail,
	useResolutionDomains,
	useSearchTrigger,
	useShell,
} from '@simmer-mosquito/ui-web/components/app-shell';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Card } from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';

const CompassIcon = iconRegistry.generic.compass.icon;
const SearchIcon = iconRegistry.actions.search.icon;

/** A module constant, so the trail is published once rather than every render. */
const NOT_FOUND_TRAIL: readonly ShellCrumb[] = [{ label: 'Page not found' }];

/**
 * The page for a path no route matched, wired as the router's
 * `defaultNotFoundComponent`.
 *
 * It takes the frame `RouteErrorPage` draws in, a panel card in the page
 * column with the shell still standing around it, and offers three ways out:
 * the navigation item closest above the path when there is one, the dashboard,
 * and the search palette. It replaces the breadcrumb trail while mounted,
 * because an unmatched path resolves to no navigation item and the trail would
 * otherwise name the first domain as if the reader were in it.
 */
export function NotFoundPage() {
	const { activePath } = useShell();
	const domains = useResolutionDomains();
	const search = useSearchTrigger();
	const parent = nearestAncestorItem(domains, activePath);
	const parentPath = parent === null ? null : navDestination(parent.item);
	// An item label such as `Map` names nothing alone, so the group or domain
	// it sits under goes in front: `Habitats Map`, `Larval Surveillance Overview`.
	const parentLabel =
		parent === null ? null : `${parent.group.label ?? parent.domain.label} ${parent.item.label}`;

	useBreadcrumbTrail(NOT_FOUND_TRAIL);

	return (
		<div className={pageContainer({ gap: 'none', padding: 'page' })}>
			<Card className="w-full max-w-[680px] overflow-hidden" variant="panel">
				<div className="flex items-start gap-3 border-border border-b px-6 py-4">
					<CompassIcon
						aria-hidden="true"
						className="mt-0.5 size-5 shrink-0 text-muted-foreground"
					/>
					<div className="grid gap-1">
						<h1 className="m-0 font-semibold text-foreground text-lg leading-tight">
							Page not found
						</h1>
						<p className="m-0 max-w-[62ch] text-muted-foreground text-sm leading-normal">
							Nothing in SIMMER lives at{' '}
							<span className="break-all font-mono text-foreground">{activePath}</span>. The link
							may be out of date, or the address mistyped.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2 px-6 py-5">
					{parentPath === null || parentLabel === null ? null : (
						<Button asChild size="sm">
							<Link to={parentPath as never}>Go to {parentLabel}</Link>
						</Button>
					)}
					<Button asChild size="sm" variant={parentPath === null ? 'default' : 'outline'}>
						<Link to="/">Go to the dashboard</Link>
					</Button>
					{search === null ? null : (
						<Button onClick={search.onOpen} size="sm" type="button" variant="ghost">
							<SearchIcon aria-hidden="true" />
							Search
						</Button>
					)}
				</div>
			</Card>
		</div>
	);
}
