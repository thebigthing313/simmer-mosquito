import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@simmer-mosquito/ui-web/components/ui/breadcrumb';
import { CalendarIcon, HomeIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Fragment } from 'react';
import { useBreadcrumbLabels } from '../breadcrumb-labels';
import { buildBreadcrumbs, firstDestination, navDestination } from '../resolve-nav';
import { useResolutionDomains, useShell } from '../shell-context';
import { HeaderSearchBar } from './header-search-bar';

/**
 * The workspace header: a home affordance and a breadcrumb trail anchor "where
 * am I", and global search anchors "find anything". The organization is named by
 * the switcher, so the header leads with a home icon instead. Kept structural and
 * low on chrome per the product's map-room restraint.
 */
export function AppHeader() {
	const { activePath, domains, onNavigate, standalonePages, getToday, timeZone } = useShell();
	const resolutionDomains = useResolutionDomains();
	const breadcrumbLabels = useBreadcrumbLabels();
	const crumbs = buildBreadcrumbs(resolutionDomains, activePath, {
		...(standalonePages ? { standalonePages } : {}),
		labels: breadcrumbLabels,
	});
	const [home] = domains;
	const homeDestination = home ? firstDestination(home) : null;
	// The header's date names the agency's operational day, so a supervisor
	// checking in at 11pm from a zone ahead of the yard does not see tomorrow.
	const today = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		...(timeZone === undefined ? {} : { timeZone }),
	}).format(getToday === undefined ? new Date() : getToday());

	return (
		<header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-4 md:px-5">
			<Breadcrumb className="min-w-0 flex-1">
				<BreadcrumbList className="gap-1.5 sm:gap-2">
					<BreadcrumbItem>
						<BreadcrumbLink
							asChild
							className="flex items-center text-muted-foreground hover:text-foreground"
						>
							<button
								type="button"
								aria-label="Home"
								onClick={() => homeDestination && onNavigate(homeDestination)}
							>
								<HomeIcon aria-hidden="true" className="size-4" />
							</button>
						</BreadcrumbLink>
					</BreadcrumbItem>
					{crumbs.map((crumb, index) => {
						const isLast = index === crumbs.length - 1;
						const hideOnMobile = isLast ? undefined : 'max-sm:hidden';
						const destination = navDestination(crumb);
						return (
							<Fragment key={destination ?? `leaf:${crumb.label}`}>
								<BreadcrumbSeparator className={hideOnMobile} />
								<BreadcrumbItem className={hideOnMobile}>
									{isLast || destination === null ? (
										<BreadcrumbPage>{crumb.label}</BreadcrumbPage>
									) : (
										<BreadcrumbLink asChild>
											<button type="button" onClick={() => onNavigate(destination)}>
												{crumb.label}
											</button>
										</BreadcrumbLink>
									)}
								</BreadcrumbItem>
							</Fragment>
						);
					})}
				</BreadcrumbList>
			</Breadcrumb>

			<div className="flex shrink-0 items-center gap-4 max-md:hidden">
				<HeaderSearchBar />
				<div className="flex items-center gap-2 border-l border-border pl-4 text-sm">
					<CalendarIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					<span className="font-medium whitespace-nowrap text-foreground">{today}</span>
				</div>
			</div>
		</header>
	);
}
