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
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link, Outlet, useLocation, useParams } from '@tanstack/react-router';
import type React from 'react';
import { type AuthMe, getServerUrl } from '../auth';
import { useCollectionRows } from '../sync/useCollectionRows';
import { webCollections } from '../sync/webCollections';

type Tone = 'neutral' | 'attention' | 'success' | 'info' | 'danger';

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

export function RootLayout({ auth }: { readonly auth: AuthMe | null }) {
	const localIdentity = auth?.authenticated === true ? auth.localIdentity : null;
	const user = auth?.authenticated === true ? auth.user : null;
	const { rows: organizations, status: organizationStatus } = useCollectionRows(
		webCollections.currentOrganization,
	);
	const { rows: profiles, status: profileStatus } = useCollectionRows(webCollections.profiles);
	const organization = organizations.find((row) => row.id === localIdentity?.organizationId);
	const profile = profiles.find((row) => row.id === localIdentity?.profileId);
	const organizationName =
		organization?.name ?? localIdentity?.organizationName ?? 'Selected organization';
	const profileName = profile?.displayName ?? user?.displayName ?? 'SIMMER User';
	const roleLabel = formatRole(localIdentity?.role);
	const liveStatus =
		organizationStatus === 'ready' && profileStatus === 'ready' ? 'Live' : 'Updating';

	return (
		<SidebarProvider className="app-frame">
			<ProductSidebar />
			<SidebarInset className="app-main">
				<header className="top-strip">
					<div className="top-strip-heading">
						<div>
							<p className="eyebrow">{organizationName}</p>
							<p className="top-strip-title">Operations workspace</p>
						</div>
						<div className="top-strip-context">
							<span>{roleLabel}</span>
							<span>{liveStatus}</span>
						</div>
					</div>
					<div className="top-strip-actions">
						<div className="header-date">
							<span>Organization</span>
							<strong>
								{organization?.slug ??
									localIdentity?.organizationSlug ??
									localIdentity?.organizationId ??
									'Loading'}
							</strong>
						</div>
						<div className="header-user">
							<Avatar size="sm" className="header-avatar">
								<AvatarFallback>{initialsFor(profileName)}</AvatarFallback>
								<AvatarBadge />
							</Avatar>
							<div>
								<strong>{profileName}</strong>
								<span>{roleLabel}</span>
							</div>
						</div>
					</div>
				</header>
				<ScrollArea className="route-scroll-area">
					<div className="route-stage">
						<Outlet />
					</div>
				</ScrollArea>
			</SidebarInset>
		</SidebarProvider>
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
		<div className="landing-page">
			<section className="landing-panel">
				<span className="brand-mark">S</span>
				<p className="eyebrow">SIMMER</p>
				<h1>Mosquito control operations, grounded in the map.</h1>
				<p>
					Sign in to manage surveillance, field work, public engagement, control operations, and
					organization setup from one operational workspace.
				</p>
				{authReason === 'organization_required' ? (
					<div className="landing-alert">
						<strong>Organization access needed</strong>
						<p>
							Your account is signed in, but no active SIMMER organization membership is selected.
						</p>
					</div>
				) : null}
				<div className="landing-actions">
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
		<Sidebar className="app-sidebar" collapsible="none" aria-label="Primary">
			<SidebarHeader className="app-sidebar-header">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild size="lg" tooltip="SIMMER">
							<Link className="brand-lockup" to="/">
								<img src="/favicon.svg" alt="" className="brand-favicon" />
								<span>SIMMER</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<ScrollArea className="sidebar-scroll-area">
				<SidebarContent
					className="sidebar-content flex-none gap-0 overflow-visible px-2 pb-2"
					role="navigation"
					aria-label="Primary navigation"
				>
					{navigationGroups.map((group) => (
						<SidebarGroup className="gap-1 px-1 py-1.5" key={group.label}>
							<SidebarGroupLabel className="sidebar-domain-label">{group.label}</SidebarGroupLabel>
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
													className="sidebar-item-link"
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
				<div className="sidebar-footer-note">
					<p className="eyebrow">Pattern reserves</p>
					<p>Atlas details and planning grids are preserved for records, routes, and scheduling.</p>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}

export function DashboardPage() {
	return (
		<div className="dashboard-page">
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

			<section className="overview-grid" aria-label="Operational overview">
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

			<div className="dashboard-grid">
				<Surface className="span-7">
					<SectionHeader
						title="Today’s activities"
						meta="Click through for spatial focus"
						action={<Link to="/today">View mapped route</Link>}
					/>
					<div className="activity-list">
						{todayWork.map((item) => (
							<WorkRow item={item} key={item.id} />
						))}
					</div>
				</Surface>

				<Surface className="span-5">
					<SectionHeader title="Threshold signals" meta="Weather and surveillance" />
					<div className="signal-stack">
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

				<Surface className="span-4">
					<SectionHeader title="Pending operations" meta="Needs commitment" />
					<div className="compact-chart" role="img" aria-label="Pending operations by type">
						<ChartBar label="Requests" value={80} />
						<ChartBar label="Missions" value={56} />
						<ChartBar label="Inspections" value={72} />
						<ChartBar label="Applications" value={34} />
					</div>
				</Surface>

				<Surface className="span-8">
					<SectionHeader title="Dispatch notes" meta="Recent command outcomes" />
					<div className="timeline">
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
		<div className="map-workspace">
			<section className="map-sidebar-panel">
				<PageHeader
					kicker="Focused dashboard with map"
					title="Today’s activities"
					body="This route has one spatial question: where is today’s work, what is next, and what needs intervention?"
				/>
				<div className="filter-strip">
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
				<div className="activity-list map-list">
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
		<div className="index-page">
			<PageHeader
				kicker="Entity index"
				title="Service requests"
				body="The index is built for scanning, filtering, and triage. It avoids rendering a map until a request or focused view needs spatial context."
				action={<Button type="button">New request</Button>}
			/>
			<Surface>
				<div className="index-toolbar">
					<div className="filter-strip">
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
					<Field className="search-field">
						<FieldLabel>Search</FieldLabel>
						<Input defaultValue="" placeholder="Address, contact, request id" />
					</Field>
				</div>

				<div className="request-table">
					<div className="request-table-head">
						<span>Request</span>
						<span>Status</span>
						<span>Context</span>
					</div>
					{requests.map((request) => (
						<Link
							className="request-row"
							key={request.id}
							to="/service-requests/$requestId"
							params={{ requestId: request.id }}
						>
							<div>
								<strong>{request.title}</strong>
								<p>
									{request.id} · {request.address} · {request.received}
								</p>
							</div>
							<div className="row-status">
								<StatusBadge tone={request.tone}>{request.status}</StatusBadge>
								<span>{request.priority} priority</span>
							</div>
							<p>{request.nearby}</p>
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
		<div className="detail-map-page">
			<section className="detail-record">
				<Link className="back-link" to="/service-requests">
					Back to requests
				</Link>
				<PageHeader
					kicker="Detail page with map"
					title={request.title}
					body={`${request.id} at ${request.address}. Location, nearby records, and history are now the job, so the map is rendered here.`}
					action={<Button type="button">Create assignment</Button>}
				/>
				<div className="record-facts">
					<Fact label="Status" value={request.status} />
					<Fact label="Intake" value={request.source} />
					<Fact label="Priority" value={request.priority} />
					<Fact label="Nearby" value="2 habitats, 1 trap" />
				</div>
				<Surface>
					<SectionHeader title="Record history" meta="Command-shaped activity" />
					<div className="timeline">
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
		<div className="groups-page">
			<PageHeader
				kicker="Group management"
				title="Crews and operational groups"
				body="Configuration pages stay compact and map-free. They manage trust in the workflow: people, roles, methods, equipment, and lookup records."
				action={<Button type="button">Create crew</Button>}
			/>
			<div className="management-grid">
				<Surface className="span-7">
					<SectionHeader title="Crews" meta="Assignment-ready groups" />
					<div className="crew-list">
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
				<Surface className="span-5">
					<SectionHeader title="Lookup health" meta="Setup affects field confidence" />
					<div className="signal-stack">
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
		<div className="form-page">
			<PageHeader
				kicker="Edit form"
				title="Schedule larval inspection mission"
				body="Forms are focused command builders. The map appears only when the command needs location or route geometry."
			/>
			<section className="form-shell">
				<div className="form-main">
					<div className="form-stepper">
						<span className="complete">Details</span>
						<span className="active">Stops</span>
						<span>Resources</span>
						<span>Review</span>
					</div>
					<FieldGroup className="field-grid">
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
					<section className="route-builder">
						<SectionHeader title="Mission items" meta="Planning Grid pattern reserve" />
						<RouteStop index="1" title="18 Maple Court" detail="Service request SR-1048" />
						<RouteStop
							index="2"
							title="Cedar Industrial Park"
							detail="Habitat HT-884, breeding positive"
						/>
						<RouteStop index="3" title="North canal access" detail="Ad hoc inspection location" />
					</section>
					<div className="command-summary">
						<strong>missionDispatch.createMission</strong>
						<p>
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
		<div className="index-page">
			<PageHeader
				kicker={kicker}
				title={title}
				body={body}
				action={<Button type="button">New record</Button>}
			/>
			<Surface>
				<SectionHeader title="Mock records" meta="Database wiring comes later" />
				<div className="stub-list">
					{items.map((item) => (
						<article className="stub-row" key={item.label}>
							<div>
								<strong>{item.label}</strong>
								<p>{item.detail}</p>
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
		<div className="login-page">
			<section className="login-panel">
				<span className="brand-mark">S</span>
				<p className="eyebrow">SIMMER sign in</p>
				<h1>Continue to your operations workspace</h1>
				<p>
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
		<Card className={className}>
			<CardContent className="surface-content">{children}</CardContent>
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
		<header className="page-header">
			<div>
				<p className="eyebrow">{kicker}</p>
				<h1>{title}</h1>
				<p>{body}</p>
			</div>
			{action === undefined ? null : <div className="page-action">{action}</div>}
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
		<div className="summary-tile" data-tone={tone}>
			<span>{label}</span>
			<strong>{value}</strong>
			<p>{detail}</p>
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
		<div className="section-header">
			<div>
				<h2>{title}</h2>
				{meta === undefined ? null : <p>{meta}</p>}
			</div>
			{action === undefined ? null : <div className="section-action">{action}</div>}
		</div>
	);
}

function WorkRow({ item }: { readonly item: WorkItem }) {
	return (
		<article className="work-row">
			<div className="work-time">{item.time}</div>
			<div>
				<strong>{item.label}</strong>
				<p>
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
		<div className="signal-row" data-tone={tone}>
			<div>
				<strong>{label}</strong>
				<p>{detail}</p>
			</div>
			<span>{value}</span>
		</div>
	);
}

function ChartBar({ label, value }: { readonly label: string; readonly value: number }) {
	return (
		<div className="chart-row">
			<span>{label}</span>
			<div>
				<i style={{ inlineSize: `${value}%` }} />
			</div>
		</div>
	);
}

function TimelineItem({ title, detail }: { readonly title: string; readonly detail: string }) {
	return (
		<div className="timeline-item">
			<span />
			<div>
				<strong>{title}</strong>
				<p>{detail}</p>
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
		<div className="fact">
			<span>{label}</span>
			<strong>{value}</strong>
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
		<article className="group-row">
			<div>
				<strong>{name}</strong>
				<p>{members}</p>
			</div>
			<StatusBadge tone={status === 'Available' ? 'success' : 'info'}>{status}</StatusBadge>
			<span>{equipment}</span>
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
		<div className="route-stop">
			<span>{index}</span>
			<div>
				<strong>{title}</strong>
				<p>{detail}</p>
			</div>
			<Button type="button" variant="outline" size="sm">
				Move
			</Button>
		</div>
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
		<section className="map-panel" data-variant={variant} aria-label={title}>
			<div className="map-toolbar">
				<div>
					<p className="eyebrow">{title}</p>
					<strong>Precise operational overlays</strong>
				</div>
				<div className="map-tools">
					<Button type="button" variant="outline" size="sm">
						Layers
					</Button>
					<Button type="button" variant="outline" size="sm">
						Fit
					</Button>
				</div>
			</div>
			<div className="map-canvas">
				<div className="map-grid" />
				<div className="region region-a" />
				<div className="region region-b" />
				<div className="route-line route-one" />
				<div className="route-line route-two" />
				<div className="pin pin-a">
					<span>1</span>
				</div>
				<div className="pin pin-b">
					<span>2</span>
				</div>
				<div className="pin pin-c">
					<span>3</span>
				</div>
				<div className="map-callout">
					<strong>{variant === 'form' ? '3 mission items' : 'Selected context'}</strong>
					<p>
						{variant === 'detail'
							? '2 habitats, 1 trap, 1 recent action'
							: 'Route and status overlays only'}
					</p>
				</div>
			</div>
			<div className="map-legend">
				<span>
					<i className="legend-work" /> Work item
				</span>
				<span>
					<i className="legend-route" /> Route
				</span>
				<span>
					<i className="legend-alert" /> Attention
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
