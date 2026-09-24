import type { LarvalInspectionEntryMode } from '@simmer-mosquito/domain';
import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { TableCell, TableHead, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { Suspense } from 'react';
import { useLarvalEntryMode } from '../../../hooks/larval-surveillance/use-larval-entry-mode';
import { useSpeciesName } from '../../../hooks/larval-surveillance/use-species-name';
import { controlTypeLabel, requestStatus } from '../../../hooks/queries/operations-view';
import type {
	HabitatHistoryApplication,
	HabitatHistoryInspection,
	HabitatHistoryRequest,
	HabitatHistorySample,
	HabitatHistorySampleRow,
	HabitatHistorySourceReduction,
	HabitatHistorySpecies,
} from '../../../hooks/queries/use-habitat-history';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { formatCount } from '../../../lib/format-count';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { sampleName } from '../../../lib/sample-name';
import { DensityBadge, LifeStageStrip } from '../../larval-display';
import { RequestStatusBadge } from '../../request-status-badge';
import { HISTORY_UNAVAILABLE, HistoryTab } from './habitat-history-tab';
import {
	AmountWithUnit,
	ApplicationMethodName,
	formatDateTime,
	InsecticideName,
	ProfileName,
	SourceReductionMethodName,
} from './habitat-history-values';

const historyLinkClassName = recordLink({ tone: 'inherit', underline: 'hover' });
const InspectionIcon = iconRegistry.entities.inspection.icon;
const SampleIcon = iconRegistry.entities.sample.icon;
const ApplicationIcon = iconRegistry.entities.application.icon;
const SourceReductionIcon = iconRegistry.entities.sourceReduction.icon;
const RequestIcon = iconRegistry.entities.requestedControlAction.icon;

export function InspectionHistory({
	inspections,
	habitatId,
}: {
	readonly inspections: readonly HabitatHistoryInspection[];
	readonly habitatId: string;
}) {
	// The organization's larval data mode decides which abundance columns are
	// meaningful.
	const columns = inspectionColumnsForMode(useLarvalEntryMode());

	return (
		<HistoryTab
			empty={{
				description: 'Larval inspections recorded for this habitat will show here.',
				title: 'No Inspections Yet',
			}}
			habitatId={habitatId}
			head={
				<>
					<TableHead>Date</TableHead>
					<TableHead>Inspector</TableHead>
					<TableHead>Wet</TableHead>
					{columns.dips ? <TableHead className="text-right">Dips</TableHead> : null}
					{columns.density ? <TableHead>Density</TableHead> : null}
					{columns.larvae ? <TableHead className="text-right">Larvae</TableHead> : null}
					<TableHead>Stages</TableHead>
				</>
			}
			icon={<InspectionIcon aria-hidden="true" />}
			noun={recordNoun('inspection')}
			rows={inspections}
			unavailable={HISTORY_UNAVAILABLE}
		>
			{(inspection) => (
				<TableRow key={inspection.id}>
					<TableCell className="whitespace-nowrap">
						<Link
							className={historyLinkClassName}
							params={{ id: inspection.id }}
							to="/larval-surveillance/inspections/$id"
						>
							{formatListDate(inspection.inspectionDate)}
						</Link>
					</TableCell>
					<TableCell className="whitespace-nowrap">
						{inspection.inspectedByProfileId === null ? (
							<AbsentValue />
						) : (
							<Suspense fallback={<span className="text-muted-foreground">…</span>}>
								<ProfileName profileId={inspection.inspectedByProfileId} />
							</Suspense>
						)}
					</TableCell>
					<TableCell>{inspection.isWet ? 'Yes' : 'No'}</TableCell>
					{columns.dips ? (
						<TableCell className="text-right tabular-nums">
							{inspection.dipCount ?? <AbsentValue />}
						</TableCell>
					) : null}
					{columns.density ? (
						<TableCell>
							<DensityBadge density={inspection.density} />
						</TableCell>
					) : null}
					{columns.larvae ? (
						<TableCell className="text-right tabular-nums">
							{inspection.larvaeCount ?? <AbsentValue />}
						</TableCell>
					) : null}
					<TableCell>
						<LifeStageStrip stages={inspection} />
					</TableCell>
				</TableRow>
			)}
		</HistoryTab>
	);
}

export function SampleHistory({
	samples,
	habitatId,
}: {
	readonly samples: readonly HabitatHistorySampleRow[];
	readonly habitatId: string;
}) {
	const sortedSamples = [...samples].sort((a, b) =>
		b.inspectionDate.localeCompare(a.inspectionDate),
	);

	return (
		<HistoryTab
			empty={{
				description: 'Samples appear once an inspection on this habitat records them.',
				title: 'No Samples Yet',
			}}
			habitatId={habitatId}
			head={
				<>
					<TableHead>Sample</TableHead>
					<TableHead>Inspection Date</TableHead>
					<TableHead>Result</TableHead>
					<TableHead>Species</TableHead>
				</>
			}
			icon={<SampleIcon aria-hidden="true" />}
			noun={recordNoun('sample')}
			rows={sortedSamples}
			unavailable={HISTORY_UNAVAILABLE}
		>
			{(sample) => (
				<TableRow key={sample.id}>
					<TableCell className="whitespace-nowrap">
						<Link
							className={historyLinkClassName}
							params={{ id: sample.id }}
							to="/larval-surveillance/samples/$id"
						>
							{sampleName(sample)}
						</Link>
					</TableCell>
					<TableCell className="whitespace-nowrap">
						{formatListDate(sample.inspectionDate)}
					</TableCell>
					<TableCell>{formatSampleResult(sample)}</TableCell>
					<TableCell>
						<SampleSpeciesSummary species={sample.species} />
					</TableCell>
				</TableRow>
			)}
		</HistoryTab>
	);
}

export function ApplicationHistory({
	applications,
	habitatId,
	isError,
}: {
	readonly applications: readonly HabitatHistoryApplication[];
	readonly habitatId: string;
	readonly isError: boolean;
}) {
	return (
		<HistoryTab
			empty={{
				description: 'Control applications recorded on this habitat will show here.',
				title: 'No Applications Yet',
			}}
			habitatId={habitatId}
			head={
				<>
					<TableHead>Date</TableHead>
					<TableHead>Applicator</TableHead>
					<TableHead>Insecticide</TableHead>
					<TableHead>Method</TableHead>
					<TableHead className="text-right">Amount</TableHead>
				</>
			}
			icon={<ApplicationIcon aria-hidden="true" />}
			isError={isError}
			noun={recordNoun('application')}
			rows={applications}
			unavailable={{
				description: 'Application history could not be loaded.',
				title: 'Applications Unavailable',
			}}
		>
			{(application) => (
				<TableRow key={application.id}>
					<TableCell className="whitespace-nowrap">
						<Link
							className={historyLinkClassName}
							params={{ id: application.id }}
							to="/control-operations/chemical/$id"
						>
							{formatListDate(application.applicationDate)}
						</Link>
					</TableCell>
					<TableCell className="whitespace-nowrap">
						{application.applicatorProfileId === null ? (
							<AbsentValue />
						) : (
							<Suspense fallback={<span className="text-muted-foreground">…</span>}>
								<ProfileName profileId={application.applicatorProfileId} />
							</Suspense>
						)}
					</TableCell>
					<TableCell>
						<Suspense fallback={<span className="text-muted-foreground">…</span>}>
							<InsecticideName insecticideId={application.insecticideId} />
						</Suspense>
					</TableCell>
					<TableCell>
						<Suspense fallback={<span className="text-muted-foreground">…</span>}>
							<ApplicationMethodName applicationMethodId={application.applicationMethodId} />
						</Suspense>
					</TableCell>
					<TableCell className="text-right tabular-nums">
						<Suspense fallback={<span className="text-muted-foreground">…</span>}>
							<AmountWithUnit
								amount={application.amountApplied}
								unitId={application.applicationUnitId}
							/>
						</Suspense>
					</TableCell>
				</TableRow>
			)}
		</HistoryTab>
	);
}

/**
 * Source reductions carried out at this habitat, every one, because the table
 * has no lifecycle column.
 */
export function SourceReductionHistory({
	sourceReductions,
	habitatId,
	isError,
}: {
	readonly sourceReductions: readonly HabitatHistorySourceReduction[];
	readonly habitatId: string;
	readonly isError: boolean;
}) {
	return (
		<HistoryTab
			empty={{
				description: 'Source reductions recorded at this habitat will show here.',
				title: 'No Source Reductions Yet',
			}}
			habitatId={habitatId}
			head={
				<>
					<TableHead>Date</TableHead>
					<TableHead>Technician</TableHead>
					<TableHead>Method</TableHead>
					<TableHead className="text-right">Eliminated</TableHead>
				</>
			}
			icon={<SourceReductionIcon aria-hidden="true" />}
			isError={isError}
			noun={recordNoun('sourceReduction')}
			rows={sourceReductions}
			unavailable={{
				description: 'Source reduction history could not be loaded.',
				title: 'Source Reductions Unavailable',
			}}
		>
			{(reduction) => (
				<TableRow key={reduction.id}>
					<TableCell className="whitespace-nowrap">
						<Link
							className={historyLinkClassName}
							params={{ id: reduction.id }}
							to="/control-operations/source-reduction/$id"
						>
							{formatListDate(reduction.sourceReductionDate)}
						</Link>
					</TableCell>
					<TableCell className="whitespace-nowrap">
						{reduction.technicianProfileId === null ? (
							<AbsentValue />
						) : (
							<Suspense fallback={<span className="text-muted-foreground">…</span>}>
								<ProfileName profileId={reduction.technicianProfileId} />
							</Suspense>
						)}
					</TableCell>
					<TableCell>
						<Suspense fallback={<span className="text-muted-foreground">…</span>}>
							<SourceReductionMethodName
								sourceReductionMethodId={reduction.sourceReductionMethodId}
							/>
						</Suspense>
					</TableCell>
					<TableCell className="text-right tabular-nums">
						<Suspense fallback={<span className="text-muted-foreground">…</span>}>
							<AmountWithUnit
								amount={reduction.sourcesEliminatedAmount}
								unitId={reduction.sourcesEliminatedUnitId}
							/>
						</Suspense>
					</TableCell>
				</TableRow>
			)}
		</HistoryTab>
	);
}

/**
 * Requests for control raised against this habitat, open and resolved alike.
 * The status column separates the two.
 */
export function RequestHistory({
	requests,
	habitatId,
	isError,
}: {
	readonly requests: readonly HabitatHistoryRequest[];
	readonly habitatId: string;
	readonly isError: boolean;
}) {
	const timeZone = useOrganizationTimeZone();

	return (
		<HistoryTab
			empty={{
				description: 'Requests for control raised against this habitat will show here.',
				title: 'No Requests Yet',
			}}
			habitatId={habitatId}
			head={
				<>
					<TableHead>Raised</TableHead>
					<TableHead>Requested by</TableHead>
					<TableHead>Type</TableHead>
					<TableHead>Summary</TableHead>
					<TableHead>Status</TableHead>
				</>
			}
			icon={<RequestIcon aria-hidden="true" />}
			isError={isError}
			noun={recordNoun('requestedControlAction')}
			rows={requests}
			unavailable={{
				description: 'Request history could not be loaded.',
				title: 'Requests Unavailable',
			}}
		>
			{(request) => (
				<TableRow key={request.id}>
					<TableCell className="whitespace-nowrap">
						<Link
							className={historyLinkClassName}
							params={{ id: request.id }}
							to="/operations/requests-for-control/$id"
						>
							{formatDateTime(request.requestedAt, timeZone)}
						</Link>
					</TableCell>
					<TableCell className="whitespace-nowrap">
						{request.requestedByProfileId === null ? (
							<AbsentValue />
						) : (
							<Suspense fallback={<span className="text-muted-foreground">…</span>}>
								<ProfileName profileId={request.requestedByProfileId} />
							</Suspense>
						)}
					</TableCell>
					<TableCell className="whitespace-nowrap">
						{controlTypeLabel(request.controlType)}
					</TableCell>
					<TableCell>{requestSummary(request) ?? <AbsentValue />}</TableCell>
					<TableCell>
						<RequestStatusBadge status={requestStatus(request)} />
					</TableCell>
				</TableRow>
			)}
		</HistoryTab>
	);
}

function SampleSpeciesSummary({ species }: { readonly species: readonly HabitatHistorySpecies[] }) {
	if (species.length === 0) {
		return <span className="text-muted-foreground">No species identified</span>;
	}

	return (
		<Suspense fallback={<span className="text-muted-foreground">…</span>}>
			<div className="flex flex-wrap gap-1.5">
				{species.map((row) => (
					<SampleSpeciesChip key={row.id} row={row} />
				))}
			</div>
		</Suspense>
	);
}

function SampleSpeciesChip({ row }: { readonly row: HabitatHistorySpecies }) {
	const speciesName = useSpeciesName(row.speciesId);
	return (
		<Badge variant="outline" tone="neutral">
			{speciesName}
			<span className="tabular-nums">{formatCount(row.larvaeCount)}</span>
		</Badge>
	);
}

interface InspectionColumns {
	readonly dips: boolean;
	readonly density: boolean;
	readonly larvae: boolean;
}

function inspectionColumnsForMode(mode: LarvalInspectionEntryMode): InspectionColumns {
	switch (mode) {
		case 'density_only':
			return { dips: true, density: true, larvae: false };
		case 'count_and_dips_required':
			return { dips: true, density: false, larvae: true };
		default:
			return { dips: true, density: true, larvae: true };
	}
}

/**
 * A request's summary, or nothing. `requestDisplayName` falls back to
 * "Application requested", which the Type column already says here.
 */
function requestSummary(request: HabitatHistoryRequest): string | null {
	return request.summary?.trim() || null;
}

function formatSampleResult(sample: HabitatHistorySample): string {
	if (sample.isZeroLarvae) {
		return 'Zero larvae';
	}
	if (sample.unidentifiableReason !== null && sample.unidentifiableReason.trim().length > 0) {
		return 'Unidentifiable';
	}
	if (sample.hasNonMosquito) {
		return 'Non-mosquito present';
	}
	return 'Larvae present';
}
