import { OutletSimpleLayout } from '@simmer-mosquito/ui-web/components/app-shell';
import { ListEmpty, ListNoMatches, PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';
import type { CatalogSearch } from './catalog-search';

const SearchIcon = iconRegistry.actions.search.icon;

/** The uppercase label a catalog groups its rows under. */
export const CATALOG_GROUP_HEADING =
	'm-0 font-bold text-[0.78rem] text-muted-foreground uppercase tracking-wide';

/**
 * The frame a lookup catalog opens with: the page heading, the access badge that
 * says whether this reader may write, the way in, and the state before any rows
 * exist.
 *
 * `action` arrives already gated — a page decides for itself which floor may add
 * a record, and the two the header and the empty state offer are the same node
 * mounted twice.
 */
export function CatalogPage({
	title,
	description,
	icon,
	canEdit,
	action,
	isEmpty,
	emptyTitle,
	emptyDescription,
	children,
}: {
	readonly title: string;
	readonly description: string;
	readonly icon: RegistryIcon;
	/** Drives the access badge only. Whether `action` renders is the caller's call. */
	readonly canEdit: boolean;
	/** The control that adds a record — omitted when the reader cannot. */
	readonly action?: ReactNode | undefined;
	readonly isEmpty: boolean;
	readonly emptyTitle: string;
	readonly emptyDescription: ReactNode;
	readonly children: ReactNode;
}) {
	return (
		<OutletSimpleLayout className="grid content-start gap-5">
			<PageHeader
				actions={
					<>
						<Badge tone={canEdit ? 'success' : 'neutral'} variant="outline">
							{canEdit ? 'Editor access' : 'View only'}
						</Badge>
						{action}
					</>
				}
				description={description}
				icon={icon}
				title={title}
			/>
			{isEmpty ? (
				<ListEmpty action={action} description={emptyDescription} icon={icon} title={emptyTitle} />
			) : (
				children
			)}
		</OutletSimpleLayout>
	);
}

/**
 * The bar above a catalog's sections — how many rows are on each side of the
 * lifecycle, and the filter over them — followed by the sections themselves, or
 * by the line that says nothing matched.
 */
export function CatalogFilteredList<Row>({
	search,
	searchLabel,
	searchPlaceholder,
	noun,
	children,
}: {
	readonly search: CatalogSearch<Row>;
	/** Reads as the field's purpose: "Search habitat types by name or description". */
	readonly searchLabel: string;
	readonly searchPlaceholder: string;
	/** Plural, lowercase — names what was searched when nothing matched. */
	readonly noun: string;
	readonly children: ReactNode;
}) {
	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<CatalogCountBadges active={search.activeCount} inactive={search.inactiveCount} />
				{search.showSearch ? (
					<div className="relative w-full max-w-[260px]">
						<SearchIcon
							aria-hidden="true"
							className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
						/>
						<Input
							aria-label={searchLabel}
							className="h-9 pl-9"
							onChange={(event) => search.setSearch(event.target.value)}
							placeholder={searchPlaceholder}
							type="search"
							value={search.search}
						/>
					</div>
				) : null}
			</div>
			{search.hasMatches ? (
				<div className="grid gap-6">{children}</div>
			) : (
				<ListNoMatches noun={noun} query={search.search.trim()} />
			)}
		</div>
	);
}

/** How many rows sit on each side of the lifecycle. */
function CatalogCountBadges({
	active,
	inactive,
}: {
	readonly active: number;
	readonly inactive: number;
}) {
	return (
		<div className="flex items-center gap-2">
			<Badge tone="success" variant="outline">
				{active} active
			</Badge>
			<Badge tone="neutral" variant="outline">
				{inactive} inactive
			</Badge>
		</div>
	);
}

/**
 * The heading over a catalog whose rows expand into a second tier — it names the
 * group, says what expanding a row gets you, and carries the lifecycle counts.
 */
export function CatalogGroupHeader({
	title,
	description,
	active,
	inactive,
}: {
	readonly title: string;
	readonly description: string;
	readonly active: number;
	readonly inactive: number;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<div className="grid gap-1">
				<h2 className={CATALOG_GROUP_HEADING}>{title}</h2>
				<p className="m-0 max-w-[60ch] text-muted-foreground text-sm leading-snug">{description}</p>
			</div>
			<CatalogCountBadges active={active} inactive={inactive} />
		</div>
	);
}
