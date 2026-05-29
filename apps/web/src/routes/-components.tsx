import { Avatar, AvatarBadge, AvatarFallback } from '@simmer-mosquito/ui-web/components/ui/avatar';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Card, CardContent } from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { NativeSelect } from '@simmer-mosquito/ui-web/components/ui/native-select';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from '@simmer-mosquito/ui-web/components/ui/sidebar';
import { Toaster } from '@simmer-mosquito/ui-web/components/ui/sonner';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link, Outlet, useLocation, useParams } from '@tanstack/react-router';
import type React from 'react';
import { type AuthMe, getServerUrl } from '../auth';
import { SuspenseQueryBoundary } from '../sync/suspense-query-boundary';
import { useCollectionRows } from '../sync/useCollectionRows';
import { webCollections } from '../sync/webCollections';

type Tone = 'neutral' | 'attention' | 'success' | 'info' | 'danger';

const pageGridClass = 'mx-auto grid w-full max-w-[1380px] content-start gap-6';
const twelveColumnGridClass = 'grid grid-cols-12 gap-5 max-[820px]:grid-cols-1';
const splitPageClass =
	'mx-auto grid min-h-[calc(100vh-128px)] w-full max-w-[1380px] grid-cols-[minmax(380px,0.44fr)_minmax(0,1fr)] items-start gap-5 max-[1120px]:grid-cols-1';
const splitContentClass = 'grid min-w-0 content-start gap-5';
const controlPanelClass =
	'grid min-w-0 content-start gap-4 rounded-lg border border-border/35 bg-card/90 p-5';
const panelRowClass =
	'grid items-center gap-3.5 rounded-lg border border-border/35 bg-card/72 p-3.5';
const mutedBodyClass = 'm-0 text-[0.86rem] leading-normal text-muted-foreground';
const rowTitleClass = 'text-[0.95rem] text-foreground';
const compactLabelClass = 'text-[0.78rem] font-bold text-muted-foreground';

function spanClass(columns: 4 | 5 | 7 | 8): string {
	const spans = {
		4: 'col-span-4 max-[820px]:col-auto',
		5: 'col-span-5 max-[820px]:col-auto',
		7: 'col-span-7 max-[820px]:col-auto',
		8: 'col-span-8 max-[820px]:col-auto',
	};

	return spans[columns];
}

function toneBackgroundClass(tone: Tone): string {
	const backgrounds = {
		attention: 'bg-[color-mix(in_oklch,var(--warning-bg)_46%,var(--card))]',
		danger: 'bg-[color-mix(in_oklch,var(--danger-bg)_44%,var(--card))]',
		success: 'bg-[color-mix(in_oklch,var(--success-bg)_42%,var(--card))]',
		info: 'bg-[color-mix(in_oklch,var(--info-bg)_42%,var(--card))]',
		neutral: 'bg-card',
	};

	return backgrounds[tone];
}

interface WorkItem {
	readonly id: string;
	readonly label: string;
	readonly kind: string;
	readonly place: string;
	readonly status: string;
	readonly time: string;
	readonly tone: Tone;
}

const todayWork: WorkItem[] = [
	{
		id: 'SR-1048',
		label: 'Backyard standing water complaint',
		kind: 'Service request',
		place: '18 Maple Court',
		status: 'Needs triage',
		time: '8:20 AM',
		tone: 'attention',
	},
	{
		id: 'MI-221',
		label: 'North basin larval inspection route',
		kind: 'Mission',
		place: 'North Basin',
		status: 'Crew assigned',
		time: '9:00 AM',
		tone: 'info',
	},
	{
		id: 'HT-884',
		label: 'Retention pond follow-up',
		kind: 'Habitat',
		place: 'Cedar Industrial Park',
		status: 'Breeding positive',
		time: '10:15 AM',
		tone: 'danger',
	},
	{
		id: 'TR-318',
		label: 'EVS trap collection',
		kind: 'Adult surveillance',
		place: 'River Road',
		status: 'Ready to collect',
		time: '2:00 PM',
		tone: 'success',
	},
];

const requests = [
	{
		id: 'SR-1048',
		title: 'Backyard standing water complaint',
		address: '18 Maple Court',
		received: 'Today, 8:20 AM',
		source: 'Phone',
		status: 'Needs triage',
		priority: 'High',
		nearby: '2 habitats, 1 trap, 1 recent control action',
		tone: 'attention' as Tone,
	},
	{
		id: 'SR-1042',
		title: 'Request for catch basin treatment',
		address: '440 Pine Avenue',
		received: 'Yesterday, 4:10 PM',
		source: 'Web',
		status: 'Assigned',
		priority: 'Normal',
		nearby: 'Inside Oak Ridge treatment region',
		tone: 'info' as Tone,
	},
	{
		id: 'SR-1037',
		title: 'Adult mosquito nuisance report',
		address: '91 Hillcrest Lane',
		received: 'May 16, 2026',
		source: 'Email',
		status: 'Waiting on inspection',
		priority: 'Normal',
		nearby: 'Trap TR-318 collected this week',
		tone: 'neutral' as Tone,
	},
	{
		id: 'SR-1029',
		title: 'Drainage ditch follow-up',
		address: 'West canal access',
		received: 'May 14, 2026',
		source: 'Field staff',
		status: 'Closed',
		priority: 'Low',
		nearby: 'Source reduction recorded',
		tone: 'success' as Tone,
	},
];

const navigationGroups = [
	{
		label: 'General',
		items: [
			{ to: '/', label: 'Dashboard', icon: iconRegistry.generic.component.icon },
			{ to: '/today', label: "Today's Activities", icon: iconRegistry.simmer.fieldWork.icon },
			{
				to: '/my-organization',
				label: 'My Organization',
				icon: iconRegistry.generic.settings.icon,
			},
		],
	},
	{
		label: 'Larval Surveillance',
		items: [
			{ to: '/habitats', label: 'Habitats', icon: iconRegistry.domains.larvalSurveillance.icon },
			{ to: '/inspections', label: 'Inspections', icon: iconRegistry.entities.inspection.icon },
			{ to: '/samples', label: 'Samples', icon: iconRegistry.entities.sample.icon },
		],
	},
	{
		label: 'Adult Surveillance',
		items: [
			{ to: '/traps', label: 'Traps', icon: iconRegistry.entities.trap.icon },
			{ to: '/collections', label: 'Collections', icon: iconRegistry.entities.collection.icon },
		],
	},
	{
		label: 'Control Actions',
		items: [
			{
				to: '/chemical-control',
				label: 'Chemical Control',
				icon: iconRegistry.entities.application.icon,
			},
			{
				to: '/source-reductions',
				label: 'Source Reductions',
				icon: iconRegistry.entities.sourceReductionAction.icon,
			},
			{ to: '/biocontrol', label: 'Biocontrol', icon: iconRegistry.entities.biocontrolAction.icon },
			{
				to: '/public-outreach',
				label: 'Public Outreach',
				icon: iconRegistry.entities.outreachAction.icon,
			},
		],
	},
	{
		label: 'Public Engagement',
		items: [
			{ to: '/contacts', label: 'Contacts', icon: iconRegistry.entities.organization.icon },
			{
				to: '/service-requests',
				label: 'Service Requests',
				icon: iconRegistry.domains.publicEngagement.icon,
			},
		],
	},
	{
		label: 'GIS Data',
		items: [
			{ to: '/address-book', label: 'Address Book', icon: iconRegistry.actions.searchCheck.icon },
			{ to: '/regions', label: 'Regions', icon: iconRegistry.entities.region.icon },
			{ to: '/routes', label: 'Routes', icon: iconRegistry.entities.route.icon },
		],
	},
	{
		label: 'Operations',
		items: [
			{ to: '/assignments', label: 'Assignments', icon: iconRegistry.entities.vehicle.icon },
			{
				to: '/requests-for-control',
				label: 'Requests for Control',
				icon: iconRegistry.domains.controlOperations.icon,
			},
			{ to: '/missions', label: 'Missions', icon: iconRegistry.entities.route.icon },
		],
	},
] as const;

function matchNavigationItem(pathname: string) {
	let activeGroup: (typeof navigationGroups)[number] | null = null;
	let activeItem: (typeof navigationGroups)[number]['items'][number] | null = null;
	let longestMatch = -1;

	for (const group of navigationGroups) {
		for (const item of group.items) {
			const matches =
				item.to === '/'
					? pathname === '/'
					: pathname === item.to || pathname.startsWith(`${item.to}/`);

			if (matches && item.to.length > longestMatch) {
				activeGroup = group;
				activeItem = item;
				longestMatch = item.to.length;
			}
		}
	}

	return { activeGroup, activeItem };
}

function formatPathSegment(segment: string) {
	return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function isLikelyRecordIdentifier(segment: string) {
	return /\d/.test(segment) || /^[0-9a-f]{8,}$/i.test(segment);
}

function getWorkspaceHeader(pathname: string, organizationName: string) {
	const { activeGroup, activeItem } = matchNavigationItem(pathname);
	const baseSegments = (activeItem?.to ?? pathname).split('/').filter(Boolean);
	const pathSegments = pathname.split('/').filter(Boolean);
	const trailingSegments = pathSegments.slice(baseSegments.length).filter(Boolean);
	const lastMeaningfulSegment = [...trailingSegments]
		.reverse()
		.find((segment) => !isLikelyRecordIdentifier(segment));
	const nestedTitle = lastMeaningfulSegment ? formatPathSegment(lastMeaningfulSegment) : null;
	const section = activeGroup?.label ?? 'Workspace';
	const title = nestedTitle ?? activeItem?.label ?? 'Operations workspace';
	const context = activeItem && nestedTitle ? activeItem.label : section;
	const summary =
		title === 'Dashboard'
			? `Operational overview for ${organizationName}`
			: `${organizationName} records, map context, and active workflow details.`;

	return {
		section,
		context,
		title,
		summary,
	};
}

export function RootLayout({ auth }: { readonly auth: AuthMe | null }) {
	const { pathname } = useLocation();
	const localIdentity = auth?.authenticated === true ? auth.localIdentity : null;
	const user = auth?.authenticated === true ? auth.user : null;
	const { rows: organizations } = useCollectionRows(webCollections.currentOrganization);
	const { rows: profiles } = useCollectionRows(webCollections.profiles);
	const organization = organizations.find((row) => row.id === localIdentity?.organizationId);
	const profile = profiles.find((row) => row.id === localIdentity?.profileId);
	const organizationName =
		organization?.name ?? localIdentity?.organizationName ?? 'Selected organization';
	const profileName = profile?.displayName ?? user?.displayName ?? 'SIMMER User';
	const roleLabel = formatRole(localIdentity?.role);
	const workspaceHeader = getWorkspaceHeader(pathname, organizationName);
	const fullHeightWorkspace = pathname === '/habitats' || pathname.startsWith('/habitats/');
	const workspaceContent = (
		<div
			className={cn(
				'min-h-0 p-[clamp(18px,2.6vw,30px)] max-[560px]:p-4',
				fullHeightWorkspace ? 'h-full overflow-hidden' : 'h-full',
			)}
		>
			<WorkspaceOutletBoundary>
				<Outlet />
			</WorkspaceOutletBoundary>
		</div>
	);

	return (
		<SidebarProvider className="h-svh min-h-0 overflow-hidden bg-(--app-stage)">
			<ProductSidebar />
			<SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-(--app-stage)">
				<header className="sticky top-0 z-10 grid min-h-[88px] grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--app-chrome-strong)_22%,var(--app-chrome)),var(--app-chrome))] px-[clamp(18px,3vw,32px)] py-3 shadow-[0_14px_20px_-24px_oklch(36%_0.024_205/30%)] max-[900px]:grid-cols-1 max-[900px]:items-start">
					<div className="min-w-0">
						<div className="grid gap-1">
							<p className="eyebrow">{workspaceHeader.context}</p>
							<h1 className="m-0 text-[1.28rem] leading-tight font-extrabold text-foreground">
								{workspaceHeader.title}
							</h1>
							<p className="m-0 max-w-[72ch] text-[0.88rem] leading-normal text-muted-foreground">
								{workspaceHeader.summary}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-3 rounded-md border border-border/45 bg-card/75 px-3 py-2 text-[0.84rem] font-semibold text-muted-foreground max-[560px]:w-full max-[560px]:justify-between">
						<div className="flex min-w-0 items-center gap-2">
							<Avatar size="sm" className="bg-(--app-selection) text-primary">
								<AvatarFallback>{initialsFor(profileName)}</AvatarFallback>
								<AvatarBadge />
							</Avatar>
							<div className="min-w-0">
								<strong className="block whitespace-nowrap text-[0.86rem] leading-tight font-extrabold text-foreground">
									{profileName}
								</strong>
								<span className="block text-[0.72rem] leading-tight font-bold text-(--quiet)">
									{roleLabel}
								</span>
							</div>
						</div>
						<div className="hidden h-8 w-px bg-border/70 max-[560px]:hidden min-[561px]:block" />
						<div className="text-right max-[560px]:text-left">
							<span className="block text-[0.72rem] leading-tight font-bold text-(--quiet)">
								Organization
							</span>
							<strong className="block whitespace-nowrap text-[0.86rem] leading-tight font-extrabold text-foreground">
								{organizationName}
							</strong>
						</div>
					</div>
				</header>
				{fullHeightWorkspace ? (
					<div className="min-h-0 flex-auto overflow-hidden bg-[linear-gradient(90deg,color-mix(in_oklch,var(--app-shell)_58%,transparent),transparent_340px),var(--app-stage)]">
						{workspaceContent}
					</div>
				) : (
					<ScrollArea className="min-h-0 flex-auto bg-[linear-gradient(90deg,color-mix(in_oklch,var(--app-shell)_58%,transparent),transparent_340px),var(--app-stage)]">
						{workspaceContent}
					</ScrollArea>
				)}
			</SidebarInset>
			<Toaster richColors />
		</SidebarProvider>
	);
}

function WorkspaceOutletBoundary({ children }: { readonly children: React.ReactNode }) {
	const { pathname } = useLocation();

	return (
		<SuspenseQueryBoundary
			errorFallback={<WorkspacePageError />}
			loadingFallback={<WorkspacePageFallback />}
			resetKey={pathname}
		>
			{children}
		</SuspenseQueryBoundary>
	);
}

export function WorkspaceChromeFallback() {
	return (
		<div className="grid min-h-screen place-items-center bg-(--app-stage) p-6">
			<Card variant="surface" className="w-[min(420px,100%)]">
				<CardContent padding="default" className="grid gap-2">
					<p className="eyebrow">SIMMER</p>
					<strong className="text-[1rem] text-foreground">Loading workspace</strong>
				</CardContent>
			</Card>
		</div>
	);
}

export function WorkspaceChromeError() {
	return (
		<div className="grid min-h-screen place-items-center bg-(--app-stage) p-6">
			<Card variant="surface" className="w-[min(460px,100%)]">
				<CardContent padding="default" className="grid gap-3">
					<div className="grid gap-1">
						<p className="eyebrow">SIMMER</p>
						<strong className="text-[1rem] text-foreground">Unable to load workspace data</strong>
					</div>
					<Button type="button" onClick={() => window.location.reload()}>
						Reload
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

function WorkspacePageFallback() {
	return (
		<Card variant="surface">
			<CardContent padding="default" className="grid gap-2">
				<p className="eyebrow">Loading</p>
				<strong className="text-[1rem] text-foreground">Preparing records</strong>
			</CardContent>
		</Card>
	);
}

function WorkspacePageError() {
	return (
		<Card variant="surface">
			<CardContent padding="default" className="grid gap-3">
				<div className="grid gap-1">
					<p className="eyebrow">Records</p>
					<strong className="text-[1rem] text-foreground">Unable to load records</strong>
				</div>
				<Button type="button" variant="outline" onClick={() => window.location.reload()}>
					Reload
				</Button>
			</CardContent>
		</Card>
	);
}

export function LandingPage({
	authReason,
	redirectTo,
}: {
	readonly authReason?: 'organization_required';
	readonly redirectTo: string;
}) {
	const loginUrl = `${getServerUrl()}/auth/login?returnTo=${encodeURIComponent(redirectTo)}`;

	return (
		<div className="grid min-h-screen place-items-center bg-[linear-gradient(90deg,color-mix(in_oklch,var(--app-shell)_58%,transparent),transparent_360px),var(--app-stage)] p-6">
			<section className="grid w-[min(620px,100%)] gap-3.5 rounded-md border border-border/30 bg-card p-7">
				<BrandMark />
				<p className="eyebrow">SIMMER</p>
				<h1 className="m-0 text-[2rem] leading-tight">
					Mosquito control operations, grounded in the map.
				</h1>
				<p className="m-0 leading-normal text-muted-foreground">
					Sign in to manage surveillance, field work, public engagement, control operations, and
					organization setup from one operational workspace.
				</p>
				{authReason === 'organization_required' ? (
					<div className="grid gap-1 rounded-md border border-warning/20 bg-[color-mix(in_oklch,var(--warning-bg)_54%,var(--card))] p-3">
						<strong className="text-[0.94rem] text-foreground">Organization access needed</strong>
						<p className={mutedBodyClass}>
							Your account is signed in, but no active SIMMER organization membership is selected.
						</p>
					</div>
				) : null}
				<div className="flex flex-wrap gap-2.5">
					<Button asChild>
						<a href={loginUrl}>Sign in</a>
					</Button>
				</div>
			</section>
		</div>
	);
}

function ProductSidebar() {
	const { pathname } = useLocation();

	return (
		<Sidebar
			className="bg-(--app-chrome) shadow-[inset_-14px_0_22px_-24px_oklch(36%_0.024_205/55%)]"
			collapsible="none"
			aria-label="Primary"
		>
			<SidebarHeader className="min-h-[74px] justify-center bg-[linear-gradient(180deg,color-mix(in_oklch,var(--app-chrome-strong)_36%,var(--app-chrome)),var(--app-chrome))] p-3">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild size="lg" tooltip="SIMMER">
							<Link
								className="inline-flex min-h-[42px] items-center gap-2.5 font-extrabold text-(--simmer-darker-green) no-underline"
								to="/"
							>
								<img src="/favicon.svg" alt="" className="block size-[30px] rounded-sm" />
								<span>SIMMER</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<ScrollArea className="min-h-0 flex-auto">
				<SidebarContent
					className="flex flex-none flex-col gap-0 overflow-visible px-2 pb-2"
					role="navigation"
					aria-label="Primary navigation"
				>
					{navigationGroups.map((group) => (
						<SidebarGroup className="gap-1 px-1 py-1.5" key={group.label}>
							<SidebarGroupLabel className="h-[1.65rem] px-2 text-[0.74rem] leading-tight font-extrabold tracking-[0.06em] text-primary uppercase">
								{group.label}
							</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu className="gap-0.5">
									{group.items.map((item) => {
										const active =
											item.to === '/'
												? pathname === '/'
												: pathname === item.to || pathname.startsWith(`${item.to}/`);
										return (
											<SidebarMenuItem key={item.to}>
												<SidebarMenuButton
													asChild
													className="h-[1.85rem] px-2 text-[0.86rem] font-semibold text-sidebar-foreground/70 data-[active=true]:bg-(--app-selection) data-[active=true]:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_12%,transparent)]"
													isActive={active}
													tooltip={item.label}
												>
													<Link aria-current={active ? 'page' : undefined} to={item.to}>
														<item.icon aria-hidden="true" />
														<span>{item.label}</span>
													</Link>
												</SidebarMenuButton>
											</SidebarMenuItem>
										);
									})}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					))}
				</SidebarContent>
			</ScrollArea>
			<SidebarFooter>
				<div className="mt-auto rounded-md bg-[color-mix(in_oklch,var(--app-chrome-strong)_58%,var(--app-chrome))] p-3">
					<p className="eyebrow">Pattern reserves</p>
					<p className="m-0 text-[0.8rem] leading-normal text-muted-foreground">
						Atlas details and planning grids are preserved for records, routes, and scheduling.
					</p>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}

function BrandMark() {
	return (
		<span className="inline-grid size-[34px] place-items-center rounded-md bg-primary font-extrabold text-primary-foreground">
			S
		</span>
	);
}

export function DashboardPage() {
	return (
		<div className={pageGridClass}>
			<PageHeader
				kicker="No-map dashboard"
				title="Today at a glance"
				body="A dashboard route should summarize the work without forcing a mixed-context map to render."
				action={
					<Button asChild>
						<Link to="/today">Open activity map</Link>
					</Button>
				}
			/>

			<section
				className="grid grid-cols-4 gap-5 max-[1080px]:grid-cols-2 max-[820px]:grid-cols-1"
				aria-label="Operational overview"
			>
				<SummaryTile label="Activities scheduled" value="42" detail="16 not started" tone="info" />
				<SummaryTile label="Open requests" value="18" detail="5 need triage" tone="attention" />
				<SummaryTile label="Breeding positive" value="7" detail="3 above threshold" tone="danger" />
				<SummaryTile
					label="Crews available"
					value="6"
					detail="2 with spray equipment"
					tone="success"
				/>
			</section>

			<div className={twelveColumnGridClass}>
				<Surface className={spanClass(7)}>
					<SectionHeader
						title="Today’s activities"
						meta="Click through for spatial focus"
						action={<Link to="/today">View mapped route</Link>}
					/>
					<div className="grid gap-2.5">
						{todayWork.map((item) => (
							<WorkRow item={item} key={item.id} />
						))}
					</div>
				</Surface>

				<Surface className={spanClass(5)}>
					<SectionHeader title="Threshold signals" meta="Weather and surveillance" />
					<div className="grid gap-2.5">
						<SignalRow
							label="Rain accumulation"
							value="1.4 in"
							detail="48 hour total"
							tone="info"
						/>
						<SignalRow
							label="Trap-night rate"
							value="18.6"
							detail="North basin cluster"
							tone="attention"
						/>
						<SignalRow
							label="Larval density"
							value="High"
							detail="Cedar Industrial Park"
							tone="danger"
						/>
						<SignalRow label="Completed control" value="12" detail="This week" tone="success" />
					</div>
				</Surface>

				<Surface className={spanClass(4)}>
					<SectionHeader title="Pending operations" meta="Needs commitment" />
					<div className="grid gap-3.5" role="img" aria-label="Pending operations by type">
						<ChartBar label="Requests" value={80} />
						<ChartBar label="Missions" value={56} />
						<ChartBar label="Inspections" value={72} />
						<ChartBar label="Applications" value={34} />
					</div>
				</Surface>

				<Surface className={spanClass(8)}>
					<SectionHeader title="Dispatch notes" meta="Recent command outcomes" />
					<div className="grid gap-2.5">
						<TimelineItem
							title="Mission scheduled"
							detail="North basin larval inspection route assigned to Crew 2."
						/>
						<TimelineItem
							title="Service request created"
							detail="SR-1048 received by phone, location matched to 18 Maple Court."
						/>
						<TimelineItem
							title="Inspection recorded"
							detail="HT-884 marked breeding positive with fourth instar and pupae present."
						/>
					</div>
				</Surface>
			</div>
		</div>
	);
}

export function TodayActivitiesPage() {
	return (
		<div className={splitPageClass}>
			<section className={splitContentClass}>
				<PageHeader
					kicker="Focused dashboard with map"
					title="Today’s activities"
					body="This route has one spatial question: where is today’s work, what is next, and what needs intervention?"
				/>
				<div className="flex flex-wrap gap-2 rounded-lg border border-border/35 bg-card/78 px-3 py-3">
					<Button type="button" variant="secondary" size="sm">
						All
					</Button>
					<Button type="button" variant="ghost" size="sm">
						Requests
					</Button>
					<Button type="button" variant="ghost" size="sm">
						Missions
					</Button>
					<Button type="button" variant="ghost" size="sm">
						Controls
					</Button>
				</div>
				<div className="grid gap-2.5">
					{todayWork.map((item) => (
						<WorkRow item={item} key={item.id} />
					))}
				</div>
			</section>
			<MapPanel title="Dispatch overlay" />
		</div>
	);
}

export function ServiceRequestsIndexPage() {
	return (
		<div className={pageGridClass}>
			<PageHeader
				kicker="Entity index"
				title="Service requests"
				body="The index is built for scanning, filtering, and triage. It avoids rendering a map until a request or focused view needs spatial context."
				action={<Button type="button">New request</Button>}
			/>
			<Surface>
				<div className="flex items-center justify-between gap-4 max-[820px]:flex-col max-[820px]:items-start">
					<div className="flex flex-wrap gap-2">
						<Button type="button" variant="secondary" size="sm">
							Open
						</Button>
						<Button type="button" variant="ghost" size="sm">
							Needs triage
						</Button>
						<Button type="button" variant="ghost" size="sm">
							Assigned
						</Button>
						<Button type="button" variant="ghost" size="sm">
							Closed
						</Button>
					</div>
					<Field className="max-w-80">
						<FieldLabel>Search</FieldLabel>
						<Input defaultValue="" placeholder="e.g. Address, contact, request id" />
					</Field>
				</div>

				<div className="grid gap-0">
					<div className="grid grid-cols-[minmax(260px,1.25fr)_minmax(160px,0.55fr)_minmax(220px,0.8fr)] px-3 pb-2.5 text-[0.75rem] font-extrabold text-muted-foreground uppercase max-[820px]:hidden">
						<span>Request</span>
						<span>Status</span>
						<span>Context</span>
					</div>
					{requests.map((request) => (
						<Link
							className="mt-2 grid grid-cols-[minmax(260px,1.25fr)_minmax(160px,0.55fr)_minmax(220px,0.8fr)] items-center gap-3.5 rounded-md border border-border/30 bg-muted/40 px-3 py-3.5 text-inherit no-underline first:mt-0 max-[820px]:grid-cols-1"
							key={request.id}
							to="/service-requests/$requestId"
							params={{ requestId: request.id }}
						>
							<div>
								<strong className={rowTitleClass}>{request.title}</strong>
								<p className={mutedBodyClass}>
									{request.id} · {request.address} · {request.received}
								</p>
							</div>
							<div className="grid justify-items-start gap-1.5">
								<StatusBadge tone={request.tone}>{request.status}</StatusBadge>
								<span className="text-[0.8rem] text-muted-foreground">
									{request.priority} priority
								</span>
							</div>
							<p className={mutedBodyClass}>{request.nearby}</p>
						</Link>
					))}
				</div>
			</Surface>
		</div>
	);
}

export function ServiceRequestDetailPage() {
	const { requestId } = useParams({ from: '/service-requests/$requestId' });
	const request = requests.find((item) => item.id === requestId) ?? requests[0];

	if (request === undefined) {
		return null;
	}

	return (
		<div className={splitPageClass}>
			<section className={splitContentClass}>
				<Link className="text-[0.86rem] font-bold text-primary no-underline" to="/service-requests">
					Back to requests
				</Link>
				<PageHeader
					kicker="Detail page with map"
					title={request.title}
					body={`${request.id} at ${request.address}. Location, nearby records, and history are now the job, so the map is rendered here.`}
					action={<Button type="button">Create assignment</Button>}
				/>
				<div className="grid grid-cols-4 gap-2.5 max-[820px]:grid-cols-1">
					<Fact label="Status" value={request.status} />
					<Fact label="Intake" value={request.source} />
					<Fact label="Priority" value={request.priority} />
					<Fact label="Nearby" value="2 habitats, 1 trap" />
				</div>
				<Surface>
					<SectionHeader title="Record history" meta="Command-shaped activity" />
					<div className="grid gap-2.5">
						<TimelineItem
							title="publicEngagement.createServiceRequest"
							detail="Phone intake created with contact, location, request date, and details."
						/>
						<TimelineItem
							title="fieldWork.addComment"
							detail="Operator noted resident reports evening activity near the alley catch basin."
						/>
						<TimelineItem
							title="missionDispatch.addMissionItem"
							detail="Ready to add to tomorrow’s larval inspection mission."
						/>
					</div>
				</Surface>
			</section>
			<MapPanel title="Request context" variant="detail" />
		</div>
	);
}

export function GroupsPage() {
	return (
		<div className={pageGridClass}>
			<PageHeader
				kicker="Group management"
				title="Crews and operational groups"
				body="Configuration pages stay compact and map-free. They manage trust in the workflow: people, roles, methods, equipment, and lookup records."
				action={<Button type="button">Create crew</Button>}
			/>
			<div className={twelveColumnGridClass}>
				<Surface className={spanClass(7)}>
					<SectionHeader title="Crews" meta="Assignment-ready groups" />
					<div className="grid gap-2.5">
						<GroupRow
							name="North Basin Crew"
							status="Available"
							members="4 members"
							equipment="Truck, backpack sprayer"
						/>
						<GroupRow
							name="Public Requests"
							status="Busy"
							members="3 members"
							equipment="Inspection kits"
						/>
						<GroupRow
							name="Evening ULV"
							status="Scheduled"
							members="2 members"
							equipment="ULV vehicle"
						/>
					</div>
				</Surface>
				<Surface className={spanClass(5)}>
					<SectionHeader title="Lookup health" meta="Setup affects field confidence" />
					<div className="grid gap-2.5">
						<SignalRow label="Collection methods" value="12" detail="1 inactive" tone="success" />
						<SignalRow label="Habitat types" value="18" detail="3 recently added" tone="info" />
						<SignalRow label="Tags" value="34" detail="6 used this week" tone="neutral" />
						<SignalRow label="Units" value="27" detail="Defaults configured" tone="success" />
					</div>
				</Surface>
			</div>
		</div>
	);
}

export function MissionEditPage() {
	return (
		<div className={pageGridClass}>
			<PageHeader
				kicker="Edit form"
				title="Schedule larval inspection mission"
				body="Forms are focused command builders. The map appears only when the command needs location or route geometry."
			/>
			<section className={cn(splitPageClass, 'items-stretch')}>
				<div className={controlPanelClass}>
					<div className="grid grid-cols-4 gap-2 max-[560px]:grid-cols-2">
						<StepperItem active>Details</StepperItem>
						<StepperItem active>Stops</StepperItem>
						<StepperItem>Resources</StepperItem>
						<StepperItem>Review</StepperItem>
					</div>
					<FieldGroup className="grid grid-cols-2 gap-3.5 max-[820px]:grid-cols-1">
						<Field>
							<FieldLabel>Mission name</FieldLabel>
							<Input defaultValue="North basin larval inspection route" />
						</Field>
						<Field>
							<FieldLabel>Control type</FieldLabel>
							<NativeSelect defaultValue="sourceReduction">
								<option value="sourceReduction">Source reduction</option>
								<option value="chemicalApplication">Chemical application</option>
								<option value="outreach">Outreach</option>
							</NativeSelect>
						</Field>
						<Field>
							<FieldLabel>Scheduled start</FieldLabel>
							<Input defaultValue="2026-05-19 09:00" />
						</Field>
						<Field>
							<FieldLabel>Assigned crew</FieldLabel>
							<NativeSelect defaultValue="north">
								<option value="north">North Basin Crew</option>
								<option value="requests">Public Requests</option>
							</NativeSelect>
							<FieldDescription>Used by missionDispatch.assignMission.</FieldDescription>
						</Field>
					</FieldGroup>
					<section className="grid gap-2.5 pt-1">
						<SectionHeader title="Mission items" meta="Planning Grid pattern reserve" />
						<RouteStop index="1" title="18 Maple Court" detail="Service request SR-1048" />
						<RouteStop
							index="2"
							title="Cedar Industrial Park"
							detail="Habitat HT-884, breeding positive"
						/>
						<RouteStop index="3" title="North canal access" detail="Ad hoc inspection location" />
					</section>
					<div className="rounded-md border border-[color-mix(in_oklch,var(--simmer-blue)_18%,transparent)] bg-[color-mix(in_oklch,var(--info-bg)_44%,var(--card))] p-3.5">
						<strong>missionDispatch.createMission</strong>
						<p className="mt-1.5 mb-0 text-[0.9rem] text-muted-foreground">
							Will create 3 mission items, assign North Basin Crew, and preserve requested-control
							links.
						</p>
					</div>
				</div>
				<MapPanel title="Location step" variant="form" />
			</section>
		</div>
	);
}

export function StubPage({
	kicker,
	title,
	body,
	items,
}: {
	readonly kicker: string;
	readonly title: string;
	readonly body: string;
	readonly items: readonly {
		readonly label: string;
		readonly detail: string;
		readonly status: string;
		readonly tone: Tone;
	}[];
}) {
	return (
		<div className={pageGridClass}>
			<PageHeader
				kicker={kicker}
				title={title}
				body={body}
				action={<Button type="button">New record</Button>}
			/>
			<Surface>
				<SectionHeader title="Mock records" meta="Database wiring comes later" />
				<div className="grid gap-2.5">
					{items.map((item) => (
						<article
							className={cn(panelRowClass, 'grid-cols-[minmax(0,1fr)_auto]')}
							key={item.label}
						>
							<div>
								<strong className={rowTitleClass}>{item.label}</strong>
								<p className={mutedBodyClass}>{item.detail}</p>
							</div>
							<StatusBadge tone={item.tone}>{item.status}</StatusBadge>
						</article>
					))}
				</div>
			</Surface>
		</div>
	);
}

export function LoginPage() {
	const returnTo = typeof window === 'undefined' ? '/' : window.location.origin;
	const loginUrl = `${getServerUrl()}/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

	return (
		<div className="grid min-h-screen place-items-center bg-[linear-gradient(90deg,color-mix(in_oklch,var(--app-shell)_58%,transparent),transparent_360px),var(--app-stage)] p-6">
			<section className="grid w-[min(460px,100%)] gap-3.5 rounded-md border border-border/30 bg-card p-7">
				<BrandMark />
				<p className="eyebrow">SIMMER sign in</p>
				<h1 className="m-0 text-[1.6rem] leading-tight">Continue to your operations workspace</h1>
				<p className="m-0 leading-normal text-muted-foreground">
					Authentication is handled by WorkOS. After sign in, SIMMER returns you to the app route
					you were trying to open.
				</p>
				<Button asChild>
					<a href={loginUrl}>Sign in</a>
				</Button>
			</section>
		</div>
	);
}

function Surface({
	className,
	children,
}: {
	readonly className?: string;
	readonly children: React.ReactNode;
}) {
	return (
		<Card variant="surface" className={cn('rounded-lg border-border/35 bg-card/88', className)}>
			<CardContent padding="default" className="grid gap-4">
				{children}
			</CardContent>
		</Card>
	);
}

function PageHeader({
	kicker,
	title,
	body,
	action,
}: {
	readonly kicker: string;
	readonly title: string;
	readonly body: string;
	readonly action?: React.ReactNode;
}) {
	return (
		<header className="grid gap-4 border-b border-border/45 pb-4 min-[821px]:grid-cols-[minmax(0,1fr)_auto] min-[821px]:items-end">
			<div className="grid max-w-[72ch] gap-2">
				<p className="eyebrow">{kicker}</p>
				<h1 className="m-0 text-[1.65rem] leading-tight font-extrabold text-foreground">{title}</h1>
				<p className="m-0 leading-normal text-muted-foreground">{body}</p>
			</div>
			{action === undefined ? null : <div className="shrink-0">{action}</div>}
		</header>
	);
}

function SummaryTile({
	label,
	value,
	detail,
	tone,
}: {
	readonly label: string;
	readonly value: string;
	readonly detail: string;
	readonly tone: Tone;
}) {
	return (
		<div
			className={cn(
				'grid min-h-[124px] content-start gap-3 rounded-lg border border-border/35 p-4',
				toneBackgroundClass(tone),
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<span className={compactLabelClass}>{label}</span>
				<span className="mt-1 size-2.5 rounded-full bg-primary/65" aria-hidden="true" />
			</div>
			<div className="flex items-end justify-between gap-3 max-[560px]:items-start max-[560px]:flex-col">
				<strong className="text-[1.65rem] leading-none text-foreground">{value}</strong>
				<p className="m-0 text-right text-[0.82rem] leading-normal text-muted-foreground max-[560px]:text-left">
					{detail}
				</p>
			</div>
		</div>
	);
}

function SectionHeader({
	title,
	meta,
	action,
}: {
	readonly title: string;
	readonly meta?: string;
	readonly action?: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4 border-b border-border/35 pb-3">
			<div>
				<h2 className="m-0 text-[1.06rem] font-extrabold">{title}</h2>
				{meta === undefined ? null : (
					<p className="mt-1 mb-0 text-[0.84rem] text-muted-foreground">{meta}</p>
				)}
			</div>
			{action === undefined ? null : (
				<div className="[&_a]:text-[0.86rem] [&_a]:font-bold [&_a]:text-primary [&_a]:no-underline">
					{action}
				</div>
			)}
		</div>
	);
}

function WorkRow({ item }: { readonly item: WorkItem }) {
	return (
		<article
			className={cn(panelRowClass, 'grid-cols-[70px_minmax(0,1fr)_auto] max-[560px]:grid-cols-1')}
		>
			<div className={compactLabelClass}>{item.time}</div>
			<div>
				<strong className={rowTitleClass}>{item.label}</strong>
				<p className={mutedBodyClass}>
					{item.id} · {item.kind} · {item.place}
				</p>
			</div>
			<StatusBadge tone={item.tone}>{item.status}</StatusBadge>
		</article>
	);
}

function SignalRow({
	label,
	value,
	detail,
	tone,
}: {
	readonly label: string;
	readonly value: string;
	readonly detail: string;
	readonly tone: Tone;
}) {
	return (
		<div className={cn('rounded-lg border border-border/35 p-3.5', toneBackgroundClass(tone))}>
			<div>
				<strong className={rowTitleClass}>{label}</strong>
				<p className={mutedBodyClass}>{detail}</p>
			</div>
			<span className="font-extrabold text-primary">{value}</span>
		</div>
	);
}

function ChartBar({ label, value }: { readonly label: string; readonly value: number }) {
	return (
		<div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 text-[0.84rem] font-bold text-muted-foreground">
			<span>{label}</span>
			<div className="h-2.5 overflow-hidden rounded-full bg-muted">
				<i className="block h-full rounded-full bg-primary" style={{ inlineSize: `${value}%` }} />
			</div>
		</div>
	);
}

function TimelineItem({ title, detail }: { readonly title: string; readonly detail: string }) {
	return (
		<div className="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5">
			<span className="mt-1.5 size-2.5 rounded-full border-2 border-primary bg-card" />
			<div>
				<strong className={rowTitleClass}>{title}</strong>
				<p className={mutedBodyClass}>{detail}</p>
			</div>
		</div>
	);
}

function StatusBadge({
	tone,
	children,
}: {
	readonly tone: Tone;
	readonly children: React.ReactNode;
}) {
	const mappedTone: React.ComponentProps<typeof Badge>['tone'] =
		tone === 'attention'
			? 'warning'
			: tone === 'neutral'
				? 'neutral'
				: tone === 'success'
					? 'success'
					: tone === 'info'
						? 'info'
						: 'danger';

	return (
		<Badge variant="outline" tone={mappedTone}>
			{children}
		</Badge>
	);
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
	return (
		<div className="grid gap-1 rounded-lg border border-border/35 bg-card/78 p-3">
			<span className={compactLabelClass}>{label}</span>
			<strong className="text-[0.9rem]">{value}</strong>
		</div>
	);
}

function GroupRow({
	name,
	status,
	members,
	equipment,
}: {
	readonly name: string;
	readonly status: string;
	readonly members: string;
	readonly equipment: string;
}) {
	return (
		<article className="flex items-center justify-between gap-4 rounded-lg border border-border/35 bg-card/78 p-3.5">
			<div>
				<strong className={rowTitleClass}>{name}</strong>
				<p className={mutedBodyClass}>{members}</p>
			</div>
			<StatusBadge tone={status === 'Available' ? 'success' : 'info'}>{status}</StatusBadge>
			<span className="text-[0.86rem] text-muted-foreground">{equipment}</span>
		</article>
	);
}

function RouteStop({
	index,
	title,
	detail,
}: {
	readonly index: string;
	readonly title: string;
	readonly detail: string;
}) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-lg border border-border/35 bg-muted/65 p-3.5">
			<span className="inline-grid size-7 place-items-center rounded-full bg-primary font-extrabold text-primary-foreground">
				{index}
			</span>
			<div>
				<strong className={rowTitleClass}>{title}</strong>
				<p className={mutedBodyClass}>{detail}</p>
			</div>
			<Button type="button" variant="outline" size="sm">
				Move
			</Button>
		</div>
	);
}

function StepperItem({
	active = false,
	children,
}: {
	readonly active?: boolean;
	readonly children: React.ReactNode;
}) {
	return (
		<span
			className={cn(
				'rounded-md bg-muted px-2.5 py-2 text-center text-[0.8rem] font-bold text-muted-foreground',
				active &&
					'border border-primary/20 bg-[color-mix(in_oklch,var(--simmer-green-100)_62%,var(--card))] text-primary',
			)}
		>
			{children}
		</span>
	);
}

function MapPanel({
	title,
	variant = 'default',
}: {
	readonly title: string;
	readonly variant?: 'default' | 'detail' | 'form';
}) {
	return (
		<section
			className="grid min-w-0 grid-rows-[auto_minmax(360px,1fr)_auto] overflow-hidden rounded-lg border border-border/35 bg-card/92 max-[1120px]:min-h-[560px]"
			data-variant={variant}
			aria-label={title}
		>
			<div className="flex items-center justify-between gap-4 px-4 py-3.5 shadow-[inset_0_-1px_color-mix(in_oklch,var(--border)_32%,transparent)]">
				<div>
					<p className="eyebrow">{title}</p>
					<strong>Precise operational overlays</strong>
				</div>
				<div className="flex gap-2">
					<Button type="button" variant="outline" size="sm">
						Layers
					</Button>
					<Button type="button" variant="outline" size="sm">
						Fit
					</Button>
				</div>
			</div>
			<div className="relative overflow-hidden bg-[linear-gradient(125deg,color-mix(in_oklch,var(--simmer-green-100)_56%,transparent),transparent_42%),color-mix(in_oklch,var(--simmer-workshop-map-wash)_52%,var(--card))]">
				<div className="absolute inset-0 bg-[linear-gradient(var(--simmer-workshop-grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--simmer-workshop-grid-line)_1px,transparent_1px)] bg-size-[36px_36px]" />
				<div className="absolute inset-[13%_48%_45%_12%] rounded-[42%_58%_38%_62%] border border-[color-mix(in_oklch,var(--simmer-green-700)_34%,transparent)] bg-[color-mix(in_oklch,var(--simmer-yellow-100)_24%,transparent)]" />
				<div className="absolute inset-[42%_14%_14%_46%] rounded-[52%_36%_55%_44%] border border-[color-mix(in_oklch,var(--simmer-green-700)_34%,transparent)] bg-[color-mix(in_oklch,var(--simmer-yellow-100)_24%,transparent)]" />
				<div className="absolute top-[36%] left-[18%] h-1 w-[58%] origin-left rotate-17 rounded-full bg-(--map-route)" />
				<div className="absolute top-[58%] left-[28%] h-1 w-[44%] origin-left rotate-[-24deg] rounded-full bg-(--map-road)" />
				<div className="absolute top-[28%] left-[26%] grid size-[30px] place-items-center rounded-full border-[3px] border-card bg-primary text-[0.76rem] font-extrabold text-primary-foreground shadow-[0_10px_18px_color-mix(in_oklch,var(--foreground)_14%,transparent)]">
					<span>1</span>
				</div>
				<div className="absolute top-[54%] left-[58%] grid size-[30px] place-items-center rounded-full border-[3px] border-card bg-(--map-alert) text-[0.76rem] font-extrabold text-foreground shadow-[0_10px_18px_color-mix(in_oklch,var(--foreground)_14%,transparent)]">
					<span>2</span>
				</div>
				<div className="absolute top-[68%] left-[42%] grid size-[30px] place-items-center rounded-full border-[3px] border-card bg-(--simmer-blue) text-[0.76rem] font-extrabold text-primary-foreground shadow-[0_10px_18px_color-mix(in_oklch,var(--foreground)_14%,transparent)]">
					<span>3</span>
				</div>
				<div className="absolute right-[18px] bottom-[18px] max-w-[260px] rounded-md bg-[color-mix(in_oklch,var(--card)_92%,transparent)] p-3 shadow-[0_10px_22px_color-mix(in_oklch,var(--foreground)_8%,transparent)]">
					<strong className={rowTitleClass}>
						{variant === 'form' ? '3 mission items' : 'Selected context'}
					</strong>
					<p className={mutedBodyClass}>
						{variant === 'detail'
							? '2 habitats, 1 trap, 1 recent action'
							: 'Route and status overlays only'}
					</p>
				</div>
			</div>
			<div className="flex items-center justify-between gap-4 px-4 py-3.5 text-[0.8rem] font-bold text-muted-foreground shadow-[inset_0_1px_color-mix(in_oklch,var(--border)_32%,transparent)]">
				<span className="inline-flex items-center gap-1.5">
					<i className="inline-block size-2.5 rounded-full bg-primary" /> Work item
				</span>
				<span className="inline-flex items-center gap-1.5">
					<i className="inline-block size-2.5 rounded-full bg-(--map-road)" /> Route
				</span>
				<span className="inline-flex items-center gap-1.5">
					<i className="inline-block size-2.5 rounded-full bg-(--map-alert)" /> Attention
				</span>
			</div>
		</section>
	);
}

function initialsFor(name: string): string {
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');

	return initials.length === 0 ? 'SU' : initials;
}

function formatRole(role: string | null | undefined): string {
	if (role === null || role === undefined || role.trim() === '') {
		return 'Member';
	}

	return role
		.split(/[_-]/g)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}
