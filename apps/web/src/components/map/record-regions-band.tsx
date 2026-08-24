import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Card, CardContent } from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
	type RecordRegionGroup,
	type RegionMembershipRecordType,
	useRecordRegions,
} from '../../hooks/use-record-regions';

const RegionIcon = iconRegistry.entities.region.icon;

const UNFILED_LABEL = 'No folder';

/**
 * Six chips is roughly one line at the band's width.
 *
 * On production every folder holds exactly one region for a point record, so the
 * expander only ever fires on the region detail page — which is where one
 * municipality overlaps 38 sections.
 */
const CHIPS_BEFORE_COLLAPSE = 6;

/**
 * The regions this record falls inside, as a band under its map card.
 *
 * The answer is spatial, so it sits directly under the shape it came from.
 * Chosen against two rejected variants on `prototype/regions-panel`: a card in
 * the sticky rail, which puts a spatial answer a column away from the map, and
 * rows inside the Details card, which reads well at one folder and pushes
 * Created and Updated most of a screen down at ten.
 *
 * No total count. The rows are the answer, and a tally above them is a second
 * thing to read that says less. Only folders with a hit appear, plus a "No
 * folder" row when unfiled regions match, and nothing enforces that folders
 * partition space — `region_folder_id` is nullable and two regions in one folder
 * may cover the same point — so a folder row renders N chips rather than one.
 */
export function RecordRegionsBand({
	recordType,
	recordId,
	noun,
}: {
	readonly recordType: RegionMembershipRecordType;
	readonly recordId: string;
	/** The record's own noun, for the empty state: "This habitat is inside…". */
	readonly noun: string;
}) {
	const { data, isPending, isError } = useRecordRegions(recordType, recordId);

	if (isPending) {
		return (
			<BandShell>
				<Skeleton className="h-5 w-64" />
			</BandShell>
		);
	}

	if (isError) {
		return (
			<BandShell>
				<p className="m-0 text-sm text-muted-foreground">Regions could not be read.</p>
			</BandShell>
		);
	}

	// `found: false` renders nothing at all — no band, no message, no error. If the
	// record is gone the page around this is already showing something it should
	// not, and a band announcing "not found" under a rendered record contradicts
	// the page it sits in. That race belongs to the page's own error handling.
	if (!data.found) {
		return null;
	}

	if (data.groups.length === 0) {
		return (
			<BandShell>
				<p className="m-0 text-sm text-muted-foreground">
					This {noun} is inside none of your regions.
				</p>
			</BandShell>
		);
	}

	return (
		<BandShell>
			{/* Scrolls internally past roughly five folders rather than growing
			    without limit, so a large folder set cannot push the rest of the page
			    down. Measured on the prototype at ten folders and thirteen regions:
			    208px visible against 352px of content. */}
			<div className="grid max-h-52 gap-2 overflow-y-auto">
				{data.groups.map((group) => (
					<FolderRow group={group} key={group.folderId ?? '__unfiled'} />
				))}
			</div>
		</BandShell>
	);
}

function BandShell({ children }: { readonly children: React.ReactNode }) {
	return (
		<Card variant="inset">
			<CardContent className="grid gap-3" padding="compact">
				<p className="m-0 flex items-center gap-2 text-sm font-medium">
					<RegionIcon aria-hidden="true" className="size-3.5" />
					Regions
				</p>
				{children}
			</CardContent>
		</Card>
	);
}

function FolderRow({ group }: { readonly group: RecordRegionGroup }) {
	const [expanded, setExpanded] = useState(false);
	const overflow = group.regions.length - CHIPS_BEFORE_COLLAPSE;
	const shown =
		expanded || overflow <= 0 ? group.regions : group.regions.slice(0, CHIPS_BEFORE_COLLAPSE);

	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="min-w-24 text-xs text-muted-foreground">
				{group.folderName ?? UNFILED_LABEL}
			</span>
			{shown.map((region) => (
				<Badge asChild key={region.id} variant="secondary">
					<Link params={{ id: region.id }} to="/gis/regions/$id">
						{region.name}
					</Link>
				</Badge>
			))}
			{overflow > 0 ? (
				<button
					className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
					onClick={() => setExpanded((value) => !value)}
					type="button"
				>
					{expanded ? 'Show fewer' : `and ${overflow} more`}
				</button>
			) : null}
		</div>
	);
}
