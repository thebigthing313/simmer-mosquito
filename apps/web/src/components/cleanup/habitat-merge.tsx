import {
	convertUnitAmount,
	type ProximitySearchUnit,
	proximityLabel,
	proximitySearchUnit,
} from '@simmer-mosquito/domain';
import { boundsFromGeoJson, circlePolygon } from '@simmer-mosquito/mapping';
import { ListEmpty, ListLoading } from '@simmer-mosquito/ui-web/components/page/list-states';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ItemGroup } from '@simmer-mosquito/ui-web/components/ui/item';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
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
import { MapSplitPage } from '../app-shell/outlet/map-split-page';
import { MapCanvas } from '../map';
import { WriteOnly } from '../write-only';
import { mergeMapData } from './habitat-merge-map';
import { MergeConfirmDialog } from './merge-confirm-dialog';
import { CandidateRow } from './nearby-habitat-row';
import { RECORD_CLEANUP_CONFIGS, recordCountLabel, recordLabel } from './record-cleanup-config';

const MergeIcon = iconRegistry.actions.merge.icon;
const config = RECORD_CLEANUP_CONFIGS.habitat;
/** How many neighbours the endpoint answers with. Past this the list is trimmed. */
const NEARBY_LIMIT = 100;

/**
 * Folding the habitats standing in one spot into the one that stays.
 *
 * Not a cleanup list, which is what addresses and contacts get. Two records for
 * one catch basin agree about nothing except where they are: the crew that
 * filed the second gave it their own handle and their own description, so a
 * shared-value search finds neither pair. The only evidence is proximity, and a
 * page that listed every pair of habitats within a radius of each other would
 * propose most of an organization's inspection sites.
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
 * records landed depends on how each was filed. A GPS fix under tree cover and
 * a point dropped on an aerial can be tens of metres apart for one ditch, and
 * an organization that maps culverts every hundred feet needs a tighter one
 * than that.
 */
export function HabitatMerge({ habitatId }: { readonly habitatId: string }) {
	const [isConfirming, setIsConfirming] = useState(false);
	const { selected, toggle, clear } = useHabitatSelection();
	const { bounds, candidates, mapData, nearby, radius, setRadius, target, unit } =
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
			toast.success(
				`Merged ${recordCountLabel(sources.length, config)} into ${recordLabel(target, config)}.`,
			);
			clear();
			await queryClient.invalidateQueries({ queryKey: nearbyHabitatsKey(habitatId) });
		},
		[clear, habitatId, merge, queryClient, sources, target],
	);

	return (
		<>
			<MapSplitPage
				map={
					<MapCanvas
						controls={{ measure: true, readout: true }}
						fitToData={bounds}
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
					/>
				}
			>
				<div className="flex h-full min-h-0 flex-col">
					<div className={stickyHeader({ surface: 'page' })}>
						<Link
							className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
							params={{ id: habitatId }}
							to="/larval-surveillance/habitats/$id"
						>
							<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
							Back to habitat
						</Link>
						<h1 className="flex items-center gap-2 font-semibold text-foreground text-lg leading-tight">
							<MergeIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
							<span className="min-w-0 truncate">
								{target === undefined
									? 'Merge duplicates'
									: `Merge into ${recordLabel(target, config)}`}
							</span>
						</h1>
						<RadiusControl onChange={setRadius} radius={radius} unit={unit} />
						<KeptHabitat target={target} />
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto p-3">
						<CandidateList
							candidates={candidates}
							isError={nearby.isError}
							isPending={nearby.isPending}
							onRetry={() => void nearby.refetch()}
							onToggle={toggle}
							radius={radius}
							selected={selected}
							unit={unit}
						/>
					</div>

					<MergeFooter
						count={sources.length}
						isTrimmed={candidates.length >= NEARBY_LIMIT}
						onMerge={() => setIsConfirming(true)}
						target={target}
					/>
				</div>
			</MapSplitPage>

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

/** The neighbours, or why there are none to show. */
function CandidateList({
	candidates,
	isError,
	isPending,
	onRetry,
	onToggle,
	radius,
	selected,
	unit,
}: {
	readonly candidates: readonly NearbyHabitat[];
	readonly isError: boolean;
	readonly isPending: boolean;
	readonly onRetry: () => void;
	readonly onToggle: (habitatId: string) => void;
	readonly radius: number;
	readonly selected: ReadonlySet<string>;
	readonly unit: ProximitySearchUnit;
}) {
	if (isPending) {
		return <ListLoading rows={4} />;
	}

	if (isError) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Could not look for nearby habitats</AlertTitle>
				<AlertDescription className="grid gap-3">
					<span>Try again, or narrow the search.</span>
					<Button className="justify-self-start" onClick={onRetry} size="sm" variant="outline">
						Try again
					</Button>
				</AlertDescription>
			</Alert>
		);
	}

	if (candidates.length === 0) {
		return (
			<ListEmpty
				description={`Nothing else is recorded within ${proximityLabel(radius, unit)} of this habitat. Widen the search if the duplicate was filed from a different spot.`}
				icon={config.icon}
				title="No other habitats nearby"
			/>
		);
	}

	return (
		<ItemGroup>
			{candidates.map((candidate) => (
				<CandidateRow
					candidate={candidate}
					isSelected={selected.has(candidate.id)}
					key={candidate.id}
					onToggle={() => onToggle(candidate.id)}
					unit={unit}
				/>
			))}
		</ItemGroup>
	);
}

/**
 * The search this page is: a radius, what came back, and what the map draws.
 *
 * Its own hook so the component stays about what it shows. The radius is held
 * in the organization's units and converted once, here, because the buttons say
 * feet and `st_dwithin` over geography takes metres, and a page that converted
 * at the call site would be one refactor away from sending 250 metres.
 */
function useMergeSearch(habitatId: string) {
	const unit = proximitySearchUnit(useOrganizationSettings().unitDefaults.distance);
	const [radius, setRadius] = useState(unit.steps[0] ?? 100);

	// Through the domain's conversion table rather than a factor written here.
	// `record-merge-reads.ts` and `coverage-features.ts` already convert that way,
	// and a second copy of 0.3048 is a second place for the two to disagree.
	const radiusMetres = convertUnitAmount(radius, unit.unitCode, 'meter') ?? radius;
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
			<p className="font-medium text-foreground text-sm">{recordLabel(target, config)}</p>
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
 * How wide to look, in the organization's own units.
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
	readonly unit: ProximitySearchUnit;
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
 * The button that opens the confirmation, pinned under the list.
 *
 * Absent until something is ticked, so it is never a button that does nothing,
 * and outside the scrolling region so a reader who ticked something at the
 * bottom of fifty does not scroll back up to act on it.
 *
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
		<div className="shrink-0 grid gap-2 border-border/40 border-t p-3">
			{isTrimmed ? (
				<p className="text-muted-foreground text-xs">
					The {NEARBY_LIMIT} nearest are shown. Narrow the search to see the rest.
				</p>
			) : null}
			{count === 0 ? null : (
				<WriteOnly minimum="manager">
					<Button className="w-full" onClick={onMerge} size="sm">
						<MergeIcon aria-hidden="true" />
						Merge {count} into {recordLabel(target, config)}
					</Button>
				</WriteOnly>
			)}
		</div>
	);
}
