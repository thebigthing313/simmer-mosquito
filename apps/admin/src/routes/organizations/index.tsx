import { ListEmpty } from '@simmer-mosquito/ui-web/components/page';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { AdminAgency } from '../../api';
import { AdminError, AdminPage } from '../../components/admin-page';
import { CatalogBody } from '../../components/catalog';
import { subscriptionTone } from '../../lib/tones';
import { useAgencies } from './-agency-data';

const OrganizationIcon = iconRegistry.entities.organization.icon;
const AddIcon = iconRegistry.actions.add.icon;
const ChevronRightIcon = iconRegistry.arrows.chevronRight.icon;
const WarningIcon = iconRegistry.actions.warning.icon;

export const Route = createFileRoute('/organizations/')({
	component: AgencyDirectoryRoute,
});

function AgencyDirectoryRoute() {
	const { data, isPending, error } = useAgencies();
	const [search, setSearch] = useState('');

	const all = useMemo(() => [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [data]);

	const agencies = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (query === '') {
			return all;
		}
		return all.filter(
			(agency) =>
				agency.name.toLowerCase().includes(query) ||
				(agency.contact.mainContactEmail ?? '').toLowerCase().includes(query) ||
				(agency.slug ?? '').toLowerCase().includes(query),
		);
	}, [all, search]);

	/*
	 * Agencies nobody can sign in to. This is the only condition in the directory
	 * that is actually broken rather than merely a state, so it is counted once at
	 * the top instead of being something an operator has to notice by scanning
	 * every row for a pill.
	 */
	const unlinked = all.filter((agency) => agency.workosOrganizationId === null).length;

	return (
		<AdminPage
			actions={
				<Button asChild>
					<Link to="/organizations/create">
						<AddIcon aria-hidden="true" />
						Create Agency
					</Link>
				</Button>
			}
			description="Every mosquito control agency on the platform. Open one to manage its people and reference data."
			icon={OrganizationIcon}
			title="Agencies"
		>
			{error !== null ? (
				<AdminError error={error} />
			) : (
				<CatalogBody
					banner={
						unlinked === 0 ? null : (
							<p className="m-0 flex items-center gap-2 rounded-md border border-warning/30 bg-attention/20 px-3 py-2.5 text-foreground text-sm">
								<WarningIcon aria-hidden="true" className="size-4 shrink-0 text-warning" />
								{unlinked === 1
									? '1 agency has no WorkOS organization linked, so nobody there can sign in.'
									: `${unlinked} agencies have no WorkOS organization linked, so nobody there can sign in.`}
							</p>
						)
					}
					empty={
						<ListEmpty
							action={
								<Button asChild>
									<Link to="/organizations/create">
										<AddIcon aria-hidden="true" />
										Create Agency
									</Link>
								</Button>
							}
							description="Create an agency when a customer is ready to onboard."
							icon={OrganizationIcon}
							title="No agencies yet"
						/>
					}
					isReady={!isPending}
					noun="agencies"
					onSearchChange={setSearch}
					search={search}
					shown={agencies.length}
					total={all.length}
				>
					<ul className="m-0 grid list-none gap-px overflow-hidden rounded-md border border-border/50 bg-border/50 p-0">
						{agencies.map((agency) => (
							<AgencyRow agency={agency} key={agency.id} />
						))}
					</ul>
				</CatalogBody>
			)}
		</AdminPage>
	);
}

function AgencyRow({ agency }: { readonly agency: AdminAgency }) {
	const linked = agency.workosOrganizationId !== null;

	return (
		<li>
			<Link
				className="flex items-center gap-3 bg-card px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
				params={{ organizationId: agency.id }}
				to="/organizations/$organizationId"
			>
				<div className="min-w-0 flex-1">
					<p className="m-0 truncate font-medium text-foreground text-sm">{agency.name}</p>
					{/*
					 * The second line answers "can this agency work yet?" before it
					 * answers "who do I call?" — an unlinked agency has no working
					 * account to contact anyway.
					 */}
					<p className="mt-0.5 mb-0 flex items-center gap-1.5 truncate text-xs">
						{linked ? null : (
							<WarningIcon aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
						)}
						<span className={linked ? 'text-muted-foreground' : 'font-medium text-warning'}>
							{linked
								? (agency.contact.mainContactEmail ?? 'No main contact')
								: 'No sign-in — identity not linked'}
						</span>
					</p>
				</div>
				<Badge
					className="capitalize"
					tone={subscriptionTone(agency.subscription.subscriptionStatus)}
					variant="outline"
				>
					{agency.subscription.subscriptionStatus}
				</Badge>
				<ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
			</Link>
		</li>
	);
}
