import {
	AlertTriangle,
	Box,
	Calendar,
	ChartColumn,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronLeft,
	ChevronUp,
	Circle,
	CircleCheck,
	Clipboard,
	ClipboardCheck,
	CloudSun,
	Compass,
	Component,
	Contrast,
	Download,
	Edit,
	Fish,
	FlaskConical,
	GripVertical,
	Home,
	Info,
	Layers,
	Loader2,
	LocateFixed,
	ArrowLeft as LucideArrowLeft,
	ArrowRight as LucideArrowRight,
	ChevronRight as LucideChevronRight,
	type LucideIcon,
	Map as LucideMap,
	MoreHorizontal as LucideMoreHorizontal,
	MapPinned,
	Megaphone,
	Minus,
	Moon,
	Network,
	OctagonX,
	PanelLeft,
	Plus,
	Printer,
	Puzzle,
	Route,
	Ruler,
	Satellite,
	Save,
	ScanEye,
	Search,
	SearchCheck,
	Settings,
	SprayCan,
	Sun,
	Trash2,
	Truck,
	Users,
	Worm,
	Wrench,
	X,
} from 'lucide-react';
import { type ComponentType, createElement, type SVGProps } from 'react';

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

const BrandMarkSvgIcon = assetIcon('brandMarkSvg', './assets/brand-mark.svg');
const MosquitoSvgIcon = assetIcon('mosquitoSvg', './assets/mosquito.svg');

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
		application: icon('application', 'Application', 'entities', SprayCan),
		biocontrolAction: icon('biocontrolAction', 'Biocontrol action', 'entities', Fish),
		collection: icon('collection', 'Collection', 'entities', Layers),
		equipment: icon('equipment', 'Equipment', 'entities', Wrench),
		insecticide: icon('insecticide', 'Insecticide', 'entities', SprayCan),
		inspection: icon('inspection', 'Inspection', 'entities', ClipboardCheck),
		organization: icon('organization', 'Organization', 'entities', Users),
		outreachAction: icon('outreachAction', 'Outreach action', 'entities', Megaphone),
		region: icon('region', 'Region', 'entities', LucideMap),
		route: icon('route', 'Route', 'entities', Route),
		sample: icon('sample', 'Sample', 'entities', FlaskConical),
		sourceReductionAction: icon(
			'sourceReductionAction',
			'Source reduction action',
			'entities',
			Trash2,
		),
		taxonomy: icon('taxonomy', 'Taxonomy', 'entities', Network),
		trap: icon('trap', 'Trap', 'entities', Box),
		unit: icon('unit', 'Unit', 'entities', Ruler),
		vehicle: icon('vehicle', 'Vehicle', 'entities', Truck),
	},
	actions: {
		add: icon('add', 'Add', 'actions', Plus),
		check: icon('check', 'Check', 'actions', Check),
		close: icon('close', 'Close', 'actions', X),
		delete: icon('delete', 'Delete', 'actions', Trash2),
		download: icon('download', 'Download', 'actions', Download),
		edit: icon('edit', 'Edit', 'actions', Edit),
		info: icon('info', 'Info', 'actions', Info),
		loading: icon('loading', 'Loading', 'actions', Loader2),
		locate: icon('locate', 'Locate', 'actions', LocateFixed),
		paste: icon('paste', 'Paste', 'actions', Clipboard),
		remove: icon('remove', 'Remove', 'actions', Minus),
		save: icon('save', 'Save', 'actions', Save),
		search: icon('search', 'Search', 'actions', Search),
		searchCheck: icon('searchCheck', 'Search check', 'actions', SearchCheck),
		select: icon('select', 'Select', 'actions', CheckCircle2),
		warning: icon('warning', 'Warning', 'actions', AlertTriangle),
	},
	arrows: {
		arrowLeft: icon('arrowLeft', 'Arrow left', 'arrows', LucideArrowLeft),
		arrowRight: icon('arrowRight', 'Arrow right', 'arrows', LucideArrowRight),
		chevronDown: icon('chevronDown', 'Chevron down', 'arrows', ChevronDown),
		chevronLeft: icon('chevronLeft', 'Chevron left', 'arrows', ChevronLeft),
		chevronRight: icon('chevronRight', 'Chevron right', 'arrows', LucideChevronRight),
		chevronUp: icon('chevronUp', 'Chevron up', 'arrows', ChevronUp),
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
		error: icon('error', 'Error', 'generic', OctagonX),
		gripVertical: icon('gripVertical', 'Vertical grip', 'generic', GripVertical),
		home: icon('home', 'Home', 'generic', Home),
		map: icon('map', 'Map', 'generic', LucideMap),
		moon: icon('moon', 'Moon', 'generic', Moon),
		print: icon('print', 'Print', 'generic', Printer),
		puzzle: icon('puzzle', 'Puzzle', 'generic', Puzzle),
		satellite: icon('satellite', 'Satellite', 'generic', Satellite),
		scanEye: icon('scanEye', 'Scan eye', 'generic', ScanEye),
		settings: icon('settings', 'Settings', 'generic', Settings),
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
export const CircleCheckIcon = iconRegistry.generic.success.icon;
export const CircleIcon = iconRegistry.generic.circle.icon;
export const CompassIcon = iconRegistry.generic.compass.icon;
export const ComponentIcon = iconRegistry.generic.component.icon;
export const ContrastIcon = iconRegistry.generic.contrast.icon;
export const DownloadIcon = iconRegistry.actions.download.icon;
export const GripVerticalIcon = iconRegistry.generic.gripVertical.icon;
export const HomeIcon = iconRegistry.generic.home.icon;
export const InfoIcon = iconRegistry.actions.info.icon;
export const Loader2Icon = iconRegistry.actions.loading.icon;
export const LocateFixedIcon = iconRegistry.actions.locate.icon;
export const MapPinnedIcon = iconRegistry.simmer.fieldWork.icon;
export const MinusIcon = iconRegistry.actions.remove.icon;
export const MoonIcon = iconRegistry.generic.moon.icon;
export const MoreHorizontal = iconRegistry.arrows.moreHorizontal.icon;
export const MoreHorizontalIcon = iconRegistry.arrows.moreHorizontal.icon;
export const MosquitoIcon = iconRegistry.simmer.mosquito.icon;
export const OctagonXIcon = iconRegistry.generic.error.icon;
export const PanelLeftIcon = iconRegistry.arrows.panelLeft.icon;
export const PlusIcon = iconRegistry.actions.add.icon;
export const PuzzleIcon = iconRegistry.generic.puzzle.icon;
export const SaveIcon = iconRegistry.actions.save.icon;
export const SatelliteIcon = iconRegistry.generic.satellite.icon;
export const ScanEyeIcon = iconRegistry.generic.scanEye.icon;
export const SearchIcon = iconRegistry.actions.search.icon;
export const SettingsIcon = iconRegistry.generic.settings.icon;
export const SunIcon = iconRegistry.generic.sun.icon;
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

function assetIcon(displayName: string, assetPath: string): RegistryIcon {
	const assetUrl = new URL(assetPath, import.meta.url).href;

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
