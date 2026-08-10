import {
	OutletSimpleLayout,
	useActiveShellLocation,
	useShell,
} from '@simmer-mosquito/ui-web/components/app-shell';
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
const operations: Elsewhere = {
	label: 'Operations',
	description: 'Requested control work, crew assignments, and dispatched missions',
	to: '/operations',
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
const addressBook: Elsewhere = {
	label: 'Address Book',
	description: 'Geocoded addresses shared across surveillance and control work',
	to: '/gis/addresses',
	icon: iconRegistry.actions.searchCheck.icon,
};
const regions: Elsewhere = {
	label: 'Regions',
	description: 'The boundaries the agency works and reports by',
	to: '/gis/regions',
	icon: iconRegistry.entities.region.icon,
};
const weatherStations: Elsewhere = {
	label: 'Weather Stations',
	description: 'Stations on the map, with the summaries recorded against each',
	to: '/gis/weather',
	icon: iconRegistry.domains.weather.icon,
};
const habitats: Elsewhere = {
	label: 'Habitats',
	description: 'The sites your agency inspects, on the map',
	to: '/larval-surveillance/habitats',
	icon: iconRegistry.generic.droplet.icon,
};
const inspections: Elsewhere = {
	label: 'Inspections',
	description: 'What crews found at a habitat, by date and density',
	to: '/larval-surveillance/inspections',
	icon: iconRegistry.entities.inspection.icon,
};
const samples: Elsewhere = {
	label: 'Samples',
	description: 'Larvae taken for identification, and what came back',
	to: '/larval-surveillance/samples',
	icon: iconRegistry.entities.sample.icon,
};
const traps: Elsewhere = {
	label: 'Traps',
	description: 'Trap sites and their collection methods, on the map',
	to: '/adult-surveillance/traps',
	icon: iconRegistry.entities.trap.icon,
};
const applications: Elsewhere = {
	label: 'Applications',
	description: 'Product, amount, and method for every treatment logged',
	to: '/control-operations/chemical',
	icon: iconRegistry.entities.application.icon,
};
const sourceReduction: Elsewhere = {
	label: 'Source Reduction',
	description: 'Sources eliminated, by method and technician',
	to: '/control-operations/source-reduction',
	icon: iconRegistry.entities.sourceReductionAction.icon,
};
const biocontrol: Elsewhere = {
	label: 'Biocontrol',
	description: 'Releases logged by method, amount, and site',
	to: '/control-operations/biocontrol',
	icon: iconRegistry.entities.biocontrolAction.icon,
};
const outreach: Elsewhere = {
	label: 'Outreach',
	description: 'Outreach actions and the reach recorded against each',
	to: '/public-engagement/outreach',
	icon: iconRegistry.entities.outreachAction.icon,
};
const habitatTypes: Elsewhere = {
	label: 'Habitat Types',
	description: 'The types habitats are classified under',
	to: '/larval-surveillance/habitats/types',
	icon: iconRegistry.generic.component.icon,
};
const collectionMethods: Elsewhere = {
	label: 'Collection Methods',
	description: 'The trap types your agency runs',
	to: '/adult-surveillance/collection-methods',
	icon: iconRegistry.generic.component.icon,
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
		elsewhere: [operations, serviceRequests, larvalOverview],
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
	'/gis/addresses/cleanup': {
		title: 'Cleanup Tools',
		summary:
			'Resolving the duplicates an address book accumulates. Imports create rows rather than matching them, and a collector entering a record can add an address that already exists, so the same place ends up in the book more than once.',
		willLand: [
			'Addresses that share a display name or sit on the same spot, grouped for review',
			'Merge that re-points every record onto the surviving address and carries its comments and tags across',
			'Addresses no record references any more, listed so they can be removed',
		],
		elsewhere: [addressBook, regions, larvalOverview],
	},
	'/larval-surveillance/habitats/stats': {
		title: 'Habitat Statistics',
		summary:
			'What your habitats have produced across a season: which sites come back positive, which types they belong to, and how often each has been visited.',
		willLand: [
			'Breeding frequency per habitat and per habitat type across a season',
			'Inspection coverage, including sites nothing has been logged against',
			'Habitats ranked by how often larvae were found, with the map beside the list',
		],
		elsewhere: [habitats, inspections, habitatTypes],
	},
	'/larval-surveillance/inspections/stats': {
		title: 'Inspection Statistics',
		summary:
			'Inspection effort and what it turned up: how many were logged, how many held water, and how many found larvae.',
		willLand: [
			'Wet, dry, and larvae-positive counts trended across the season',
			'Density mix per habitat type and per region',
			'Inspections logged per inspector over a reporting period',
		],
		elsewhere: [inspections, habitats, samples],
	},
	'/larval-surveillance/samples/stats': {
		title: 'Sample Statistics',
		summary:
			'What identification returned: which species your samples held, and how long the results took to come back.',
		willLand: [
			'Species composition across identified samples, by region and season',
			'Samples still awaiting identification, and how long they have waited',
			'Non-mosquito findings separated from the species counts',
		],
		elsewhere: [samples, inspections, habitats],
	},
	'/adult-surveillance/traps/stats': {
		title: 'Trap Statistics',
		summary:
			'Trap effort and yield: how many nights each trap ran, what it caught, and which sites are carrying the program.',
		willLand: [
			'Catch per trap night, per trap and per collection method',
			'Trap nights and problem collections over a reporting period',
			'Traps compared across regions and across seasons',
		],
		elsewhere: [traps, collections, trapRoutes],
	},
	'/adult-surveillance/collections/stats': {
		title: 'Collection Statistics',
		summary:
			'Species abundance across your collections: what came out of the traps, in what numbers, and when.',
		willLand: [
			'Species composition and abundance trended by week and by season',
			'Abundance per trap night, so effort and catch are read together',
			'Regions and collection methods compared over the same period',
		],
		elsewhere: [collections, traps, collectionMethods],
	},
	'/control-operations/chemical/stats': {
		title: 'Chemical Application Statistics',
		summary:
			'What was applied and where: product usage, method mix, and treated area across a season.',
		willLand: [
			'Product usage by active ingredient, in a single unit across the season',
			'Method mix — larvicide, adulticide, barrier — over a reporting period',
			'Applications per region, beside the surveillance that prompted them',
		],
		elsewhere: [applications, insecticides, controlOverview],
	},
	'/control-operations/source-reduction/stats': {
		title: 'Source Reduction Statistics',
		summary: 'Sources eliminated over a season, by method, by technician, and by region.',
		willLand: [
			'Sources eliminated trended across the season, in a single unit',
			'Method mix and crew effort over a reporting period',
			'Habitats worked most often, and what inspections found afterwards',
		],
		elsewhere: [sourceReduction, habitats, controlOverview],
	},
	'/control-operations/biocontrol/stats': {
		title: 'Biocontrol Statistics',
		summary: 'Releases logged over a season: how much went out, by which method, and where.',
		willLand: [
			'Release volumes trended across the season, in a single unit',
			'Method mix and the sites released into',
			'Releases beside the inspections logged at the same habitats afterwards',
		],
		elsewhere: [biocontrol, habitats, controlOverview],
	},
	'/public-engagement/outreach/stats': {
		title: 'Outreach Statistics',
		summary: 'Outreach effort and the reach recorded against it, across a season.',
		willLand: [
			'Reach trended by week and by season, per outreach method',
			'Actions and reach per region over a reporting period',
			'Outreach beside the service requests logged in the same areas',
		],
		elsewhere: [outreach, serviceRequests, regions],
	},
	'/gis/weather/stats': {
		title: 'Weather Statistics',
		summary:
			'What the summaries recorded against your stations add up to across a season, and how they line up with the surveillance recorded over the same weeks.',
		willLand: [
			'Temperature, precipitation, humidity, and wind trended across the season for a station',
			'Stations compared over the same reporting periods',
			'Weather beside the collections and inspections logged in those weeks',
		],
		elsewhere: [weatherStations, adultOverview, larvalOverview],
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
	const { domain, item } = useActiveShellLocation();
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
