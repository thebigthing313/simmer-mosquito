import { proximityLabel, proximitySearchUnit } from '@simmer-mosquito/domain';
import { boundsFromGeoJson, circlePolygon } from '@simmer-mosquito/mapping';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from '@simmer-mosquito/ui-web/components/ui/item';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useCallback, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { type MergeFieldUpdates, useRecordMerge } from '../../hooks/mutations/use-record-merge';
import { useOrganizationSettings } from '../../hooks/queries/use-organization-settings';
import {
	type DuplicateRecord,
	type NearbyHabitat,
	nearbyHabitatsKey,
	useNearbyHabitats,
} from '../../hooks/use-merge-candidates';
import { useBreadcrumbLabel } from '../app-shell';
import { ExplorerMapPage, useExplorerPanel } from '../explorer';
import { MapCanvas } from '../map';
import { WriteOnly } from '../write-only';
import { MergeConfirmDialog } from './merge-confirm-dialog';
import { RECORD_CLEANUP_CONFIGS, recordCountLabel } from './record-cleanup-config';

const MergeIcon = iconRegistry.actions.merge.icon;
const config = RECORD_CLEANUP_CONFIGS.habitat;
const RESULT_NOUN = { one: 'habitat', many: 'habitats' } as const;

/** How many neighbours the endpoint answers with. Past this the list is trimmed. */
const NEARBY_LIMIT = 100;

/**
 * Folding the habitats standing in one spot into the one that stays.
 *
 * Not a cleanup list, which is what addresses and contacts get. Two records for
 * one catch basin agree about nothing except where they are: the crew that filed
 * the second gave it their own handle and their own description, so a
 * shared-value search finds neither pair. The only evidence is proximity, and a
 * page that listed every pair of habitats within a radius of each other would
 * propose most of an agency's inspection sites.
 *
 * So the question is asked the other way round. Somebody is already looking at a
 * habitat, presses an action on it, and this asks what else is standing there.
 * The habitat they came from is the one that survives, which is the choice a
 * cleanup page has to make with a radio and get wrong in silence.
 *
 * ## Half map, for the reason the explorers are
 *
 * Whether two records are one basin is a question about ground, and a list of
 * names and distances is the wrong shape for it. On a map the answer is usually
 * plain: four points in a line down one ditch read as one habitat somebody
 * walked past four times, and two points either side of a road read as two.
 * Clicking a point picks it, so the judgement and the choice happen in one
 * place.
 *
 * The radius is a filter rather than a constant because how far apart the two
 * records landed depends on how each was filed. A GPS fix under tree cover and a
 * point dropped on an aerial can be tens of metres apart for one ditch, and an
 * agency that maps culverts every hundred feet needs a tighter one than that.
 */
export function HabitatMerge({ habitatId }: { readonly habitatId: string }) {
	// Open on arrival. The radius is not a way of narrowing this page, it is the
	// search itself: shut, the only control that makes the page do anything is a
	// click away and the list reads as the whole answer.
	const panel = useExplorerPanel({ filtersOpen: true });
	const [isConfirming, setIsConfirming] = useState(false);
	const { selected, toggle, clear } = useHabitatSelection();
	const { bounds, candidates, defaultRadius, mapData, nearby, radius, setRadius, target, unit } =
		useMergeSearch(habitatId);

	const merge = useRecordMerge('habitat');
	const queryClient = useQueryClient();
	const sources = candidates.filter((candidate) => selected.has(candidate.id));

	const runMerge = useCallback(
		async (acknowledged: boolean, fieldUpdates: MergeFieldUpdates): Promise<void> => {
			if (target === undefined) {
				return;
			}
			await merge({
				targetId: target.id,
				sourceIds: sources.map((source) => source.id),
				acknowledged,
				fieldUpdates,
			});
			toast.success(`Merged ${recordCountLabel(sources.length, config)} into ${labelOf(target)}.`);
			clear();
			await queryClient.invalidateQueries({ queryKey: nearbyHabitatsKey(habitatId) });
		},
		[clear, habitatId, merge, queryClient, sources, target],
	);

	return (
		<>
			<ExplorerMapPage
				activeFilterCount={radius === defaultRadius ? 0 : 1}
				filters={
					<div className="grid gap-4">
						<KeptHabitat target={target} />
						<RadiusControl onChange={setRadius} radius={radius} unit={unit} />
					</div>
				}
				footer={
					<MergeFooter
						count={sources.length}
						isTrimmed={candidates.length >= NEARBY_LIMIT}
						onMerge={() => setIsConfirming(true)}
						target={target}
					/>
				}
				heading={{
					title: target === undefined ? 'Merge duplicates' : `Merge into ${labelOf(target)}`,
					icon: MergeIcon,
					total: candidates.length,
					isLoading: nearby.isPending,
					noun: RESULT_NOUN,
				}}
				map={
					<MapCanvas
						controls={{ layers: false, measure: true, readout: true }}
						fitToData={bounds}
						inset={panel.inset}
						nearbyLayer={{
							data: mapData,
							selectedIds: [...selected],
							// Clicking empty map answers null, which is not a habitat to pick
							// and must not clear a selection somebody has built up.
							onSelectFeature: (id) => {
								if (id !== null) {
									toggle(id);
								}
							},
						}}
						searchWidth={panel.width}
					/>
				}
				onResetFilters={() => setRadius(defaultRadius)}
				panel={panel}
				results={{
					rows: candidates,
					emptyTitle: 'No other habitats nearby',
					emptyDescription: `Nothing else is recorded within ${proximityLabel(radius, unit)} of this habitat. Widen the search if the duplicate was filed from a different spot.`,
					isError: nearby.isError,
					onRetry: () => void nearby.refetch(),
					renderRow: (candidate) => (
						<CandidateRow
							candidate={candidate}
							isSelected={selected.has(candidate.id)}
							key={candidate.id}
							onToggle={() => toggle(candidate.id)}
							unit={unit}
						/>
					),
				}}
			/>

			{!isConfirming || target === undefined ? null : (
				<MergeConfirmDialog
					config={config}
					onConfirm={runMerge}
					onOpenChange={(open) => {
						if (!open) {
							setIsConfirming(false);
						}
					}}
					open={true}
					recordType="habitat"
					sources={sources}
					target={target}
				/>
			)}
		</>
	);
}

/**
 * The search this page is: a radius, what came back, and what the map draws.
 *
 * Its own hook so the component stays about what it shows. The radius is held in
 * the agency's units and converted once, here, because the buttons say feet and
 * `st_dwithin` over geography takes metres, and a page that converted at the call
 * site would be one refactor away from sending 250 metres.
 */
function useMergeSearch(habitatId: string) {
	const unit = proximitySearchUnit(useOrganizationSettings().unitDefaults.distance);
	const defaultRadius = unit.steps[0] ?? 100;
	const [radius, setRadius] = useState(defaultRadius);

	const radiusMetres = radius * (unit.unitCode === 'foot' ? 0.3048 : 1);
	const nearby = useNearbyHabitats(habitatId, radiusMetres);
	const target = nearby.data?.target;
	const candidates = nearby.data?.candidates ?? [];

	// The uuid otherwise stands in the trail where the habitat's name belongs, the
	// way it does on every other by-id page.
	useBreadcrumbLabel(habitatId, target?.label ?? '');

	const mapData = useMemo(
		() => mergeMapData(target, candidates, radiusMetres),
		[candidates, radiusMetres, target],
	);

	// The ring, which is the extent the search covers whether or not anything came
	// back. `fitToData` resolves a boolean from the tile layers, and this canvas
	// has none: its features are a GeoJSON overlay, so the box has to be handed in.
	const bounds = useMemo(
		() =>
			target === undefined || target.lat === null || target.lng === null
				? null
				: boundsFromGeoJson(circlePolygon({ lat: target.lat, lng: target.lng }, radiusMetres)),
		[radiusMetres, target],
	);

	return {
		bounds,
		candidates,
		defaultRadius,
		mapData,
		nearby,
		radius,
		setRadius,
		target,
		unit,
	};
}

/**
 * Which habitats are ticked.
 *
 * Its own hook so the page body stays about what it shows. The set is rebuilt
 * rather than mutated, because a `Set` changed in place is the same object and
 * React would keep the previous render.
 */
function useHabitatSelection() {
	const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

	const toggle = useCallback((habitatId: string) => {
		setSelected((current) => {
			const next = new Set(current);
			if (!next.delete(habitatId)) {
				next.add(habitatId);
			}
			return next;
		});
	}, []);

	const clear = useCallback(() => setSelected(new Set()), []);

	return { selected, toggle, clear };
}

/**
 * The map overlay: the radius, the habitat being kept, and what stands near it.
 *
 * The same three roles the service-request context view draws, painted by the
 * same layer. A habitat carries `family: 'surveillance'` because that is what it
 * is, and the ring is what turns the radius from a number on a button into a
 * distance a reader can see against the street it covers.
 */
function mergeMapData(
	target: DuplicateRecord | undefined,
	candidates: readonly NearbyHabitat[],
	radiusMetres: number,
): GeoJSON.FeatureCollection | null {
	if (target === undefined || target.lat === null || target.lng === null) {
		return null;
	}

	const center = { lat: target.lat, lng: target.lng };
	const features: GeoJSON.Feature[] = [
		{
			type: 'Feature',
			properties: { role: 'ring' },
			geometry: circlePolygon(center, radiusMetres) as unknown as GeoJSON.Polygon,
		},
	];

	for (const candidate of candidates) {
		if (candidate.lat === null || candidate.lng === null) {
			continue;
		}
		features.push({
			type: 'Feature',
			properties: { role: 'nearby', id: candidate.id, family: 'surveillance' },
			geometry: { type: 'Point', coordinates: [candidate.lng, candidate.lat] },
		});
	}

	features.push({
		type: 'Feature',
		properties: { role: 'center' },
		geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
	});

	return { type: 'FeatureCollection', features };
}

/**
 * What the surviving habitat says, to compare the candidates against.
 *
 * Every candidate row carries its description, and until this was here there was
 * nothing on the page to read them against: whether "CHECK ruts in old sewerline
 * trail" is the same site as the one being kept is the question, and the answer
 * was on another page.
 *
 * In the filter card rather than above the rows, because it has to stay put. Two
 * records for one basin are compared a line at a time, and a block at the top of
 * a list of fifty scrolls away on the first flick.
 *
 * Read-only. Editing what the survivor says is the confirmation's job, where the
 * change travels with the merge in one transaction; an edit here would be a
 * second write with nothing tying it to the merge it was made for.
 */
function KeptHabitat({ target }: { readonly target: DuplicateRecord | undefined }) {
	if (target === undefined) {
		return null;
	}

	const description = target.fields.description ?? null;

	return (
		<div className="grid gap-1">
			<span className="font-medium text-sm">Keeping</span>
			<p className="font-medium text-foreground text-sm">{labelOf(target)}</p>
			{/*
			 * Capped and scrollable. A habitat description is often a paragraph of
			 * turn-by-turn directions, and at full height it pushes the radius off the
			 * card that is the only control on the page.
			 */}
			<p className="max-h-28 overflow-y-auto whitespace-pre-line text-muted-foreground text-sm">
				{description ?? 'No description recorded.'}
			</p>
		</div>
	);
}

/**
 * How wide to look, in the agency's own units.
 *
 * Fixed steps rather than a free number, because the useful answers here are a
 * short list and every one of them is a judgement about how the records were
 * filed. A box invites a number nobody can check, and the widest step is already
 * wide enough that the answers stop being duplicates and start being neighbours.
 */
function RadiusControl({
	onChange,
	radius,
	unit,
}: {
	readonly onChange: (radius: number) => void;
	readonly radius: number;
	readonly unit: ReturnType<typeof proximitySearchUnit>;
}) {
	const groupId = useId();

	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-sm" id={groupId}>
				Search within
			</span>
			<ToggleGroup
				aria-labelledby={groupId}
				onValueChange={(value: string) => {
					// The primitive clears the selection when the pressed item is pressed
					// again. There is no such thing as no radius, so an empty value keeps
					// the one already chosen.
					if (value !== '') {
						onChange(Number(value));
					}
				}}
				size="sm"
				type="single"
				value={String(radius)}
				variant="outline"
			>
				{unit.steps.map((step) => (
					<ToggleGroupItem key={step} value={String(step)}>
						{proximityLabel(step, unit)}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}

/**
 * The button that opens the confirmation, under the results list.
 *
 * Absent until something is ticked, so it is never a button that does nothing.
 * The trimming note sits here because it is a fact about the list above it: past
 * the limit the nearest hundred are what came back, and a reader who cannot see
 * that would read a full list as the whole answer.
 */
function MergeFooter({
	count,
	isTrimmed,
	onMerge,
	target,
}: {
	readonly count: number;
	readonly isTrimmed: boolean;
	readonly onMerge: () => void;
	readonly target: DuplicateRecord | undefined;
}) {
	if (target === undefined || (count === 0 && !isTrimmed)) {
		return null;
	}

	return (
		<div className="grid gap-2">
			{isTrimmed ? (
				<p className="text-muted-foreground text-xs">
					The {NEARBY_LIMIT} nearest are shown. Narrow the search to see the rest.
				</p>
			) : null}
			{count === 0 ? null : (
				<WriteOnly minimum="manager">
					<Button className="w-full" onClick={onMerge} size="sm">
						<MergeIcon aria-hidden="true" />
						Merge {count} into {labelOf(target)}
					</Button>
				</WriteOnly>
			)}
		</div>
	);
}

function CandidateRow({
	candidate,
	isSelected,
	onToggle,
	unit,
}: {
	readonly candidate: NearbyHabitat;
	readonly isSelected: boolean;
	readonly onToggle: () => void;
	readonly unit: ReturnType<typeof proximitySearchUnit>;
}) {
	const checkboxId = useId();

	return (
		<Item size="sm" variant={isSelected ? 'muted' : 'default'}>
			<ItemMedia>
				<Checkbox checked={isSelected} id={checkboxId} onCheckedChange={onToggle} />
			</ItemMedia>
			<ItemContent className="min-w-0">
				<ItemTitle>
					<Label className="cursor-pointer font-medium" htmlFor={checkboxId}>
						{labelOf(candidate)}
					</Label>
					{candidate.isActive ? null : (
						<Badge className="ml-2" variant="outline">
							Retired
						</Badge>
					)}
				</ItemTitle>
				<ItemDescription className="truncate">
					{distanceLabel(candidate.distanceMetres, unit)} away
					{candidate.detail === null ? null : <> · {candidate.detail}</>}
				</ItemDescription>
			</ItemContent>
			<ItemActions>
				<Button asChild size="sm" variant="ghost">
					<Link params={{ id: candidate.id }} to="/larval-surveillance/habitats/$id">
						Open
					</Link>
				</Button>
			</ItemActions>
		</Item>
	);
}

/**
 * How far away a candidate is, in the agency's units.
 *
 * Rounded to whole units below ten and to the nearest ten above, because the
 * reader is judging "is that this basin or the next one" and a distance to the
 * metre implies the two points are that accurate. They are not: both are
 * somebody standing near a thing with a phone.
 */
function distanceLabel(metres: number, unit: ReturnType<typeof proximitySearchUnit>): string {
	const amount = unit.unitCode === 'foot' ? metres / 0.3048 : metres;
	const rounded = amount < 10 ? Math.round(amount) : Math.round(amount / 10) * 10;
	return proximityLabel(rounded, unit);
}

function labelOf(record: DuplicateRecord): string {
	return record.label.trim() === '' ? config.unnamed : record.label;
}
