import type { ControlType } from '@simmer-mosquito/domain';
import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import {
	DensityBadge,
	hasAnyLifeStage,
	LifeStageStrip,
	larvaePerDip,
	WetnessBadge,
} from '../../../components/larval-display';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	createItems,
	DetailPageShell,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { useInspectionMutations } from '../../../hooks/mutations/use-inspection-mutations';
import {
	type InspectionCard,
	inspectionTypeLabel,
} from '../../../hooks/queries/larval-activity-view';
import { useInspection } from '../../../hooks/queries/use-inspection';
import {
	type InspectionSample,
	type InspectionSampleSpecies,
	useInspectionSamples,
} from '../../../hooks/queries/use-inspection-samples';
import {
	type LinkedControlAction,
	useLinkedControlActions,
} from '../../../hooks/queries/use-linked-control-actions';
import type { AskAcknowledged } from '../../../hooks/use-acknowledged-write';
import { useOrganizationClock } from '../../../hooks/use-organization-clock';
import { INSPECTION_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { INSPECTION_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { adhocLabel, habitatLabel } from '../../../lib/coordinate-label';
import { formatAmount } from '../../../lib/format-count';
import { formatFullDate, formatMonthDayYear } from '../../../lib/record-dates';
import { recordNoun } from '../../../lib/record-nouns';
import { sampleName } from '../../../lib/sample-name';

export const Route = createFileRoute('/larval-surveillance/inspections/$id')({
	component: RouteComponent,
});

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: {
		main: [['h-[420px]', 'h-[420px]'], 'h-48'],
		aside: ['h-96'],
	},
};

function RouteComponent() {
	const { id } = Route.useParams();
	const { inspection, isReady, isError } = useInspection(id);

	return (
		<RecordDetailPage
			deleteRefusals={INSPECTION_DELETE_REFUSALS}
			layout={layout}
			recordType="inspection"
			reading={{ isError, isReady, record: inspection }}
		>
			{(record, askDelete) => <InspectionDetailContent askDelete={askDelete} inspection={record} />}
		</RecordDetailPage>
	);
}

const InspectionIcon = iconRegistry.entities.inspection.icon;
const SampleIcon = iconRegistry.entities.sample.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;
const HabitatIcon = iconRegistry.entities.habitat.icon;
const ControlIcon = iconRegistry.domains.controlOperations.icon;

function InspectionDetailContent({
	inspection,
	askDelete,
}: {
	readonly inspection: InspectionCard;
	readonly askDelete: AskAcknowledged;
}) {
	// Surface the inspection date in the breadcrumb trail in place of its uuid.
	useBreadcrumbLabel(inspection.id, breadcrumbLabel(inspection));
	const mutations = useInspectionMutations();

	return (
		<DetailPageShell
			aside={<CommentsSection target={{ type: 'inspection', id: inspection.id }} />}
			facts={<ContextCard inspection={inspection} />}
			header={{
				/*
				 * Filed against the inspection's habitat, which is what a control action
				 * can hold: the three forms have a habitat picker and no inspection one.
				 * An ad-hoc inspection names no habitat, so `createItems` hides them.
				 */
				actions: createItems('habitatId', inspection.habitatId, [
					'/control-operations/chemical/create',
					'/control-operations/source-reduction/create',
					'/control-operations/biocontrol/create',
				]),
				edit: {
					params: { id: inspection.id },
					to: '/larval-surveillance/inspections/$id/edit',
				},
				/*
				 * The verdict only. Wet or dry, and larvae or none, are two derived
				 * flags that say what kind of record this is, which is what a header
				 * is for. What was measured, meaning the density band, the stages, the
				 * larvae and the dips, reads in the Details card, where a reader
				 * looking for a number goes to look for it.
				 */
				flags: <FindingsFlags inspection={inspection} />,
				icon: InspectionIcon,
				recordType: 'inspection',
				remove: {
					ask: askDelete,
					name: breadcrumbLabel(inspection),
					onDelete: (acknowledgements) => mutations.remove(inspection.id, acknowledgements),
					recordId: inspection.id,
					returnTo: '/larval-surveillance/inspections',
				},
				subtitle: <InspectionSubtitle inspection={inspection} />,
				title: formatFullDate(inspection.inspectionDate),
			}}
			layout={layout}
			lead={
				<div className="grid content-start gap-3">
					<InspectionLocationCard inspection={inspection} />
					<RecordRegionsBand recordId={inspection.id} recordType="inspections" />
				</div>
			}
		>
			<InspectionSamplesCard inspectionId={inspection.id} isWet={inspection.isWet} />
			<LinkedControlActionsCard inspectionId={inspection.id} />
		</DetailPageShell>
	);
}

function InspectionSubtitle({ inspection }: { readonly inspection: InspectionCard }) {
	const addressName = addressDisplayName(inspection);
	if (inspection.habitatId === null) {
		return (
			<p className="m-0 text-small text-muted-foreground">
				{/*
				 * `adhocLabel` rather than `habitatLabel` with the address: this
				 * subtitle draws the address itself after the separator, and a
				 * ladder here would put the same words in both halves of one line
				 * (#1231).
				 */}
				<span className="tabular-nums">
					{adhocLabel(inspection.latitude, inspection.longitude, 'One-off inspection')}
				</span>
				{addressName === null ? null : ` · ${addressName}`}
			</p>
		);
	}

	return (
		<p className="m-0 inline-flex flex-wrap items-center gap-1.5 text-small text-muted-foreground">
			<span>at</span>
			<Link
				className={recordLink()}
				params={{ id: inspection.habitatId }}
				to="/larval-surveillance/habitats/$id"
			>
				{habitatTitle(inspection)}
			</Link>
			<span aria-hidden="true">·</span>
			{/* The subtitle says an unassigned type in words, where a lone dash after
			    the habitat's name would read as a glyph nobody placed. */}
			<span>{inspectionTypeLabel(inspection) ?? 'Unassigned type'}</span>
		</p>
	);
}

/** A single "larvae found / none found" pill, meaningful only for wet inspections. */
function PositivityBadge({ inspection }: { readonly inspection: InspectionCard }) {
	if (!inspection.isWet) {
		return null;
	}
	return hasAnyLifeStage(inspection) ? (
		<Badge tone="warning" variant="outline">
			Larvae found
		</Badge>
	) : (
		<Badge tone="success" variant="outline">
			No larvae found
		</Badge>
	);
}

function InspectionLocationCard({ inspection }: { readonly inspection: InspectionCard }) {
	const geometry = useOwnedGeometry(
		INSPECTION_GEOMETRY_SOURCE,
		inspection.id,
		inspection.updatedAt.toISOString(),
	);
	return (
		<RecordLocationCard
			emptyDescription="This inspection has no location to display."
			geojson={geometry.geojson}
			geomType={geometry.geomType ?? inspection.geometryKind}
			isError={geometry.isError}
			isPending={geometry.isPending}
			unsupportedShape={geometry.unsupportedShape}
		/>
	);
}

/**
 * Whether the inspection found anything, as one or two badges.
 *
 * Both are derived rather than measured. Wet or dry decides whether the rest of
 * the record means anything, and larvae or none is read off the six life-stage
 * flags, so neither is a number a reader would go looking for. They name the
 * kind of record, which is the header's job.
 *
 * The measurements used to sit here beside them: the density band, the stage
 * strip, the larvae count and the dipping. A header bar is where a record says
 * what it is, and an operator reading for a number was reading the wrong part
 * of the page, so those moved into the Details card as ordinary rows. See
 * {@link FindingsList}.
 */
function FindingsFlags({ inspection }: { readonly inspection: InspectionCard }) {
	// A dry inspection is one badge and nothing else. There was no dipping to
	// have done, so there is no positivity to report either.
	if (!inspection.isWet) {
		return (
			<div className={findingsRow}>
				<WetnessBadge isWet={false} />
			</div>
		);
	}

	return (
		<div className={findingsRow}>
			<PositivityBadge inspection={inspection} />
		</div>
	);
}

const findingsRow = 'mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-2';

/**
 * What the inspection measured, as label-and-value rows.
 *
 * Density first, then the evidence for it, which is the order the explorer list
 * already reads in: a row there is a density badge followed by its life-stage
 * strip. Same two objects, same sequence, so the row an operator clicked and
 * the record they land on read alike.
 *
 * The rate closes the loop back to the band. An organization configures its
 * density bands as ranges of larvae per dip, so printing the rate is what makes
 * "Heavy" checkable instead of asserted.
 *
 * A dry inspection renders nothing. Its Dry badge is in the header, and there
 * is no density to band, no stages to strip and no dipping to divide by.
 */
function FindingsList({ inspection }: { readonly inspection: InspectionCard }) {
	if (!inspection.isWet) {
		return null;
	}

	const rate = larvaePerDip(inspection.larvaeCount, inspection.dipCount);

	return (
		<DetailList>
			<DetailRow label="Density">
				<DensityBadge density={inspection.density} />
			</DetailRow>
			<DetailRow label="Life stages">
				<LifeStageStrip size="sm" stages={inspection} />
			</DetailRow>
			{/*
			 * Zero is a finding, not a blank: twelve dips that turned up nothing is
			 * the negative result surveillance is largely made of, so a recorded zero
			 * has to read as deliberate rather than as a field nobody filled in. That
			 * is what passing the count through rather than testing it for truth
			 * does, and why `DetailRow` is handed `null` and left to say the row was
			 * not recorded.
			 */}
			<DetailRow label="Larvae">
				{inspection.larvaeCount === null ? null : (
					<span className="tabular-nums">{inspection.larvaeCount.toLocaleString('en-US')}</span>
				)}
			</DetailRow>
			<DetailRow label="Dips">
				{inspection.dipCount === null ? null : (
					<span className="flex flex-wrap items-baseline gap-x-2">
						<span className="tabular-nums">{inspection.dipCount.toLocaleString('en-US')}</span>
						{rate === null ? null : (
							<span className="text-muted-foreground tabular-nums">
								· {formatRate(rate)} per dip
							</span>
						)}
					</span>
				)}
			</DetailRow>
		</DetailList>
	);
}

/** One decimal at most: `2.8`, `3`, `0.5`. */
function formatRate(rate: number): string {
	return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(rate);
}

/**
 * The Details card: what was found, then where and by whom.
 *
 * The two groups are separated by a rule rather than by a second card, because
 * a reader wanting the larvae count and a reader wanting the inspector are the
 * same reader scanning one column of labels. A dry inspection has no findings
 * group, so it takes no rule either.
 */
function ContextCard({ inspection }: { readonly inspection: InspectionCard }) {
	const clock = useOrganizationClock();
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<FindingsList inspection={inspection} />
				<DetailList className={cn(inspection.isWet && 'border-border/50 border-t pt-4')}>
					{/*
					 * An ad-hoc inspection names no habitat, and this row says so rather
					 * than printing the coordinates: it is the Habitat row, and filling it
					 * with a place reads as a habitat whose name is a pair of numbers. The
					 * coordinates are already in the subtitle and on the Location card
					 * beside it.
					 */}
					<DetailRow label="Habitat">
						{inspection.habitatId === null ? null : (
							<Link
								className={cn(recordLink(), 'inline-flex items-center gap-1.5')}
								params={{ id: inspection.habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								<HabitatIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
								{habitatTitle(inspection)}
							</Link>
						)}
					</DetailRow>
					{/* No type draws the absent mark, the way the Address row beside it
					    does; the subtitle is where an unassigned type is spelled out. */}
					<DetailRow label="Habitat type">{inspectionTypeLabel(inspection)}</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={inspection.addressId} />
					</DetailRow>
					{/* A recorded inspector whose Profile the client does not hold reads
					    as unknown rather than as the absent mark nobody-recorded draws. */}
					<DetailRow label="Inspector">
						{inspection.inspectedByProfileId === null
							? null
							: (inspection.inspectedByName ?? 'Unknown')}
					</DetailRow>
					<DetailRow label="Inspected">{formatFullDate(inspection.inspectionDate)}</DetailRow>
					<DetailRow label="Recorded">
						{clock.formatInstant(inspection.createdAt, 'dateTime')}
					</DetailRow>
					<DetailRow label="Updated">
						{clock.formatInstant(inspection.updatedAt, 'dateTime')}
					</DetailRow>
				</DetailList>
				<AdditionalPersonnelList target={{ type: 'inspection', id: inspection.id }} />
			</CardContent>
		</Card>
	);
}

function InspectionSamplesCard({
	inspectionId,
	isWet,
}: {
	readonly inspectionId: string;
	readonly isWet: boolean;
}) {
	const { samples, isReady, isError } = useInspectionSamples(inspectionId);

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<SampleIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							{recordNoun('sample').titleMany}
						</CardTitle>
					</div>
					{isReady && samples.length > 0 ? (
						<Badge tone="neutral" variant="outline">
							{samples.length}
						</Badge>
					) : null}
				</div>
			</CardHeader>
			<CardContent padding="compact">
				<PanelRows
					empty={{
						description: isWet
							? 'No specimens were collected during this inspection.'
							: 'Dry inspections collect no samples.',
						title: 'No Samples Recorded',
					}}
					icon={<SampleIcon aria-hidden="true" />}
					reading={{ isError, isReady, rows: samples }}
					unavailable={{
						description: 'Sample records could not be loaded. Try again shortly.',
						title: 'Samples Unavailable',
					}}
				>
					{(rows) => rows.map((sample) => <SampleItem key={sample.id} sample={sample} />)}
				</PanelRows>
			</CardContent>
		</Card>
	);
}

function SampleItem({ sample }: { readonly sample: InspectionSample }) {
	const result = sampleResult(sample);
	return (
		<li className="grid gap-2 rounded-md border border-border/40 bg-background/60 px-3 py-2.5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Link
					className={recordLink({ size: 'sm' })}
					params={{ id: sample.id }}
					to="/larval-surveillance/samples/$id"
				>
					{sampleName(sample)}
				</Link>
				<Badge tone={result.tone} variant="outline">
					{result.label}
				</Badge>
			</div>
			{sample.species.length === 0 ? (
				<span className="text-muted-foreground text-xs">No species identified</span>
			) : (
				<div className="flex flex-wrap gap-1.5">
					{sample.species.map((entry) => (
						<SpeciesChip entry={entry} key={entry.id} />
					))}
				</div>
			)}
			{sample.unidentifiableReason !== null && sample.unidentifiableReason.trim().length > 0 ? (
				<p className="m-0 text-muted-foreground text-xs">{sample.unidentifiableReason}</p>
			) : null}
		</li>
	);
}

function SpeciesChip({ entry }: { readonly entry: InspectionSampleSpecies }) {
	return (
		<Badge tone="neutral" variant="outline">
			<SpeciesIcon aria-hidden="true" className="size-3 text-muted-foreground" />
			{entry.speciesName ?? 'Unknown species'}
			<span className="tabular-nums">{entry.larvaeCount}</span>
		</Badge>
	);
}

// --- linked control actions -------------------------------------------------

type ActionTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const actionKindMeta: Record<
	LinkedControlAction['kind'],
	{ readonly label: string; readonly tone: ActionTone }
> = {
	application: { label: 'Application', tone: 'info' },
	sourceReduction: { label: 'Source reduction', tone: 'success' },
	outreachAction: { label: 'Outreach', tone: 'neutral' },
	biocontrolAction: { label: 'Biocontrol', tone: 'info' },
	requestedControlAction: { label: 'Control request', tone: 'warning' },
};

function LinkedControlActionsCard({ inspectionId }: { readonly inspectionId: string }) {
	const { actions, isReady, isError } = useLinkedControlActions(inspectionId);

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<ControlIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							Control Actions
						</CardTitle>
					</div>
					{isReady && actions.length > 0 ? (
						<Badge tone="neutral" variant="outline">
							{actions.length}
						</Badge>
					) : null}
				</div>
			</CardHeader>
			<CardContent padding="compact">
				<PanelRows
					empty={{
						description:
							'No applications, source reductions, or other control actions reference this inspection yet.',
						title: 'No Control Actions',
					}}
					icon={<ControlIcon aria-hidden="true" />}
					reading={{ isError, isReady, rows: actions }}
					unavailable={{
						description: 'Linked control actions could not be loaded. Try again shortly.',
						title: 'Control Actions Unavailable',
					}}
				>
					{(rows) =>
						rows.map((action) => (
							<LinkedActionRow action={action} key={`${action.kind}-${action.id}`} />
						))
					}
				</PanelRows>
			</CardContent>
		</Card>
	);
}

function LinkedActionRow({ action }: { readonly action: LinkedControlAction }) {
	const meta = actionKindMeta[action.kind];
	return (
		<li className="grid gap-1.5 rounded-md border border-border/40 bg-background/60 px-3 py-2.5">
			<div className="flex flex-wrap items-center gap-2">
				<Badge tone={meta.tone} variant="outline">
					{meta.label}
				</Badge>
				<span className="text-muted-foreground text-xs tabular-nums">
					{formatMonthDayYear(action.date)}
				</span>
			</div>
			<p className="m-0 text-foreground text-sm">
				<LinkedActionSummary action={action} />
			</p>
			<p className="m-0 text-muted-foreground text-xs">
				<LinkedActionActor action={action} />
			</p>
		</li>
	);
}

function LinkedActionSummary({ action }: { readonly action: LinkedControlAction }) {
	switch (action.kind) {
		case 'application':
			return (
				<>
					Treated with {action.insecticideName ?? 'Unknown insecticide'} ·{' '}
					<UnitAmount amount={action.amount} abbreviation={action.unitAbbreviation} />
				</>
			);
		case 'sourceReduction':
			return (
				<>
					{action.methodName ?? unknownMethod} ·{' '}
					<UnitAmount amount={action.amount} abbreviation={action.unitAbbreviation} /> eliminated
				</>
			);
		case 'outreachAction':
			return (
				<>
					{action.methodName ?? unknownMethod} · {action.reach.toLocaleString('en-US')} reached
				</>
			);
		case 'biocontrolAction':
			return (
				<>
					{action.methodName ?? unknownMethod} ·{' '}
					<UnitAmount amount={action.amount} abbreviation={action.unitAbbreviation} /> released
				</>
			);
		default:
			return <RequestedActionSummary action={action} />;
	}
}

function RequestedActionSummary({
	action,
}: {
	readonly action: Extract<LinkedControlAction, { readonly kind: 'requestedControlAction' }>;
}) {
	return (
		<>
			{controlTypeLabel(action.controlType)} requested
			{action.summary === null || action.summary.trim().length === 0 ? '' : ` · ${action.summary}`}
			{' · '}
			<span
				className={
					action.resolvedAt === null ? 'font-medium text-foreground' : 'text-muted-foreground'
				}
			>
				{action.resolvedAt === null ? 'Open' : 'Resolved'}
			</span>
		</>
	);
}

const unknownMethod = 'Unknown method';

function LinkedActionActor({ action }: { readonly action: LinkedControlAction }) {
	const label =
		action.kind === 'requestedControlAction'
			? 'Requested by'
			: action.kind === 'application'
				? 'Applicator'
				: 'Technician';
	if (action.actorProfileId === null) {
		return (
			<>
				{label}: <span className="text-muted-foreground">Unassigned</span>
			</>
		);
	}
	return (
		<>
			{label}: {action.actorName ?? 'Unknown'}
		</>
	);
}

/** An amount and the unit's abbreviation, or the bare amount when the unit is not in the client. */
function UnitAmount({
	amount,
	abbreviation,
}: {
	readonly amount: number;
	readonly abbreviation: string | null;
}) {
	return (
		<span className="tabular-nums">
			{formatAmount(amount)}
			{abbreviation === null || abbreviation === '' ? null : ` ${abbreviation}`}
		</span>
	);
}

/** The habitat as the subtitle and the Habitat row name it, with the linked address as its fallback. */
function habitatTitle(inspection: InspectionCard): string {
	return habitatLabel(
		{
			habitatId: inspection.habitatId,
			habitatName: inspection.habitatName,
			lat: inspection.latitude,
			lng: inspection.longitude,
		},
		{ addressName: addressDisplayName(inspection), fallback: 'One-off inspection' },
	);
}

/** The joined address's display name, which an unmatched `left` join leaves `undefined`. */
function addressDisplayName(inspection: InspectionCard): string | null {
	return inspection.address.displayName ?? null;
}

// --- helpers ----------------------------------------------------------------

const sampleResultTones = {
	zero: { label: 'Zero larvae', tone: 'neutral' },
	unidentifiable: { label: 'Unidentifiable', tone: 'warning' },
	nonMosquito: { label: 'Non-mosquito', tone: 'info' },
	larvae: { label: 'Larvae present', tone: 'warning' },
} as const satisfies Record<
	string,
	{ readonly label: string; readonly tone: 'neutral' | 'info' | 'warning' | 'danger' }
>;

function sampleResult(
	sample: InspectionSample,
): (typeof sampleResultTones)[keyof typeof sampleResultTones] {
	if (sample.isZeroLarvae) {
		return sampleResultTones.zero;
	}
	if (sample.unidentifiableReason !== null && sample.unidentifiableReason.trim().length > 0) {
		return sampleResultTones.unidentifiable;
	}
	if (sample.hasNonMosquito) {
		return sampleResultTones.nonMosquito;
	}
	return sampleResultTones.larvae;
}

function breadcrumbLabel(inspection: InspectionCard): string {
	return `Inspection · ${formatMonthDayYear(inspection.inspectionDate)}`;
}

function controlTypeLabel(controlType: ControlType): string {
	switch (controlType) {
		case 'application':
			return 'Application';
		case 'source_reduction':
			return 'Source reduction';
		case 'biocontrol':
			return 'Biocontrol';
		default:
			return 'Outreach';
	}
}
