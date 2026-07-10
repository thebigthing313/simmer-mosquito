import type {
	AdultCollectionRow,
	CollectionLureRow,
	CollectionMethodRow,
	CollectionSpeciesRow,
	ProfileRow,
	SpeciesRow,
	SpeciesSex,
	SpeciesStatus,
	TrapRow,
} from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@simmer-mosquito/ui-web/components/ui/command';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	ArrowLeftIcon,
	ChevronDownIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useMemo, useState } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import {
	CollectionFlagBadges,
	collectionEffectiveDate,
	collectionTitle,
	SPECIES_SEX_VALUES,
	SPECIES_STATUS_VALUES,
	SpeciesSexBadge,
	SpeciesStatusBadge,
	speciesSexLabel,
	speciesStatusLabel,
	trapDisplayName,
} from '../-adult-display';
import { formatMonthDay, todayInTimeZone } from '../-overview-data';

export const Route = createFileRoute('/adult-surveillance/collections/$id')({
	component: RouteComponent,
});

const CollectionIcon = iconRegistry.entities.collection.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;
const TrapIcon = iconRegistry.entities.trap.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

const collectionGcTimeMs = 30_000;

function RouteComponent() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	return <CollectionDetail actorProfileId={actorProfileId} collectionId={id} />;
}

function CollectionDetail({
	collectionId,
	actorProfileId,
}: {
	readonly collectionId: string;
	readonly actorProfileId: string | null;
}) {
	const result = useLiveQuery(
		{
			gcTime: collectionGcTimeMs,
			query: (query) =>
				query
					.from({ collection: webCollections.collections })
					.where(({ collection }) => eq(collection.id, collectionId))
					.findOne(),
		},
		[collectionId],
	);
	const collection = result.data as AdultCollectionRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[1200px] content-start gap-5 px-4 py-6 pb-10 md:px-8">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
					to="/adult-surveillance/collections"
				>
					<ArrowLeftIcon aria-hidden="true" />
					Back to collections
				</Link>
				{!result.isReady ? (
					<CollectionDetailSkeleton />
				) : collection === undefined ? (
					<CollectionUnavailable />
				) : (
					<CollectionDetailContent actorProfileId={actorProfileId} collection={collection} />
				)}
			</div>
		</div>
	);
}

function CollectionDetailContent({
	collection,
	actorProfileId,
}: {
	readonly collection: AdultCollectionRow;
	readonly actorProfileId: string | null;
}) {
	const title = collectionTitle(collection);
	useBreadcrumbLabel(collection.id, title);

	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const { rows: lures } = useCollectionRows<CollectionLureRow>(webCollections.collectionLures);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);

	const methodName =
		methods.find((method) => method.id === collection.collectionMethodId)?.name ?? 'Unknown method';
	const lureName =
		collection.collectionLureId === null
			? null
			: (lures.find((lure) => lure.id === collection.collectionLureId)?.name ?? 'Unknown lure');
	const trap =
		collection.trapId === null ? null : (traps.find((t) => t.id === collection.trapId) ?? null);
	const profileNameById = useMemo(
		() => new Map(profiles.map((profile) => [profile.id, profile.displayName])),
		[profiles],
	);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<CollectionIcon aria-hidden="true" className="size-3.5" />
						Collection
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">{title}</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{trap === null ? 'Ad-hoc collection' : trapDisplayName(trap)} · {methodName}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<CollectionFlagBadges
						className="flex flex-wrap items-center gap-1.5"
						collection={collection}
					/>
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: collection.id }} to="/adult-surveillance/collections/$id/edit">
							<EditIcon aria-hidden="true" />
							Edit
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<SpeciesCard actorProfileId={actorProfileId} collection={collection} />
					<ResultFlagsCard collection={collection} />
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<DetailsCard
						collection={collection}
						lureName={lureName}
						methodName={methodName}
						profileNameById={profileNameById}
						trap={trap}
					/>
					<CommentsSection
						description="Field notes, identification remarks, and follow-up for this collection."
						target={{ type: 'collection', id: collection.id }}
					/>
				</div>
			</div>
		</>
	);
}

// --- species -----------------------------------------------------------------

interface SpeciesEntry {
	readonly id: string;
	readonly speciesId: string;
	readonly count: number;
	readonly sex: SpeciesSex | null;
	readonly status: SpeciesStatus | null;
	readonly identifiedByProfileId: string | null;
}

function SpeciesCard({
	collection,
	actorProfileId,
}: {
	readonly collection: AdultCollectionRow;
	readonly actorProfileId: string | null;
}) {
	const { rows: species } = useCollectionRows<SpeciesRow>(webCollections.species);
	const speciesNameById = useMemo(
		() => new Map(species.map((row) => [row.id, row.displayName])),
		[species],
	);

	const result = useLiveQuery(
		{
			gcTime: collectionGcTimeMs,
			query: (query) =>
				query
					.from({ collectionSpecies: webCollections.collectionSpecies })
					.where(({ collectionSpecies }) => eq(collectionSpecies.collectionId, collection.id))
					.orderBy(({ collectionSpecies }) => collectionSpecies.createdAt, 'asc')
					.select(({ collectionSpecies }) => ({
						id: collectionSpecies.id,
						speciesId: collectionSpecies.speciesId,
						count: collectionSpecies.count,
						sex: collectionSpecies.sex,
						status: collectionSpecies.status,
						identifiedByProfileId: collectionSpecies.identifiedByProfileId,
					})),
		},
		[collection.id],
	);
	const entries = (result.data ?? []) as unknown as readonly SpeciesEntry[];
	const total = useMemo(
		() => entries.reduce((sum, entry) => sum + (entry.count ?? 0), 0),
		[entries],
	);

	const removeSpecies = (entryId: string) => {
		void webCollections.collectionSpecies.delete(entryId);
	};

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<SpeciesIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							Species
						</CardTitle>
						<CardDescription>Specimens identified in this collection.</CardDescription>
					</div>
					{entries.length > 0 ? (
						<Badge tone="neutral" variant="outline">
							{total.toLocaleString()} specimens
						</Badge>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				{result.isError ? (
					<SpeciesEmpty
						description="Species records could not be loaded."
						title="Species unavailable"
					/>
				) : !result.isReady ? (
					<div className="grid gap-2">
						{[0, 1].map((index) => (
							<Skeleton className="h-12 w-full" key={index} />
						))}
					</div>
				) : entries.length === 0 ? (
					<SpeciesEmpty
						description="No species recorded yet. Add the specimens identified below."
						title="No species recorded"
					/>
				) : (
					<ul className="grid gap-2">
						{entries.map((entry) => (
							<li
								className="flex items-center gap-3 rounded-md border border-border/40 bg-background/60 px-3 py-2.5"
								key={entry.id}
							>
								<div className="grid min-w-0 flex-1 gap-1">
									<span className="truncate font-medium text-foreground text-sm italic">
										{speciesNameById.get(entry.speciesId) ?? 'Unknown species'}
									</span>
									<div className="flex flex-wrap items-center gap-1.5">
										<SpeciesSexBadge sex={entry.sex} />
										<SpeciesStatusBadge status={entry.status} />
									</div>
								</div>
								<span className="shrink-0 font-semibold text-foreground text-sm tabular-nums">
									{entry.count.toLocaleString()}
								</span>
								<Button
									aria-label="Remove species"
									onClick={() => removeSpecies(entry.id)}
									size="icon"
									type="button"
									variant="ghost"
								>
									<DeleteIcon aria-hidden="true" className="size-4" />
								</Button>
							</li>
						))}
					</ul>
				)}

				<AddSpeciesForm actorProfileId={actorProfileId} collection={collection} species={species} />
			</CardContent>
		</Card>
	);
}

function AddSpeciesForm({
	collection,
	species,
	actorProfileId,
}: {
	readonly collection: AdultCollectionRow;
	readonly species: readonly SpeciesRow[];
	readonly actorProfileId: string | null;
}) {
	const [speciesId, setSpeciesId] = useState<string | null>(null);
	const [count, setCount] = useState('');
	const [sex, setSex] = useState<SpeciesSex | 'unset'>('unset');
	const [status, setStatus] = useState<SpeciesStatus | 'unset'>('unset');
	const [error, setError] = useState<string | null>(null);

	const speciesName =
		speciesId === null ? null : (species.find((row) => row.id === speciesId)?.displayName ?? null);
	const countValue = Number.parseInt(count, 10);
	const canAdd = speciesId !== null && Number.isFinite(countValue) && countValue > 0;

	const add = () => {
		if (!canAdd || speciesId === null) {
			setError('Choose a species and a count of at least 1.');
			return;
		}
		setError(null);
		const now = new Date().toISOString();
		const row: CollectionSpeciesRow = {
			id: crypto.randomUUID(),
			organizationId: collection.organizationId,
			collectionId: collection.id,
			speciesId,
			count: countValue,
			sex: sex === 'unset' ? null : sex,
			status: status === 'unset' ? null : status,
			identifiedByProfileId: actorProfileId,
			identifiedDate: todayInTimeZone(undefined),
			createdByProfileId: actorProfileId,
			updatedByProfileId: actorProfileId,
			createdAt: now,
			updatedAt: now,
		};
		void webCollections.collectionSpecies.insert(row);
		setSpeciesId(null);
		setCount('');
		setSex('unset');
		setStatus('unset');
	};

	return (
		<div className="grid gap-3 rounded-md border border-border/50 border-dashed bg-muted/20 p-3">
			<span className="font-medium text-foreground text-sm">Add species</span>
			<div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<SpeciesPicker
					onSelect={setSpeciesId}
					selectedLabel={speciesName}
					species={species}
					value={speciesId}
				/>
				<Input
					aria-label="Count"
					inputMode="numeric"
					min={1}
					onChange={(event) => setCount(event.target.value)}
					placeholder="Count"
					type="number"
					value={count}
				/>
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				<Select onValueChange={(next) => setSex(next as SpeciesSex | 'unset')} value={sex}>
					<SelectTrigger aria-label="Sex">
						<SelectValue placeholder="Sex" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="unset">Unsexed</SelectItem>
						{SPECIES_SEX_VALUES.map((value) => (
							<SelectItem key={value} value={value}>
								{speciesSexLabel(value)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select onValueChange={(next) => setStatus(next as SpeciesStatus | 'unset')} value={status}>
					<SelectTrigger aria-label="Status">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="unset">Not recorded</SelectItem>
						{SPECIES_STATUS_VALUES.map((value) => (
							<SelectItem key={value} value={value}>
								{speciesStatusLabel(value)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{error === null ? null : <p className="m-0 text-destructive text-xs">{error}</p>}
			<div className="flex justify-end">
				<Button disabled={!canAdd} onClick={add} size="sm" type="button">
					Add species
				</Button>
			</div>
		</div>
	);
}

function SpeciesPicker({
	species,
	value,
	selectedLabel,
	onSelect,
}: {
	readonly species: readonly SpeciesRow[];
	readonly value: string | null;
	readonly selectedLabel: string | null;
	readonly onSelect: (id: string) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button className="justify-between font-normal" type="button" variant="outline">
					<span className={cn('truncate', value === null && 'text-muted-foreground')}>
						{selectedLabel ?? 'Select species'}
					</span>
					<ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0">
				<Command>
					<CommandInput placeholder="Search species…" />
					<CommandList>
						<CommandEmpty>No species found</CommandEmpty>
						<CommandGroup>
							{species.map((row) => (
								<CommandItem
									key={row.id}
									onSelect={() => {
										onSelect(row.id);
										setOpen(false);
									}}
									value={`${row.displayName} ${row.id}`}
								>
									<span className="truncate italic">{row.displayName}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function SpeciesEmpty({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[120px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<SpeciesIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

// --- result flags ------------------------------------------------------------

function ResultFlagsCard({ collection }: { readonly collection: AdultCollectionRow }) {
	const setFlag = (key: 'isZeroResult' | 'hasBycatch' | 'hasProblem', value: boolean) => {
		void webCollections.collections.update(collection.id, (draft) => {
			(draft as { -readonly [K in keyof AdultCollectionRow]: AdultCollectionRow[K] })[key] = value;
		});
	};

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Result</CardTitle>
				<CardDescription>Flags recorded for this collection.</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				<FlagRow
					checked={collection.isZeroResult}
					description="No specimens were collected."
					label="Zero result"
					onChange={(value) => setFlag('isZeroResult', value)}
				/>
				<FlagRow
					checked={collection.hasBycatch}
					description="Non-target specimens were present."
					label="Bycatch"
					onChange={(value) => setFlag('hasBycatch', value)}
				/>
				<FlagRow
					checked={collection.hasProblem}
					description="Trap failure, tampering, or a compromised sample."
					label="Problem"
					onChange={(value) => setFlag('hasProblem', value)}
				/>
			</CardContent>
		</Card>
	);
}

function FlagRow({
	label,
	description,
	checked,
	onChange,
}: {
	readonly label: string;
	readonly description: string;
	readonly checked: boolean;
	readonly onChange: (value: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<div className="grid gap-0.5">
				<span className="font-medium text-foreground text-sm">{label}</span>
				<span className="text-muted-foreground text-xs">{description}</span>
			</div>
			<Switch checked={checked} onCheckedChange={onChange} />
		</div>
	);
}

// --- details -----------------------------------------------------------------

function DetailsCard({
	collection,
	trap,
	methodName,
	lureName,
	profileNameById,
}: {
	readonly collection: AdultCollectionRow;
	readonly trap: TrapRow | null;
	readonly methodName: string;
	readonly lureName: string | null;
	readonly profileNameById: ReadonlyMap<string, string>;
}) {
	const collectedDate = collectionEffectiveDate(collection);
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Trap">
						{trap === null ? (
							<span className="text-muted-foreground italic">Ad-hoc — no trap</span>
						) : (
							<Link
								className="inline-flex items-center gap-1.5 rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: trap.id }}
								to="/adult-surveillance/traps/$id"
							>
								<TrapIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
								{trapDisplayName(trap)}
							</Link>
						)}
					</DetailRow>
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow label="Lure">
						{lureName ?? <span className="text-muted-foreground">None</span>}
					</DetailRow>
					<DetailRow label="Collected">
						{collectedDate === null ? (
							<span className="text-muted-foreground">Pending</span>
						) : (
							formatMonthDay(collectedDate)
						)}
					</DetailRow>
					<DetailRow label="Set">
						{collection.startedAt === null ? (
							<span className="text-muted-foreground">Not recorded</span>
						) : (
							formatMonthDay(collection.startedAt)
						)}
					</DetailRow>
					<DetailRow label="Collected by">
						{collection.collectedByProfileId === null ? (
							<span className="text-muted-foreground">Unassigned</span>
						) : (
							(profileNameById.get(collection.collectedByProfileId) ?? 'Unknown')
						)}
					</DetailRow>
					<DetailRow label="Set by">
						{collection.setByProfileId === null ? (
							<span className="text-muted-foreground">Unassigned</span>
						) : (
							(profileNameById.get(collection.setByProfileId) ?? 'Unknown')
						)}
					</DetailRow>
				</dl>
			</CardContent>
		</Card>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[110px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

// --- states + helpers --------------------------------------------------------

function CollectionDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-8 w-64" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<Skeleton className="h-64" />
					<Skeleton className="h-40" />
				</div>
				<Skeleton className="h-72" />
			</div>
		</>
	);
}

function CollectionUnavailable() {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>Collection unavailable</EmptyTitle>
				<EmptyDescription>
					This collection could not be found, or you do not have access to it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
