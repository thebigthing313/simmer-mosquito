import type {
	ShellAccountLink,
	ShellDomain,
	ShellNavGroup,
	ShellNavItem,
	ShellStandalonePage,
} from '@simmer-mosquito/ui-web/components/app-shell';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { AuthMe } from '../../auth';
import { type RecordType, recordNoun } from '../../lib/record-nouns';
import { hasAtLeastRole } from '../../lib/write-access';
import { writeSurfaceFloor } from '../../lib/write-surfaces';
import type { SeedableTable } from '../search/search-seeds';

/**
 * A navigation item as web declares one.
 *
 * The shared shell knows nothing about roles — it draws whatever navigation it
 * is handed. Web's navigation is role-filtered before it gets there, and the
 * floor that filter reads is not a field on the item: it is looked up by `to`
 * in `lib/write-surfaces.ts`, which is the one place a write surface's floor is
 * written down. An item used to carry its own `write` value beside the role the
 * route named inline, and the two agreed on every surface where both existed
 * and said nothing at all on the three where neither did (#623).
 *
 * An item carries no `search` either, and that is deliberate. TanStack Router
 * drops the search params on a navigation that names none, so a click here lands
 * on the destination's defaults, which is what a move to a surface should mean.
 * Two surfaces over one record set that share a filter contract keep the filters
 * through a switch drawn on both of them instead; `components/explorer/surface-switch.tsx`
 * carries that rule, and the Inspections Map and Table are the pair it was
 * written for (#521).
 */
interface WebShellNavItem extends ShellNavItem {
	/**
	 * Extra words the palette matches this place by, never shown.
	 *
	 * The palette's haystack is the label and these, so a place whose label does
	 * not carry its own noun is unreachable by that noun. The Weather group's
	 * explorer is the case: its label is `Map`, like the other nine explorers,
	 * and only the group heading beside it says weather. An `action` carries
	 * keywords too, and putting them there instead would move this out of the
	 * route list and offer a page as a verb.
	 */
	readonly keywords?: readonly string[];

	/**
	 * This destination is a verb, not a place, and its presence is the whole
	 * declaration.
	 *
	 * An action is a *promotion* of a navigation item rather than a second
	 * registry. The item already carries the label, the icon and the typed `to`,
	 * and that `to` is what the register keys its floor by, which is the floor
	 * the route's own guard reads and the server's floor for the command the form
	 * sends. A separate registry would be a second copy of `to` in that chain,
	 * and the one that goes stale into a role-ladder bug.
	 *
	 * `keywords` are matched and never shown. They carry the verbs the label does
	 * not — `new`, `add`, `log`, `record` — and the domain synonyms for the noun.
	 * Without them the palette teaches one verb per surface.
	 */
	readonly action?: {
		readonly keywords: readonly string[];

		/**
		 * The form opens on a record of this table, chosen in a second step.
		 *
		 * Only where the route already reads a record id off its search params.
		 * `inspections-create` validates `habitatId` and `collections-create`
		 * validates `trapId`; both have been receiving one from a link since before
		 * the palette existed, which is why these two carry a seed and the other
		 * seventeen actions do not. Naming a table here without the matching search
		 * param would navigate to a form that drops it.
		 */
		readonly seedFrom?: SeedableTable;
	};
}

interface WebShellNavGroup extends ShellNavGroup {
	readonly items: readonly WebShellNavItem[];
}

/**
 * Web's domain type. Assignable to the shared {@link ShellDomain} — readonly
 * arrays are covariant, so the extra `write` rides along untouched into a shell
 * that never reads it.
 */
export interface WebShellDomain extends ShellDomain {
	readonly groups: readonly WebShellNavGroup[];
}

/**
 * The verb a create surface puts in front of a record type's name, one per
 * kind of record. `CONTEXT.md` carries the rule under Core language, and this
 * is that rule as a register, so a surface reads its verb rather than choosing
 * one.
 *
 * **Record** is work performed: an inspection, a collection, a control action.
 * It happened in the field and the form writes down what happened. **Create**
 * is a thing brought into existence, a root record with an `organization_id`
 * and no parent it cannot open without: a habitat, a trap, a request. **Add**
 * is a child attached to a parent that already exists, whose form cannot open
 * without the parent's id: samples under an inspection, a stop under a mission.
 * `New` is not used.
 *
 * Trap takes `Create` by the root-record test, and so does a weather station:
 * `/gis/weather/create` opens with no source and no parent, and the station is
 * placed on the map from nothing. A route is `Create` for the same reason, and
 * a registration is `Add` because it is drawn under the contact or address it
 * notifies. Four verbs named one act on `develop` before #949, `Create` on six
 * kinds, `Record` on five, `Add` on three and `New` on three, with Mission and
 * Assignment each carrying two on different surfaces.
 *
 * Every record type is in here, the kinds with no create surface included,
 * because the rule classifies the record and not the surface, and a
 * `Record<RecordType, CreateVerb>` is what lets the compiler refuse a kind
 * nobody has classified (#644).
 */
type CreateVerb = 'Record' | 'Create' | 'Add';

const CREATE_VERBS: Record<RecordType, CreateVerb> = {
	address: 'Create',
	application: 'Record',
	assignment: 'Create',
	biocontrolAction: 'Record',
	collection: 'Record',
	contact: 'Create',
	habitat: 'Create',
	inspection: 'Record',
	mission: 'Create',
	missionItem: 'Add',
	notificationRegistration: 'Add',
	outreachAction: 'Record',
	region: 'Create',
	requestedControlAction: 'Create',
	route: 'Create',
	sample: 'Add',
	serviceRequest: 'Create',
	sourceReduction: 'Record',
	trap: 'Create',
	weatherStation: 'Create',
};

/**
 * The label of a create surface: the record type's verb, then its full noun.
 * `Create Habitat`, `Record Inspection`.
 *
 * The noun comes from `RECORD_NOUNS` rather than being written here, so the
 * sidebar cannot spell a record type a second way. Four of these labels leaned
 * on the group heading above them instead of carrying the noun, and every one
 * of the four was a record type whose `CONTEXT.md` term is two words: `Record
 * Application` under `Chemical`, `Record Release` under `Biocontrol`, `Record
 * Outreach` under `Outreach Actions` and `New Request` under `Service
 * Requests`. Read on its own, in the palette or on a narrow rail where the
 * heading is not beside it, each named nothing in particular, and `Record
 * Application` was landing on a page headed `Record Chemical Application`
 * (#910).
 *
 * The verb comes from {@link CREATE_VERBS} rather than the call site since
 * #949. It used to be the entry's own word, and the eight explorer headers
 * and the map's context menu each carried their own copy of it, agreeing with
 * the sidebar by copy rather than by mechanism: `Create Inspection` in the
 * sidebar over a page headed `Record Inspection`, `Add Station` in a header
 * over a page headed `Add Weather Station`. Now the sidebar entry, the header
 * control, the empty state that points at it, the map menu item and the page
 * title all call this and read one string. It is exported for that reason.
 *
 * Three entries want the plural rather than the singular and read `titleMany`
 * through {@link createPluralLabel}: `Import Regions`, and the two cleanup
 * tools. The cleanup pair both said `Cleanup Tools` until #948, one name on two
 * entries in two different groups, so the palette listed the same words twice
 * and neither said which records it tidied. Their verbs are not create verbs,
 * so they stay the call site's word.
 */
export function createLabel(recordType: RecordType): string {
	return `${CREATE_VERBS[recordType]} ${recordNoun(recordType).title}`;
}

/** The same label over a record type's title-cased plural: `Import Regions`. */
function createPluralLabel(verb: string, recordType: RecordType): string {
	return `${verb} ${recordNoun(recordType).titleMany}`;
}

/**
 * An entry that names a list of records and nothing else: `Habitats`.
 *
 * The verb helpers above put the call site's own word in front of a register
 * form. This is the same read with no word in front, for the group headings and
 * the list entries under them, which name the records themselves. It is a
 * function rather than a bare `recordNoun(...).titleMany` at each of the fifteen
 * so that the three shapes a sidebar label takes read as three named ideas.
 */
function listLabel(recordType: RecordType): string {
	return recordNoun(recordType).titleMany;
}

/**
 * The product's operational domains, expressed fresh from the SIMMER domain
 * vocabulary. Each domain is one icon in the primary rail; its groups populate
 * the secondary sidebar. Paths point at the live route table.
 *
 * Each `summary` names what the domain covers in integrated mosquito management
 * vocabulary. Keep them descriptive: the reader is a mosquito control
 * professional, so a summary states what is here, never why it matters or how
 * the work should be done.
 */
export const webShellDomains: readonly WebShellDomain[] = [
	{
		id: 'overview',
		label: 'Overview',
		summary: 'Where the program stands today',
		icon: iconRegistry.generic.component.icon,
		groups: [
			{
				id: 'overview-main',
				items: [
					{
						id: 'today',
						label: 'Today',
						to: '/today',
						stub: true,
						icon: iconRegistry.simmer.fieldWork.icon,
					},
					{
						id: 'dashboard',
						label: 'Dashboard',
						to: '/',
						stub: true,
						icon: iconRegistry.generic.component.icon,
					},
				],
			},
		],
	},
	{
		id: 'larval',
		label: 'Larval Surveillance',
		summary: 'Egg, larval, and pupal surveillance across your habitats',
		icon: iconRegistry.domains.larvalSurveillance.icon,
		groups: [
			{
				id: 'larval-overview',
				items: [
					{
						id: 'larval-overview-link',
						label: 'Overview',
						to: '/larval-surveillance',
						icon: iconRegistry.generic.home.icon,
					},
				],
			},
			{
				id: 'larval-habitats',
				label: listLabel('habitat'),
				items: [
					{
						id: 'habitats-explorer',
						label: 'Map',
						to: '/larval-surveillance/habitats',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'habitats-create',
						label: createLabel('habitat'),
						to: '/larval-surveillance/habitats/create',
						icon: iconRegistry.actions.add.icon,
						// vocabulary-ignore site: a search keyword matches what a person types, not what SIMMER calls the record.
						action: { keywords: ['new', 'add', 'site', 'breeding', 'source', 'larval'] },
					},
					{
						id: 'habitats-types',
						label: 'Habitat Types',
						to: '/larval-surveillance/habitats/types',
						icon: iconRegistry.generic.component.icon,
					},
					{
						id: 'habitats-routes',
						label: 'Manage Routes',
						to: '/larval-surveillance/habitats/routes',
						icon: iconRegistry.entities.route.icon,
					},
					{
						id: 'habitats-stats',
						label: 'Statistics',
						to: '/larval-surveillance/habitats/stats',
						stub: true,
						icon: iconRegistry.generic.chart.icon,
					},
				],
			},
			{
				id: 'larval-inspections',
				label: listLabel('inspection'),
				items: [
					{
						id: 'inspections-explorer',
						label: 'Map',
						to: '/larval-surveillance/inspections',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'inspections-table',
						label: 'Table',
						to: '/larval-surveillance/inspections/table',
						icon: iconRegistry.generic.table.icon,
					},
					{
						id: 'inspections-create',
						label: createLabel('inspection'),
						to: '/larval-surveillance/inspections/create',
						icon: iconRegistry.actions.add.icon,
						action: {
							keywords: ['new', 'add', 'log', 'dip', 'larval', 'survey'],
							seedFrom: 'habitats',
						},
					},
					{
						id: 'inspections-stats',
						label: 'Statistics',
						to: '/larval-surveillance/inspections/stats',
						stub: true,
						icon: iconRegistry.generic.chart.icon,
					},
				],
			},
			{
				id: 'larval-samples',
				label: listLabel('sample'),
				items: [
					{
						id: 'samples-explorer',
						label: 'Map',
						to: '/larval-surveillance/samples',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'samples-stats',
						label: 'Statistics',
						to: '/larval-surveillance/samples/stats',
						stub: true,
						icon: iconRegistry.generic.chart.icon,
					},
				],
			},
		],
	},
	{
		id: 'adult',
		label: 'Adult Surveillance',
		summary: 'Trap collections, species composition, and abundance',
		icon: iconRegistry.domains.adultSurveillance.icon,
		groups: [
			{
				id: 'adult-overview',
				items: [
					{
						id: 'adult-overview-link',
						label: 'Overview',
						to: '/adult-surveillance',
						icon: iconRegistry.generic.home.icon,
					},
					{
						id: 'adult-collection-methods',
						label: 'Collection Methods',
						to: '/adult-surveillance/collection-methods',
						icon: iconRegistry.generic.component.icon,
					},
				],
			},
			{
				id: 'adult-traps',
				label: listLabel('trap'),
				items: [
					{
						id: 'traps-explorer',
						label: 'Map',
						to: '/adult-surveillance/traps',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'traps-directory',
						label: 'Directory',
						to: '/adult-surveillance/trap-directory',
						icon: iconRegistry.entities.trap.icon,
					},
					{
						id: 'traps-create',
						label: createLabel('trap'),
						to: '/adult-surveillance/traps/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'create', 'station', 'adult'] },
					},
					{
						id: 'traps-routes',
						label: 'Manage Routes',
						to: '/adult-surveillance/traps/routes',
						icon: iconRegistry.entities.route.icon,
					},
					{
						id: 'traps-stats',
						label: 'Statistics',
						to: '/adult-surveillance/traps/stats',
						stub: true,
						icon: iconRegistry.generic.chart.icon,
					},
				],
			},
			{
				id: 'adult-collections',
				label: listLabel('collection'),
				items: [
					{
						id: 'collections-explorer',
						label: 'Map',
						to: '/adult-surveillance/collections',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'collections-create',
						label: createLabel('collection'),
						to: '/adult-surveillance/collections/create',
						icon: iconRegistry.actions.add.icon,
						action: {
							keywords: ['new', 'add', 'log', 'catch', 'adult', 'trap'],
							seedFrom: 'traps',
						},
					},
					{
						id: 'collections-stats',
						label: 'Statistics',
						to: '/adult-surveillance/collections/stats',
						stub: true,
						icon: iconRegistry.generic.chart.icon,
					},
				],
			},
			{
				id: 'adult-arbovirus',
				label: 'Arbovirus',
				items: [
					{
						id: 'arbovirus-surveillance',
						label: 'Arbovirus Surveillance',
						to: '/adult-surveillance/arbovirus-surveillance',
						stub: true,
						icon: iconRegistry.generic.scanEye.icon,
					},
				],
			},
		],
	},
	{
		id: 'control',
		label: 'Control Operations',
		summary: 'Source reduction, biocontrol, and insecticide applications',
		icon: iconRegistry.domains.controlOperations.icon,
		groups: [
			{
				id: 'control-overview',
				items: [
					{
						id: 'control-overview-link',
						label: 'Overview',
						to: '/control-operations',
						icon: iconRegistry.generic.home.icon,
					},
				],
			},
			{
				id: 'control-chemical',
				label: listLabel('application'),
				items: [
					{
						id: 'chemical-explorer',
						label: 'Map',
						to: '/control-operations/chemical',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'chemical-create',
						label: createLabel('application'),
						to: '/control-operations/chemical/create',
						icon: iconRegistry.actions.add.icon,
						action: {
							keywords: ['new', 'add', 'log', 'spray', 'treatment', 'adulticide', 'larvicide'],
						},
					},
					{
						id: 'chemical-methods',
						label: 'Application Methods',
						to: '/control-operations/chemical/methods',
						icon: iconRegistry.generic.component.icon,
					},
					{
						id: 'chemical-insecticides',
						label: 'Insecticides',
						to: '/control-operations/chemical/insecticides',
						icon: iconRegistry.entities.insecticide.icon,
					},
					{
						id: 'chemical-formulations',
						label: 'Formulations',
						to: '/control-operations/chemical/formulations',
						icon: iconRegistry.entities.formulation.icon,
					},
					{
						id: 'chemical-stats',
						label: 'Statistics',
						to: '/control-operations/chemical/stats',
						stub: true,
						icon: iconRegistry.generic.chart.icon,
					},
				],
			},
			{
				id: 'control-source-reduction',
				label: listLabel('sourceReduction'),
				items: [
					{
						id: 'source-reduction-explorer',
						label: 'Map',
						to: '/control-operations/source-reduction',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'source-reduction-create',
						label: createLabel('sourceReduction'),
						to: '/control-operations/source-reduction/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'add', 'log', 'habitat', 'removal', 'drainage'] },
					},
					{
						id: 'source-reduction-methods',
						label: 'Source Reduction Methods',
						to: '/control-operations/source-reduction/methods',
						icon: iconRegistry.generic.component.icon,
					},
					{
						id: 'source-reduction-stats',
						label: 'Statistics',
						to: '/control-operations/source-reduction/stats',
						stub: true,
						icon: iconRegistry.generic.chart.icon,
					},
				],
			},
			{
				id: 'control-biocontrol',
				label: listLabel('biocontrolAction'),
				items: [
					{
						id: 'biocontrol-explorer',
						label: 'Map',
						to: '/control-operations/biocontrol',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'biocontrol-create',
						label: createLabel('biocontrolAction'),
						to: '/control-operations/biocontrol/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'add', 'log', 'fish', 'gambusia', 'stocking'] },
					},
					{
						id: 'biocontrol-methods',
						label: 'Biocontrol Methods',
						to: '/control-operations/biocontrol/methods',
						icon: iconRegistry.generic.component.icon,
					},
					{
						id: 'biocontrol-stats',
						label: 'Statistics',
						to: '/control-operations/biocontrol/stats',
						stub: true,
						icon: iconRegistry.generic.chart.icon,
					},
				],
			},
			{
				id: 'control-resistance',
				label: 'Resistance',
				items: [
					{
						id: 'resistance-monitoring',
						label: 'Resistance Monitoring',
						to: '/control-operations/resistance-monitoring',
						stub: true,
						icon: iconRegistry.entities.insecticide.icon,
					},
				],
			},
		],
	},
	{
		id: 'public',
		label: 'Public Engagement',
		summary: 'Service requests, outreach, and the contacts behind them',
		icon: iconRegistry.domains.publicEngagement.icon,
		groups: [
			{
				id: 'public-overview',
				items: [
					{
						id: 'public-overview-link',
						label: 'Overview',
						to: '/public-engagement',
						icon: iconRegistry.generic.home.icon,
					},
				],
			},
			{
				id: 'public-service-requests',
				label: listLabel('serviceRequest'),
				items: [
					{
						id: 'service-requests-explorer',
						label: 'Map',
						to: '/public-engagement/service-requests',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'service-requests-create',
						label: createLabel('serviceRequest'),
						to: '/public-engagement/service-requests/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'add', 'complaint', 'call', 'resident', 'public'] },
					},
				],
			},
			{
				id: 'public-outreach',
				label: listLabel('outreachAction'),
				items: [
					{
						id: 'outreach-explorer',
						label: 'Map',
						to: '/public-engagement/outreach',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'outreach-create',
						label: createLabel('outreachAction'),
						to: '/public-engagement/outreach/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'add', 'log', 'education', 'event', 'public'] },
					},
					{
						id: 'outreach-methods',
						label: 'Outreach Methods',
						to: '/public-engagement/outreach/methods',
						icon: iconRegistry.generic.component.icon,
					},
					{
						id: 'outreach-stats',
						label: 'Statistics',
						to: '/public-engagement/outreach/stats',
						stub: true,
						icon: iconRegistry.generic.chart.icon,
					},
				],
			},
			{
				id: 'public-contacts',
				label: listLabel('contact'),
				items: [
					{
						id: 'contacts-explorer',
						label: 'Directory',
						to: '/public-engagement/contacts',
						icon: iconRegistry.entities.organization.icon,
					},
					{
						id: 'contacts-create',
						label: createLabel('contact'),
						to: '/public-engagement/contacts/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'add', 'person', 'resident', 'caller'] },
					},
					{
						id: 'contacts-cleanup',
						label: createPluralLabel('Cleanup', 'contact'),
						to: '/public-engagement/contacts/cleanup',
						icon: iconRegistry.actions.merge.icon,
						action: { keywords: ['merge', 'duplicate', 'dedupe', 'combine', 'tidy'] },
					},
				],
			},
		],
	},
	{
		id: 'gis',
		label: 'GIS',
		// The reference geography the rest of the product points at, not a second
		// home for the records that carry it. Regions, addresses, and weather
		// stations are created here and referenced everywhere; the Data Map will
		// draw an inspection or a trap, which still belongs to its own domain.
		summary: 'Reference geography: regions, addresses, and weather stations',
		icon: iconRegistry.domains.gis.icon,
		groups: [
			{
				id: 'gis-main',
				items: [
					{
						id: 'data-explorer',
						label: 'Data Map',
						to: '/gis/data-explorer',
						icon: iconRegistry.generic.compass.icon,
						stub: true,
					},
				],
			},
			{
				id: 'gis-regions',
				label: listLabel('region'),
				items: [
					{
						id: 'regions',
						label: listLabel('region'),
						to: '/gis/regions',
						icon: iconRegistry.entities.region.icon,
					},
					{
						id: 'regions-create',
						label: createLabel('region'),
						to: '/gis/regions/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'add', 'zone', 'boundary', 'district'] },
					},
					{
						id: 'regions-import',
						label: createPluralLabel('Import', 'region'),
						to: '/gis/regions/import',
						icon: iconRegistry.actions.upload.icon,
						action: { keywords: ['upload', 'load', 'shapefile', 'geojson', 'boundaries'] },
					},
				],
			},
			{
				id: 'gis-addresses',
				label: listLabel('address'),
				items: [
					{
						id: 'addresses',
						label: 'Address Book',
						to: '/gis/addresses',
						icon: iconRegistry.actions.searchCheck.icon,
					},
					{
						id: 'addresses-create',
						label: createLabel('address'),
						to: '/gis/addresses/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'add', 'street', 'parcel', 'property', 'location'] },
					},
					{
						id: 'addresses-cleanup',
						label: createPluralLabel('Cleanup', 'address'),
						to: '/gis/addresses/cleanup',
						icon: iconRegistry.actions.merge.icon,
						action: { keywords: ['merge', 'duplicate', 'dedupe', 'combine', 'tidy'] },
					},
				],
			},
			{
				id: 'gis-weather',
				label: 'Weather',
				items: [
					{
						id: 'weather',
						label: 'Map',
						to: '/gis/weather',
						icon: iconRegistry.generic.map.icon,
						// The group heading above already reads Weather, so the label no longer
						// carries the noun and the palette's haystack lost it with the rename.
						keywords: ['weather', 'station', 'gauge', 'sensor', 'rainfall'],
					},
					{
						id: 'weather-create',
						label: createLabel('weatherStation'),
						to: '/gis/weather/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'create', 'sensor', 'gauge', 'met', 'station'] },
					},
					{
						id: 'weather-stats',
						label: 'Statistics',
						to: '/gis/weather/stats',
						stub: true,
						icon: iconRegistry.generic.chart.icon,
					},
				],
			},
		],
	},
	{
		id: 'operations',
		label: 'Operations',
		summary: 'Dispatch, crew assignments, and requested control work',
		icon: iconRegistry.entities.vehicle.icon,
		groups: [
			{
				id: 'operations-overview',
				items: [
					{
						id: 'operations-overview-link',
						label: 'Overview',
						to: '/operations',
						icon: iconRegistry.generic.home.icon,
					},
				],
			},
			// Requests first, then assignments, then missions: a request is raised
			// before anything is scheduled against it, so the group order follows the
			// order the work actually moves through the section.
			//
			// The two worklists are qualified rather than left bare because they are
			// the same shape — an ordered list of stops a crew works through — and
			// differ only in what the crew does at each: an assignment sends someone
			// to look, a mission sends them to treat.
			{
				id: 'operations-requests',
				label: listLabel('requestedControlAction'),
				items: [
					{
						id: 'requests-for-control-explorer',
						label: 'Map',
						to: '/operations/requests-for-control',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'requests-for-control-create',
						label: createLabel('requestedControlAction'),
						to: '/operations/requests-for-control/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'add', 'treatment', 'work', 'ask'] },
					},
				],
			},
			{
				id: 'operations-assignments',
				label: 'Surveillance Assignments',
				items: [
					{
						id: 'assignments-explorer',
						label: 'Map',
						to: '/operations/assignments',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'assignments-create',
						label: createLabel('assignment'),
						to: '/operations/assignments/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'create', 'crew', 'worklist', 'route', 'surveillance'] },
					},
				],
			},
			{
				id: 'operations-missions',
				label: 'Control Missions',
				items: [
					{
						id: 'missions-explorer',
						label: 'Map',
						to: '/operations/missions',
						icon: iconRegistry.generic.map.icon,
					},
					{
						id: 'missions-create',
						label: createLabel('mission'),
						to: '/operations/missions/create',
						icon: iconRegistry.actions.add.icon,
						action: { keywords: ['new', 'create', 'crew', 'worklist', 'treatment', 'control'] },
					},
				],
			},
		],
	},
	{
		id: 'organization',
		label: 'Organization',
		summary: 'Setup, people, and the catalogs behind every record',
		icon: iconRegistry.generic.settings.icon,
		groups: [
			{
				id: 'organization-main',
				items: [
					{
						id: 'org-general',
						label: 'General',
						to: '/my-organization',
						icon: iconRegistry.generic.settings.icon,
					},
					{
						id: 'org-people',
						label: 'People',
						to: '/my-organization/people',
						icon: iconRegistry.entities.organization.icon,
					},
				],
			},
			{
				id: 'organization-surveillance',
				label: 'Surveillance',
				items: [
					{
						id: 'org-adult',
						label: 'Adult Surveillance',
						to: '/my-organization/adult-surveillance',
						icon: iconRegistry.domains.adultSurveillance.icon,
					},
					{
						id: 'org-larval',
						label: 'Larval Surveillance',
						to: '/my-organization/larval-surveillance',
						icon: iconRegistry.domains.larvalSurveillance.icon,
					},
					{
						id: 'org-key-bindings',
						label: 'Key Bindings',
						to: '/my-organization/key-bindings',
						icon: iconRegistry.generic.keyboard.icon,
					},
				],
			},
			{
				id: 'organization-control',
				label: 'Control',
				items: [
					{
						id: 'org-control-methods',
						label: 'Control Methods',
						to: '/my-organization/control-methods',
						icon: iconRegistry.domains.controlOperations.icon,
					},
					{
						id: 'org-insecticides',
						label: 'Insecticides',
						to: '/my-organization/insecticides',
						icon: iconRegistry.entities.insecticide.icon,
					},
					{
						id: 'org-public',
						label: 'Public Engagement',
						to: '/my-organization/public-engagement',
						icon: iconRegistry.domains.publicEngagement.icon,
					},
				],
			},
		],
	},
];

/**
 * The navigation as one role sees it: forms above their floor removed.
 *
 * Groups that held nothing but such forms drop out with them, so the sidebar
 * never shows an empty heading, and a domain that becomes empty drops out of the
 * rail.
 *
 * Note this is *only* the navigation. The route guards in `lib/write-access`
 * are what actually stop someone reaching a form; this stops the sidebar
 * offering a door that would close in their face. Both read the same floors,
 * which are the server's.
 *
 * What this returns is what the shell *draws*. `AppShellRoot` hands the
 * unfiltered `webShellDomains` to the shell separately, as `resolutionDomains`,
 * so "where am I" still answers truthfully on a path this filter hid — see
 * `ShellContextValue.resolutionDomains`.
 */
export function shellDomainsForRole(auth: AuthMe | null): readonly WebShellDomain[] {
	return webShellDomains
		.map((domain) => ({
			...domain,
			groups: domain.groups
				.map((group) => ({
					...group,
					items: group.items.filter((item) => mayReach(auth, item)),
				}))
				.filter((group) => group.items.length > 0),
		}))
		.filter((domain) => domain.groups.length > 0);
}

/**
 * Whether this role may reach where the item points.
 *
 * A destination with no floor in the register is not a write surface, so it is
 * drawn for everyone.
 */
function mayReach(auth: AuthMe | null, item: WebShellNavItem): boolean {
	const floor = writeSurfaceFloor(String(item.to));
	return floor === undefined || hasAtLeastRole(auth, floor);
}

/** A Profile as the Daily Work group lists one. */
export interface DailyWorkPerson {
	readonly id: string;
	readonly name: string;
}

/**
 * The Profiles behind the Daily Work group, in the two lists the shell takes.
 *
 * Both are `null` until the profiles shape has synced, and that is a different
 * fact from an empty list, which is an organization whose every Profile has been
 * deactivated. Neither draws a heading, but only one of them is worth a second
 * look at the People page, so the two are not collapsed into a count of zero.
 */
export interface DailyWorkRoster {
	/** Active Profiles, alphabetical. What the sidebar draws. */
	readonly listed: readonly DailyWorkPerson[] | null;
	/** Every Profile, active or not. What "where am I" resolves against. */
	readonly routable: readonly DailyWorkPerson[] | null;
}

const OVERVIEW_DOMAIN_ID = 'overview';

/**
 * Overview with one row per Profile appended, under a "Daily Work" heading.
 *
 * The first navigation this app builds at render time rather than declaring. A
 * row's destination is still the route template `/daily-work/$profileId` with
 * the id in `params`, so the route stays typed here and the shell does the
 * substitution. See `ShellNavParams`.
 *
 * Called twice, with the two lists on {@link DailyWorkRoster}. The drawn
 * navigation gets the active Profiles; "where am I" gets all of them, so
 * somebody already reading a deactivated colleague's day keeps a breadcrumb that
 * names them rather than dropping to the domain alone. That is the same split
 * `resolutionDomains` already makes for the forms a viewer's sidebar hides.
 *
 * No group at all when the list is empty, rather than a heading with nothing
 * under it.
 */
export function withDailyWorkGroup(
	domains: readonly WebShellDomain[],
	people: readonly DailyWorkPerson[] | null,
): readonly WebShellDomain[] {
	if (people === null || people.length === 0) {
		return domains;
	}

	const group: WebShellNavGroup = {
		id: 'overview-daily-work',
		label: 'Daily Work',
		items: people.map((person) => ({
			// The same id in both lists, so the open page's row reads as active even
			// though only one of the two lists is drawn.
			id: `daily-work-${person.id}`,
			label: person.name,
			to: '/daily-work/$profileId',
			params: { profileId: person.id },
			icon: iconRegistry.entities.contact.icon,
		})),
	};

	return domains.map((domain) =>
		domain.id === OVERVIEW_DOMAIN_ID ? { ...domain, groups: [...domain.groups, group] } : domain,
	);
}

/**
 * Destinations reached from the account menu rather than the domain rail. They
 * belong to no domain, so they carry their own trail instead of falling back to
 * whichever domain happens to sort first.
 */
export const webStandalonePages: readonly ShellStandalonePage[] = [
	{ path: '/profile', crumbs: [{ label: 'Account' }, { label: 'Profile' }] },
	// Reached from the palette's "View all results" row and from a shared link,
	// and deliberately in no menu. Without an entry here the trail would resolve
	// to whichever domain sorts first.
	{ path: '/search', crumbs: [{ label: 'Search' }] },
	// Reached from the version under the brand mark, which is in no menu at all.
	{ path: '/changelog', crumbs: [{ label: "What's New" }] },
];

/** The account-menu entries for the organization workspace. */
export const webAccountLinks: readonly ShellAccountLink[] = [
	{ label: 'Profile', to: '/profile', icon: iconRegistry.actions.edit.icon },
];

/**
 * One promoted navigation item, flattened out of the domain tree.
 *
 * The palette matches against `label` and `keywords` together, so both travel
 * on one object rather than being looked up twice.
 */
export interface WebShellCandidate {
	readonly id: string;
	readonly label: string;
	/**
	 * Typed against web's route tree at the declaration site above, which is what
	 * makes a renamed route a typecheck failure here rather than a dead palette
	 * row found in production.
	 */
	readonly to: NonNullable<ShellNavItem['to']>;
	readonly keywords: readonly string[];
	/** The domain this sits under, which is what a route row shows as its subtitle. */
	readonly domainLabel: string;
	/**
	 * The record this action's form opens on, and the whole declaration that
	 * picking it asks a second question. Absent on every route candidate and on
	 * seventeen of the nineteen actions.
	 */
	readonly seedFrom?: SeedableTable | undefined;
}

/**
 * The two candidate lists the palette matches against, for one role.
 *
 * Both come off `shellDomainsForRole`, not `webShellDomains`, so an action below
 * the caller's floor never becomes a result: a collector sees no "Create
 * Habitat", matching the sidebar they already have. Neither list carries a role
 * floor of its own for the same reason — the filter has already run.
 *
 * An item is in exactly one list. Carrying an `action` moves it out of the route
 * list, so a create form appears once rather than as both a place and a verb.
 *
 * Stubs are excluded from both: the fifteen `stub: true` items are unbuilt
 * destinations, and offering one is offering a door that opens onto nothing.
 *
 * The Daily Work rows are excluded by reading the declared navigation rather
 * than the composed one: global search already finds people, and a route row per
 * Profile would push every other destination off the list.
 */
export function shellSearchCandidates(auth: AuthMe | null): {
	readonly routes: readonly WebShellCandidate[];
	readonly actions: readonly WebShellCandidate[];
} {
	const routes: WebShellCandidate[] = [];
	const actions: WebShellCandidate[] = [];

	for (const domain of shellDomainsForRole(auth)) {
		for (const group of domain.groups) {
			for (const item of group.items) {
				// A stub is an unbuilt destination, and offering one is offering a
				// door that opens onto nothing. An item with no `to` is a heading in
				// the shared type and has nowhere to send anybody either.
				if (item.stub === true || item.to === undefined) {
					continue;
				}

				const candidate: WebShellCandidate = {
					id: item.id,
					label: item.label,
					to: item.to,
					keywords: item.keywords ?? item.action?.keywords ?? [],
					domainLabel: domain.label,
					seedFrom: item.action?.seedFrom,
				};

				if (item.action === undefined) {
					routes.push(candidate);
				} else {
					actions.push(candidate);
				}
			}
		}
	}

	return { routes, actions };
}
