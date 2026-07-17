import type { AddressRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry, PlusIcon, SearchIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';

export const Route = createFileRoute('/gis/addresses/')({
	component: AddressesExplorerRoute,
});

const AddressIcon = iconRegistry.actions.searchCheck.icon;
const addressesGcTimeMs = 30_000;
const PAGE_SIZE = 25;

function AddressesExplorerRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';

	// addresses is on-demand; the org-scoped query drives its subset. Status-gated
	// useLiveQuery (not the suspense variant) to avoid the post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: addressesGcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.organizationId, organizationId))
					.orderBy(({ address }) => address.displayName, 'asc'),
		},
		[organizationId],
	);
	const addresses = (result.data ?? []) as readonly AddressRow[];

	const [search, setSearch] = useState('');
	const [page, setPage] = useState(0);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (query.length === 0) {
			return addresses;
		}
		return addresses.filter((address) =>
			[
				address.displayName,
				address.addressLine1,
				address.locality,
				address.region,
				address.postalCode,
			].some((part) => (part ?? '').toLowerCase().includes(query)),
		);
	}, [addresses, search]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset to the first page on a new search.
	useEffect(() => {
		setPage(0);
	}, [search]);
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);
	const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

	return (
		<div className="mx-auto grid w-full max-w-[1100px] content-start gap-5 px-4 py-6 md:px-8">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="grid gap-1">
					<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">Address book</h1>
					<p className="m-0 text-muted-foreground text-sm">
						Geocoded addresses shared across surveillance and control work.
					</p>
				</div>
				<Button asChild size="sm">
					<Link to="/gis/addresses/create">
						<PlusIcon aria-hidden="true" data-icon="inline-start" />
						Create address
					</Link>
				</Button>
			</div>

			<div className="relative">
				<SearchIcon
					aria-hidden="true"
					className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
				/>
				<Input
					aria-label="Search addresses"
					className="pl-9"
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search addresses…"
					type="search"
					value={search}
				/>
			</div>

			{!result.isReady ? (
				<AddressesSkeleton />
			) : filtered.length === 0 ? (
				<AddressesEmpty hasSearch={search.trim().length > 0} />
			) : (
				<>
					<div className="overflow-hidden rounded-md border border-border/40">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead>Name</TableHead>
									<TableHead>Address</TableHead>
									<TableHead>City / State</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{visible.map((address) => (
									<TableRow key={address.id}>
										<TableCell>
											<Link
												className="rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												params={{ id: address.id }}
												to="/gis/addresses/$id"
											>
												{address.displayName}
											</Link>
										</TableCell>
										<TableCell className="max-w-[32ch] truncate text-muted-foreground">
											{address.addressLine1 ?? '—'}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{cityRegion(address) || '—'}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					{pageCount > 1 ? (
						<ExplorerPagination
							noun="addresses"
							onPageChange={setPage}
							page={page}
							pageCount={pageCount}
							total={filtered.length}
						/>
					) : null}
				</>
			)}
		</div>
	);
}

function cityRegion(address: AddressRow): string {
	return [address.locality, address.region]
		.filter((part) => part && part.trim().length > 0)
		.join(', ');
}

function AddressesSkeleton() {
	return (
		<div className="grid gap-2">
			{[0, 1, 2, 3, 4].map((index) => (
				<Skeleton className="h-12 w-full" key={index} />
			))}
		</div>
	);
}

function AddressesEmpty({ hasSearch }: { readonly hasSearch: boolean }) {
	return (
		<Empty className="min-h-[220px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<AddressIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{hasSearch ? 'No addresses match' : 'No addresses yet'}</EmptyTitle>
				<EmptyDescription>
					{hasSearch
						? 'Try a different search term.'
						: 'Create an address to build the shared address book.'}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
