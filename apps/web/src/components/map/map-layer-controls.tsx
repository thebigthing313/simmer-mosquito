import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import {
	ChevronDownIcon,
	iconRegistry,
	type RegistryIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useState } from 'react';

const LayersIcon = iconRegistry.entities.collection.icon;

/** One filterable dimension of a layer — a facet with a few illustrative values. */
interface LayerFacet {
	readonly id: string;
	readonly label: string;
	readonly options: readonly string[];
}

/** A data layer that can be streamed onto the map as MVT and filtered in place. */
interface MapDataLayer {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly icon: RegistryIcon;
	readonly facets: readonly LayerFacet[];
}

/**
 * The data layers we intend to expose on the explorer. Static for now — the goal
 * is the control surface; wiring each layer to its MVT source + filter query
 * comes later, so the facet values here are representative placeholders.
 */
const MAP_DATA_LAYERS: readonly MapDataLayer[] = [
	{
		id: 'habitats',
		label: 'Habitats',
		description: 'Larval habitat sites',
		icon: iconRegistry.domains.larvalSurveillance.icon,
		facets: [
			{ id: 'status', label: 'Status', options: ['Active', 'Treated', 'Resolved'] },
			{
				id: 'type',
				label: 'Habitat type',
				options: ['Standing water', 'Container', 'Catch basin', 'Ditch'],
			},
		],
	},
	{
		id: 'traps',
		label: 'Traps',
		description: 'Adult surveillance traps',
		icon: iconRegistry.entities.trap.icon,
		facets: [
			{ id: 'type', label: 'Trap type', options: ['CDC light', 'BG-Sentinel', 'Gravid'] },
			{ id: 'state', label: 'State', options: ['Set', 'Collected'] },
		],
	},
	{
		id: 'treatments',
		label: 'Treatments',
		description: 'Control applications',
		icon: iconRegistry.entities.application.icon,
		facets: [
			{ id: 'method', label: 'Method', options: ['Adulticide', 'Larvicide', 'Source reduction'] },
			{ id: 'window', label: 'Timeframe', options: ['Last 7 days', 'Last 30 days', 'This season'] },
		],
	},
	{
		id: 'service-requests',
		label: 'Service requests',
		description: 'Requests from the public',
		icon: iconRegistry.domains.publicEngagement.icon,
		facets: [{ id: 'status', label: 'Status', options: ['Open', 'In progress', 'Closed'] }],
	},
	{
		id: 'regions',
		label: 'Regions',
		description: 'Operational boundaries',
		icon: iconRegistry.entities.region.icon,
		facets: [{ id: 'kind', label: 'Boundary', options: ['Zones', 'Municipal', 'Custom'] }],
	},
	{
		id: 'routes',
		label: 'Routes',
		description: 'Field routes',
		icon: iconRegistry.entities.route.icon,
		facets: [{ id: 'kind', label: 'Route type', options: ['Inspection', 'Treatment'] }],
	},
];

const DEFAULT_VISIBLE: readonly string[] = ['habitats', 'traps', 'regions'];

/**
 * Earth-style layer switchboard for the explorer: a checkbox per data layer
 * toggles whether it renders, and each visible layer reveals a collapsible panel
 * of filters. UI only for now — no layer is bound to a source yet, so toggles and
 * filters are local state the map wiring will read from later.
 */
export function MapLayerControls() {
	const [panelOpen, setPanelOpen] = useState(true);
	const [visible, setVisible] = useState<Record<string, boolean>>(() =>
		Object.fromEntries(
			MAP_DATA_LAYERS.map((layer) => [layer.id, DEFAULT_VISIBLE.includes(layer.id)]),
		),
	);
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});

	function setLayerVisible(id: string, next: boolean) {
		setVisible((prev) => ({ ...prev, [id]: next }));
		// Hiding a layer also folds away its filters — there's nothing to filter.
		if (!next) {
			setExpanded((prev) => ({ ...prev, [id]: false }));
		}
	}

	const activeCount = Object.values(visible).filter(Boolean).length;

	return (
		<Collapsible
			className="w-[min(17rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border/70 bg-background/80 shadow-md ring-1 ring-black/[0.03] backdrop-blur-sm supports-[backdrop-filter]:bg-background/70"
			onOpenChange={setPanelOpen}
			open={panelOpen}
		>
			<CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/40">
				<LayersIcon aria-hidden="true" className="size-4 text-muted-foreground" />
				<span className="flex-1 font-semibold text-sm">Map layers</span>
				<span className="text-muted-foreground text-xs tabular-nums">{activeCount} on</span>
				<ChevronDownIcon
					aria-hidden="true"
					className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90"
				/>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<ul className="grid gap-0.5 border-border/60 border-t p-1.5">
					{MAP_DATA_LAYERS.map((layer) => (
						<li key={layer.id}>
							<LayerRow
								expanded={expanded[layer.id] ?? false}
								layer={layer}
								onToggleExpanded={(open) => setExpanded((prev) => ({ ...prev, [layer.id]: open }))}
								onToggleVisible={(next) => setLayerVisible(layer.id, next)}
								visible={visible[layer.id] ?? false}
							/>
						</li>
					))}
				</ul>
			</CollapsibleContent>
		</Collapsible>
	);
}

function LayerRow({
	layer,
	visible,
	expanded,
	onToggleVisible,
	onToggleExpanded,
}: {
	readonly layer: MapDataLayer;
	readonly visible: boolean;
	readonly expanded: boolean;
	readonly onToggleVisible: (next: boolean) => void;
	readonly onToggleExpanded: (open: boolean) => void;
}) {
	const Icon = layer.icon;
	const checkboxId = `layer-${layer.id}`;

	return (
		<Collapsible disabled={!visible} onOpenChange={onToggleExpanded} open={expanded}>
			<div
				className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50"
				title={layer.description}
			>
				<Checkbox
					checked={visible}
					id={checkboxId}
					onCheckedChange={(checked) => onToggleVisible(checked === true)}
				/>
				<Icon
					aria-hidden="true"
					className={cn('size-4 shrink-0', visible ? 'text-foreground' : 'text-muted-foreground')}
				/>
				<Label
					className={cn(
						'flex-1 cursor-pointer text-sm',
						!visible && 'font-normal text-muted-foreground',
					)}
					htmlFor={checkboxId}
				>
					{layer.label}
				</Label>
				<CollapsibleTrigger asChild>
					<button
						aria-label={`${layer.label} filters`}
						className="group grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
						type="button"
					>
						<ChevronDownIcon
							aria-hidden="true"
							className="size-4 transition-transform group-data-[state=open]:rotate-180"
						/>
					</button>
				</CollapsibleTrigger>
			</div>
			<CollapsibleContent>
				<LayerFilters layer={layer} />
			</CollapsibleContent>
		</Collapsible>
	);
}

function LayerFilters({ layer }: { readonly layer: MapDataLayer }) {
	return (
		<div className="grid gap-3 pt-1 pb-3 pl-9">
			{layer.facets.map((facet) => (
				<fieldset className="grid gap-1.5" key={facet.id}>
					<legend className="font-medium text-muted-foreground text-xs">{facet.label}</legend>
					<div className="grid gap-1.5">
						{facet.options.map((option) => {
							const optionId = `${layer.id}-${facet.id}-${slug(option)}`;
							return (
								<Label
									className="flex items-center gap-2 font-normal text-sm"
									htmlFor={optionId}
									key={option}
								>
									<Checkbox className="size-3.5" defaultChecked id={optionId} />
									{option}
								</Label>
							);
						})}
					</div>
				</fieldset>
			))}
		</div>
	);
}

function slug(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
