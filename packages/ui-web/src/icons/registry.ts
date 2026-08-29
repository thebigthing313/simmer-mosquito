import {
	AlertTriangle,
	Beaker,
	Box,
	Calendar,
	CalendarCheck,
	ChartColumn,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronLeft,
	ChevronsDown,
	ChevronsUp,
	ChevronUp,
	Circle,
	CircleCheck,
	Clipboard,
	ClipboardCheck,
	CloudSun,
	Compass,
	Component,
	Contrast,
	Copy,
	Download,
	Droplet,
	Edit,
	Eye,
	EyeOff,
	Fish,
	FlaskConical,
	FolderPlus,
	GripVertical,
	Hammer,
	History,
	Home,
	Inbox,
	Info,
	Keyboard,
	Layers,
	ListFilter,
	Loader2,
	LocateFixed,
	ArrowLeft as LucideArrowLeft,
	ArrowRight as LucideArrowRight,
	ChevronRight as LucideChevronRight,
	type LucideIcon,
	Map as LucideMap,
	MoreHorizontal as LucideMoreHorizontal,
	MapPin,
	MapPinned,
	Megaphone,
	Merge,
	MessageSquare,
	Minus,
	Moon,
	Network,
	OctagonX,
	PanelLeft,
	PhoneCall,
	Pin,
	PinOff,
	Plus,
	Printer,
	Puzzle,
	RotateCcw,
	Route,
	Ruler,
	Satellite,
	Save,
	ScanEye,
	Search,
	SearchCheck,
	Send,
	Settings,
	Speech,
	Spline,
	SprayCan,
	Square,
	Sun,
	Tag,
	Target,
	Thermometer,
	Trash2,
	Truck,
	Upload,
	User,
	Users,
	WavesHorizontal,
	Worm,
	Wrench,
	X,
} from 'lucide-react';
import { type ComponentType, createElement, type SVGProps } from 'react';
import brandMarkUrl from './assets/brand-mark.svg?url';
import mosquitoUrl from './assets/mosquito.svg?url';

export type RegistryIcon = ComponentType<SVGProps<SVGSVGElement>>;
export type IconSource = 'lucide' | 'simmer';
export type IconCategory = 'simmer' | 'domains' | 'entities' | 'actions' | 'arrows' | 'generic';

export interface IconRegistryEntry {
	readonly name: string;
	readonly label: string;
	readonly category: IconCategory;
	readonly source: IconSource;
	readonly icon: RegistryIcon;
}

/**
 * A north arrow, drawn rather than borrowed.
 *
 * Both lucide candidates put their point on the north-east diagonal: the
 * navigation arrowhead runs to (22,2) and the compass needle from (16.24,7.76)
 * to (7.76,16.24). Rotated by the map's bearing, either one reads 45° off at
 * every bearing, which is worse than no arrow: it disagrees with the map
 * consistently enough to look deliberate.
 *
 * This is the cartographer's needle: one half filled, one half hollow, tip at
 * true north up the vertical axis, so a rotation by `-bearing` points it at
 * where north actually went.
 */
function NorthNeedleIcon(props: SVGProps<SVGSVGElement>) {
	return createElement(
		'svg',
		{
			viewBox: '0 0 24 24',
			role: 'img',
			fill: 'none',
			stroke: 'currentColor',
			strokeWidth: 1.6,
			strokeLinejoin: 'round',
			...props,
		},
		createElement('path', { d: 'M12 2.5 18.5 21 12 16.5 5.5 21Z' }),
		createElement('path', { d: 'M12 2.5 18.5 21 12 16.5Z', fill: 'currentColor' }),
	);
}

const BrandMarkSvgIcon = assetIcon('brandMarkSvg', brandMarkUrl);
const MosquitoSvgIcon = assetIcon('mosquitoSvg', mosquitoUrl);

export const iconRegistry = {
	simmer: {
		brandMark: simmerIcon('brandMark', 'SIMMER brand mark', 'simmer', BrandMarkSvgIcon),
		fieldWork: icon('fieldWork', 'Field work', 'simmer', MapPinned),
		mosquito: simmerIcon('mosquito', 'Mosquito', 'simmer', MosquitoSvgIcon),
	},
	domains: {
		adultSurveillance: simmerIcon(
			'adultSurveillance',
			'Adult surveillance',
			'domains',
			MosquitoSvgIcon,
		),
		controlOperations: icon('controlOperations', 'Control operations', 'domains', SprayCan),
		gis: icon('gis', 'GIS', 'domains', LucideMap),
		larvalSurveillance: icon('larvalSurveillance', 'Larval surveillance', 'domains', Worm),
		publicEngagement: icon('publicEngagement', 'Public engagement', 'domains', Megaphone),
		weather: icon('weather', 'Weather', 'domains', CloudSun),
	},
	entities: {
		address: icon('address', 'Address', 'entities', MapPin),
		application: icon('application', 'Application', 'entities', SprayCan),
		assignment: icon('assignment', 'Assignment', 'entities', CalendarCheck),
		biocontrolAction: icon('biocontrolAction', 'Biocontrol action', 'entities', Fish),
		collection: icon('collection', 'Collection', 'entities', Layers),
		contact: icon('contact', 'Contact', 'entities', User),
		equipment: icon('equipment', 'Equipment', 'entities', Wrench),
		formulation: icon('formulation', 'Formulation', 'entities', Beaker),
		habitat: icon('habitat', 'Habitat', 'entities', WavesHorizontal),
		insecticide: icon('insecticide', 'Insecticide', 'entities', SprayCan),
		inspection: icon('inspection', 'Inspection', 'entities', ClipboardCheck),
		mission: icon('mission', 'Mission', 'entities', Target),
		organization: icon('organization', 'Organization', 'entities', Users),
		outreachAction: icon('outreachAction', 'Outreach action', 'entities', Speech),
		region: icon('region', 'Region', 'entities', LucideMap),
		requestedControlAction: icon(
			'requestedControlAction',
			'Requested control action',
			'entities',
			Inbox,
		),
		route: icon('route', 'Route', 'entities', Route),
		sample: icon('sample', 'Sample', 'entities', FlaskConical),
		serviceRequest: icon('serviceRequest', 'Service request', 'entities', PhoneCall),
		sourceReductionAction: icon(
			'sourceReductionAction',
			'Source reduction action',
			'entities',
			Trash2,
		),
		tag: icon('tag', 'Tag', 'entities', Tag),
		taxonomy: icon('taxonomy', 'Taxonomy', 'entities', Network),
		trap: icon('trap', 'Trap', 'entities', Box),
		unit: icon('unit', 'Unit', 'entities', Ruler),
		vehicle: icon('vehicle', 'Vehicle', 'entities', Truck),
		weatherSource: icon('weatherSource', 'Weather source', 'entities', Thermometer),
	},
	actions: {
		add: icon('add', 'Add', 'actions', Plus),
		check: icon('check', 'Check', 'actions', Check),
		close: icon('close', 'Close', 'actions', X),
		comment: icon('comment', 'Comment', 'actions', MessageSquare),
		copy: icon('copy', 'Copy', 'actions', Copy),
		delete: icon('delete', 'Delete', 'actions', Trash2),
		download: icon('download', 'Download', 'actions', Download),
		edit: icon('edit', 'Edit', 'actions', Edit),
		filter: icon('filter', 'Filter', 'actions', ListFilter),
		newFolder: icon('newFolder', 'New folder', 'actions', FolderPlus),
		info: icon('info', 'Info', 'actions', Info),
		loading: icon('loading', 'Loading', 'actions', Loader2),
		locate: icon('locate', 'Locate', 'actions', LocateFixed),
		merge: icon('merge', 'Merge', 'actions', Merge),
		paste: icon('paste', 'Paste', 'actions', Clipboard),
		pin: icon('pin', 'Pin', 'actions', Pin),
		remove: icon('remove', 'Remove', 'actions', Minus),
		reset: icon('reset', 'Reset', 'actions', RotateCcw),
		save: icon('save', 'Save', 'actions', Save),
		search: icon('search', 'Search', 'actions', Search),
		searchCheck: icon('searchCheck', 'Search check', 'actions', SearchCheck),
		select: icon('select', 'Select', 'actions', CheckCircle2),
		send: icon('send', 'Send', 'actions', Send),
		unpin: icon('unpin', 'Unpin', 'actions', PinOff),
		upload: icon('upload', 'Upload', 'actions', Upload),
		warning: icon('warning', 'Warning', 'actions', AlertTriangle),
	},
	arrows: {
		arrowLeft: icon('arrowLeft', 'Arrow left', 'arrows', LucideArrowLeft),
		arrowRight: icon('arrowRight', 'Arrow right', 'arrows', LucideArrowRight),
		chevronDown: icon('chevronDown', 'Chevron down', 'arrows', ChevronDown),
		chevronLeft: icon('chevronLeft', 'Chevron left', 'arrows', ChevronLeft),
		chevronRight: icon('chevronRight', 'Chevron right', 'arrows', LucideChevronRight),
		chevronUp: icon('chevronUp', 'Chevron up', 'arrows', ChevronUp),
		chevronsDown: icon('chevronsDown', 'Chevrons down', 'arrows', ChevronsDown),
		chevronsUp: icon('chevronsUp', 'Chevrons up', 'arrows', ChevronsUp),
		north: simmerIcon('north', 'North', 'arrows', NorthNeedleIcon),
		moreHorizontal: icon('moreHorizontal', 'More horizontal', 'arrows', LucideMoreHorizontal),
		panelLeft: icon('panelLeft', 'Panel left', 'arrows', PanelLeft),
	},
	generic: {
		calendar: icon('calendar', 'Calendar', 'generic', Calendar),
		chart: icon('chart', 'Chart', 'generic', ChartColumn),
		circle: icon('circle', 'Circle', 'generic', Circle),
		compass: icon('compass', 'Compass', 'generic', Compass),
		component: icon('component', 'Component', 'generic', Component),
		contrast: icon('contrast', 'Contrast', 'generic', Contrast),
		droplet: icon('droplet', 'Droplet', 'generic', Droplet),
		error: icon('error', 'Error', 'generic', OctagonX),
		eye: icon('eye', 'Show', 'generic', Eye),
		eyeOff: icon('eyeOff', 'Hide', 'generic', EyeOff),
		gripVertical: icon('gripVertical', 'Vertical grip', 'generic', GripVertical),
		hammer: icon('hammer', 'Work in progress', 'generic', Hammer),
		history: icon('history', 'History', 'generic', History),
		home: icon('home', 'Home', 'generic', Home),
		keyboard: icon('keyboard', 'Keyboard', 'generic', Keyboard),
		map: icon('map', 'Map', 'generic', LucideMap),
		moon: icon('moon', 'Moon', 'generic', Moon),
		print: icon('print', 'Print', 'generic', Printer),
		puzzle: icon('puzzle', 'Puzzle', 'generic', Puzzle),
		satellite: icon('satellite', 'Satellite', 'generic', Satellite),
		scanEye: icon('scanEye', 'Scan eye', 'generic', ScanEye),
		ruler: icon('ruler', 'Measure', 'generic', Ruler),
		settings: icon('settings', 'Settings', 'generic', Settings),
		spline: icon('spline', 'Line', 'generic', Spline),
		square: icon('square', 'Rectangle', 'generic', Square),
		success: icon('success', 'Success', 'generic', CircleCheck),
		sun: icon('sun', 'Sun', 'generic', Sun),
	},
} as const;

export const iconRegistryGroups: readonly {
	readonly category: IconCategory;
	readonly entries: readonly IconRegistryEntry[];
}[] = Object.entries(iconRegistry).map(([category, entries]) => ({
	category: category as IconCategory,
	entries: Object.values(entries),
}));

export const iconRegistryEntries = iconRegistryGroups.flatMap((group) => group.entries);

export type IconName = (typeof iconRegistryEntries)[number]['name'];

export const AlertTriangleIcon = iconRegistry.actions.warning.icon;
export const ArrowLeft = iconRegistry.arrows.arrowLeft.icon;
export const ArrowLeftIcon = iconRegistry.arrows.arrowLeft.icon;
export const ArrowRight = iconRegistry.arrows.arrowRight.icon;
export const ArrowRightIcon = iconRegistry.arrows.arrowRight.icon;
export const BoxIcon = iconRegistry.simmer.brandMark.icon;
export const BrandMarkIcon = iconRegistry.simmer.brandMark.icon;
export const CalendarIcon = iconRegistry.generic.calendar.icon;
export const CheckCircle2Icon = iconRegistry.actions.select.icon;
export const CheckIcon = iconRegistry.actions.check.icon;
export const ChevronDownIcon = iconRegistry.arrows.chevronDown.icon;
export const ChevronLeftIcon = iconRegistry.arrows.chevronLeft.icon;
export const ChevronRight = iconRegistry.arrows.chevronRight.icon;
export const ChevronRightIcon = iconRegistry.arrows.chevronRight.icon;
export const ChevronUpIcon = iconRegistry.arrows.chevronUp.icon;
export const ChevronsDownIcon = iconRegistry.arrows.chevronsDown.icon;
export const ChevronsUpIcon = iconRegistry.arrows.chevronsUp.icon;
export const CircleCheckIcon = iconRegistry.generic.success.icon;
export const CircleIcon = iconRegistry.generic.circle.icon;
export const CompassIcon = iconRegistry.generic.compass.icon;
export const ComponentIcon = iconRegistry.generic.component.icon;
export const ContactIcon = iconRegistry.entities.contact.icon;
export const ContrastIcon = iconRegistry.generic.contrast.icon;
export const DownloadIcon = iconRegistry.actions.download.icon;
export const DropletIcon = iconRegistry.generic.droplet.icon;
export const EyeIcon = iconRegistry.generic.eye.icon;
export const EyeOffIcon = iconRegistry.generic.eyeOff.icon;
export const GripVerticalIcon = iconRegistry.generic.gripVertical.icon;
export const HammerIcon = iconRegistry.generic.hammer.icon;
export const HomeIcon = iconRegistry.generic.home.icon;
export const InfoIcon = iconRegistry.actions.info.icon;
export const KeyboardIcon = iconRegistry.generic.keyboard.icon;
export const Loader2Icon = iconRegistry.actions.loading.icon;
export const LocateFixedIcon = iconRegistry.actions.locate.icon;
export const MapPinnedIcon = iconRegistry.simmer.fieldWork.icon;
export const MessageSquareIcon = iconRegistry.actions.comment.icon;
export const MinusIcon = iconRegistry.actions.remove.icon;
export const MoonIcon = iconRegistry.generic.moon.icon;
export const MoreHorizontal = iconRegistry.arrows.moreHorizontal.icon;
export const MoreHorizontalIcon = iconRegistry.arrows.moreHorizontal.icon;
export const MosquitoIcon = iconRegistry.simmer.mosquito.icon;
export const FilterIcon = iconRegistry.actions.filter.icon;
export const NewFolderIcon = iconRegistry.actions.newFolder.icon;
export const NorthIcon = iconRegistry.arrows.north.icon;
export const OctagonXIcon = iconRegistry.generic.error.icon;
export const PanelLeftIcon = iconRegistry.arrows.panelLeft.icon;
export const PinIcon = iconRegistry.actions.pin.icon;
export const PinOffIcon = iconRegistry.actions.unpin.icon;
export const PlusIcon = iconRegistry.actions.add.icon;
export const PuzzleIcon = iconRegistry.generic.puzzle.icon;
export const ResetIcon = iconRegistry.actions.reset.icon;
export const SaveIcon = iconRegistry.actions.save.icon;
export const RulerIcon = iconRegistry.generic.ruler.icon;
export const SatelliteIcon = iconRegistry.generic.satellite.icon;
export const ScanEyeIcon = iconRegistry.generic.scanEye.icon;
export const SearchIcon = iconRegistry.actions.search.icon;
export const SendIcon = iconRegistry.actions.send.icon;
export const SettingsIcon = iconRegistry.generic.settings.icon;
export const SplineIcon = iconRegistry.generic.spline.icon;
export const SquareIcon = iconRegistry.generic.square.icon;
export const SunIcon = iconRegistry.generic.sun.icon;
export const TagIcon = iconRegistry.entities.tag.icon;
export const TriangleAlertIcon = iconRegistry.actions.warning.icon;
export const XIcon = iconRegistry.actions.close.icon;

function icon(
	name: string,
	label: string,
	category: IconCategory,
	iconComponent: LucideIcon,
): IconRegistryEntry {
	return iconEntry(name, label, category, 'lucide', iconComponent);
}

function simmerIcon(
	name: string,
	label: string,
	category: IconCategory,
	iconComponent: RegistryIcon,
): IconRegistryEntry {
	return iconEntry(name, label, category, 'simmer', iconComponent);
}

function iconEntry(
	name: string,
	label: string,
	category: IconCategory,
	source: IconSource,
	iconComponent: RegistryIcon,
): IconRegistryEntry {
	return {
		name,
		label,
		category,
		source,
		icon: iconComponent,
	};
}

function assetIcon(displayName: string, assetUrl: string): RegistryIcon {
	function AssetIcon({ children: _children, ...props }: SVGProps<SVGSVGElement>) {
		return createElement(
			'svg',
			{ viewBox: '0 0 24 24', role: 'img', ...props },
			createElement('image', {
				href: assetUrl,
				width: '24',
				height: '24',
				preserveAspectRatio: 'xMidYMid meet',
			}),
		);
	}

	AssetIcon.displayName = displayName;

	return AssetIcon;
}
