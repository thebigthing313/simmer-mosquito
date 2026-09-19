import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ArrowRightIcon, ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import { formatWeekdayMonthDay } from '../../lib/local-date';
import {
	CollectionFlagBadges,
	collectionEffectiveDate,
	isPendingCollection,
	SpeciesSexBadge,
	SpeciesStatusBadge,
} from './adult-display';
import {
	type DirectoryCollection,
	type DirectorySpecies,
	specimenTotals,
	summaryLabel,
} from './trap-directory-data';

export function CollectionRow({
	collection,
	speciesNameById,
	timeZone,
}: {
	readonly collection: DirectoryCollection;
	readonly speciesNameById: ReadonlyMap<string, string>;
	/** Passed down rather than read here, so a row opens no live query of its own. */
	readonly timeZone: string;
}) {
	const date = collectionEffectiveDate(collection, timeZone);
	const isPending = isPendingCollection(collection);
	const totals = specimenTotals(collection.species);

	return (
		<li>
			<Collapsible>
				<CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
					<ChevronRightIcon
						aria-hidden="true"
						className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-90 motion-reduce:transition-none"
					/>
					<span className="w-24 shrink-0 font-medium text-foreground text-sm tabular-nums">
						{date === null ? <AbsentValue /> : formatWeekdayMonthDay(date)}
					</span>
					<CollectionFlagBadges
						className="flex min-w-0 flex-wrap items-center gap-1.5"
						collection={collection}
					/>
					<span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
						{summaryLabel(collection, totals)}
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="grid gap-3 border-border/40 border-t bg-muted/20 px-4 py-3">
						<CollectionSpecies
							isPending={isPending}
							isZeroResult={collection.isZeroResult}
							nameById={speciesNameById}
							species={collection.species}
						/>
						<Link
							className={cn(
								recordLink({ size: 'xs', tone: 'muted' }),
								'inline-flex w-fit items-center gap-1.5 transition-colors',
							)}
							params={{ id: collection.id }}
							to="/adult-surveillance/collections/$id"
						>
							Open collection record
							<ArrowRightIcon aria-hidden="true" className="size-3.5" />
						</Link>
					</div>
				</CollapsibleContent>
			</Collapsible>
		</li>
	);
}

function CollectionSpecies({
	species,
	isPending,
	isZeroResult,
	nameById,
}: {
	readonly species: readonly DirectorySpecies[];
	readonly isPending: boolean;
	readonly isZeroResult: boolean;
	readonly nameById: ReadonlyMap<string, string>;
}) {
	// Most numerous first: what the trap caught most of is the finding, and a
	// catalog-alphabetical list buries it behind whatever starts with an A.
	const entries = [...species].sort((first, second) => {
		if (second.count !== first.count) {
			return second.count - first.count;
		}
		return (nameById.get(first.speciesId) ?? '').localeCompare(
			nameById.get(second.speciesId) ?? '',
		);
	});

	if (isPending) {
		return (
			<SpeciesNote>
				This trap is still out. Its specimens are recorded once it is collected.
			</SpeciesNote>
		);
	}
	if (isZeroResult) {
		return <SpeciesNote>Marked zero result. Nothing was collected.</SpeciesNote>;
	}
	if (entries.length === 0) {
		return <SpeciesNote>No species have been identified in this collection.</SpeciesNote>;
	}

	return (
		<div className="overflow-hidden rounded-md border border-border/40 bg-background">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="min-w-[11rem]">Species</TableHead>
						<TableHead className="w-[7rem]">Sex</TableHead>
						<TableHead className="w-[8rem]">Status</TableHead>
						<TableHead className="w-[6rem] text-right">Count</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{entries.map((entry) => (
						<TableRow key={entry.id}>
							<TableCell>
								{/* Binomials read italic wherever they appear in the app. */}
								<span className="italic">{nameById.get(entry.speciesId) ?? 'Unknown species'}</span>
							</TableCell>
							<TableCell>
								{entry.sex === null ? (
									<span className="text-muted-foreground text-xs">Unsexed</span>
								) : (
									<SpeciesSexBadge sex={entry.sex} />
								)}
							</TableCell>
							<TableCell>
								{entry.status === null ? (
									<span className="text-muted-foreground text-xs">Not recorded</span>
								) : (
									<SpeciesStatusBadge status={entry.status} />
								)}
							</TableCell>
							<TableCell className="text-right font-medium tabular-nums">
								{entry.count.toLocaleString('en-US')}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function SpeciesNote({ children }: { readonly children: string }) {
	return <p className="m-0 text-muted-foreground text-sm">{children}</p>;
}
