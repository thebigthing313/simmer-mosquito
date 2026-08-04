import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from '@simmer-mosquito/ui-web/components/ui/item';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link, type LinkProps } from '@tanstack/react-router';
import { resolveActive } from './navigation';
import { OutletSimpleLayout } from './outlet/simple-layout';
import { useShell } from './shell-context';

type RegistryIcon = typeof iconRegistry.generic.component.icon;

interface Elsewhere {
	readonly label: string;
	readonly description: string;
	readonly to: NonNullable<LinkProps['to']>;
	readonly icon: RegistryIcon;
}

interface UpcomingContent {
	readonly title: string;
	/** One sentence, in domain vocabulary, on what this section is for. */
	readonly summary: string;
	/** Concrete capabilities, not marketing. Three is usually enough. */
	readonly willLand: readonly string[];
	/** Built routes that cover adjacent ground today. Never link another stub. */
	readonly elsewhere: readonly Elsewhere[];
}

const larvalOverview: Elsewhere = {
	label: 'Larval Surveillance',
	description: 'Habitats, inspections, and samples',
	to: '/larval-surveillance',
	icon: iconRegistry.domains.larvalSurveillance.icon,
};
const adultOverview: Elsewhere = {
	label: 'Adult Surveillance',
	description: 'Traps and collections',
	to: '/adult-surveillance',
	icon: iconRegistry.domains.adultSurveillance.icon,
};
const controlOverview: Elsewhere = {
	label: 'Control Operations',
	description: 'Chemical, source reduction, and biocontrol work',
	to: '/control-operations',
	icon: iconRegistry.domains.controlOperations.icon,
};
const serviceRequests: Elsewhere = {
	label: 'Service Requests',
	description: 'Requests from the public, on the map',
	to: '/public-engagement/service-requests',
	icon: iconRegistry.entities.serviceRequest.icon,
};
const trapRoutes: Elsewhere = {
	label: 'Trap Routes',
	description: 'Ordered trap runs crews already work from',
	to: '/adult-surveillance/traps/routes',
	icon: iconRegistry.entities.route.icon,
};
const habitatRoutes: Elsewhere = {
	label: 'Habitat Routes',
	description: 'Ordered habitat runs crews already work from',
	to: '/larval-surveillance/habitats/routes',
	icon: iconRegistry.entities.route.icon,
};
const assignments: Elsewhere = {
	label: 'Assignments',
	description: 'Ordered worklists crews already work from',
	to: '/operations/assignments',
	icon: iconRegistry.entities.vehicle.icon,
};
const collections: Elsewhere = {
	label: 'Collections',
	description: 'What your traps caught, by species and trap night',
	to: '/adult-surveillance/collections',
	icon: iconRegistry.domains.adultSurveillance.icon,
};
const insecticides: Elsewhere = {
	label: 'Insecticides',
	description: 'Products, active ingredients, and the lots crews draw from',
	to: '/control-operations/chemical/insecticides',
	icon: iconRegistry.entities.insecticide.icon,
};

/**
 * Per-route copy for the sections that are wired but not built.
 *
 * Every entry is written from the domain docs rather than invented — the two
 * surveillance entries from the AMCA IMM chapters they implement — and
 * `elsewhere` only ever points at routes that actually exist. Linking one
 * unbuilt section to another is how a placeholder becomes a maze.
 */
const CONTENT: Readonly<Record<string, UpcomingContent>> = {
	'/': {
		title: 'Dashboard',
		summary:
			'A single view of where agency work stands: recent field activity, records that need a decision, and the operational picture across surveillance and control.',
		willLand: [
			'Cross-domain activity for the current period',
			'Records flagged for attention, each linking straight to the record',
			'Entry points into the day’s work without hunting through domains',
		],
		elsewhere: [larvalOverview, adultOverview, controlOverview],
	},
	'/today': {
		title: 'Today',
		summary:
			'The day’s operational picture: what is scheduled, what is outstanding, and what needs a decision before crews go out.',
		willLand: [
			'Today’s scheduled missions and assignments',
			'Open service requests awaiting triage',
			'Field records logged since the last shift',
		],
		elsewhere: [serviceRequests, larvalOverview, adultOverview],
	},
	'/operations/missions': {
		title: 'Missions',
		summary:
			'Planned dispatch work: an ordered set of stops, a responsible crew lead, and a lifecycle that runs from scheduled through completed.',
		willLand: [
			'Missions built from requested control actions or existing field records',
			'Ordered mission items, each carrying its own progress',
			'Provenance from a planned stop to the control action actually performed',
		],
		elsewhere: [assignments, habitatRoutes, controlOverview],
	},
	'/operations/requests-for-control': {
		title: 'Requests for Control',
		summary:
			'Control work that has been requested but not yet performed — the queue missions draw their stops from.',
		willLand: [
			'Requests raised from a service request, inspection, or collection',
			'Status tracked from raised, through scheduled, to performed',
			'Sourcing mission items directly from an open request',
		],
		elsewhere: [serviceRequests, controlOverview, larvalOverview],
	},
	'/adult-surveillance/arbovirus-surveillance': {
		title: 'Arbovirus Surveillance',
		summary:
			'Testing the environment for arboviruses: mosquito pools, sentinel flocks, dead birds, and the results that come back.',
		willLand: [
			'Mosquito pools sorted by species, trap location, and collection date, tracked from submission through laboratory result',
			'Infection rate and vector index calculated against the trap nights the pool came from',
			'Positive detections on the map beside the collections and habitats that produced them',
		],
		elsewhere: [collections, adultOverview, trapRoutes],
	},
	'/control-operations/resistance-monitoring': {
		title: 'Resistance Monitoring',
		summary:
			'Susceptibility testing for local mosquito populations, tracked by active ingredient and season.',
		willLand: [
			'Bottle bioassay results per population and active ingredient, with concentration, diagnostic time, and percent mortality',
			'Susceptibility trended across seasons and regions',
			'Product rotation informed by which active ingredients still perform locally',
		],
		elsewhere: [insecticides, controlOverview, adultOverview],
	},
};

const UpcomingIcon = iconRegistry.generic.compass.icon;
const WillLandIcon = iconRegistry.actions.check.icon;

/**
 * The page a wired-but-unbuilt section renders.
 *
 * It replaces a placeholder that said only "this workspace isn't built yet",
 * which was honest but left the operator at a dead end with no idea whether the
 * section was coming, what it would do, or where to go instead. This one keeps
 * the honesty and answers those three questions — the third being the point,
 * since most of these sections have adjacent ground that *is* built.
 *
 * Deliberately not a preview: no sample metrics, no skeleton of a screen that
 * does not exist. Faking the feature is worse than naming its absence.
 */
export function UpcomingPage({ title }: { readonly title?: string }) {
	const { activePath } = useShell();
	const { domain, item } = resolveActive(activePath);
	const content = CONTENT[activePath];
	const heading = content?.title ?? title ?? item?.label ?? domain.label;

	return (
		<OutletSimpleLayout>
			<div className="mx-auto grid max-w-[46rem] content-start gap-8 py-6">
				<header className="grid justify-items-start gap-3">
					<Badge variant="secondary">
						<UpcomingIcon aria-hidden="true" />
						Upcoming
					</Badge>
					<h1 className="m-0 text-balance font-bold text-2xl text-foreground leading-tight">
						{heading}
					</h1>
					<p className="m-0 max-w-[68ch] text-base text-muted-foreground leading-[var(--leading-body)]">
						{content?.summary ??
							`The shell, navigation, and routing are wired. The ${heading.toLowerCase()} screen will land here.`}
					</p>
				</header>

				{content === undefined ? null : (
					<section className="grid gap-3">
						<h2 className="m-0 font-semibold text-foreground text-sm">What will land here</h2>
						<ul className="m-0 grid list-none gap-2.5 p-0">
							{content.willLand.map((capability) => (
								<li
									className="flex items-start gap-2.5 text-muted-foreground text-sm"
									key={capability}
								>
									<WillLandIcon
										aria-hidden="true"
										className="mt-0.5 size-4 shrink-0 text-primary"
									/>
									<span className="leading-[var(--leading-body)]">{capability}</span>
								</li>
							))}
						</ul>
					</section>
				)}

				{content === undefined || content.elsewhere.length === 0 ? null : (
					<section className="grid gap-3">
						<h2 className="m-0 font-semibold text-foreground text-sm">
							Where to work in the meantime
						</h2>
						<ItemGroup className="gap-2">
							{content.elsewhere.map((destination) => {
								const DestinationIcon = destination.icon;
								return (
									<Item asChild key={destination.label} variant="outline">
										<Link to={destination.to}>
											<ItemMedia variant="icon">
												<DestinationIcon aria-hidden="true" />
											</ItemMedia>
											<ItemContent>
												<ItemTitle>{destination.label}</ItemTitle>
												<ItemDescription>{destination.description}</ItemDescription>
											</ItemContent>
										</Link>
									</Item>
								);
							})}
						</ItemGroup>
					</section>
				)}
			</div>
		</OutletSimpleLayout>
	);
}
