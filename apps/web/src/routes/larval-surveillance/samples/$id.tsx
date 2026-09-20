import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { Sample } from '@simmer-mosquito/sync';
import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { CalendarIcon, iconRegistry, KeyboardIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { SampleKeyEntryDialog } from '../../../components/larval-surveillance/sample-key-entry';
import { DispositionSection } from '../../../components/larval-surveillance/samples/disposition-section';
import {
	AddSpeciesRow,
	type SampleSpeciesEntry,
	SpeciesResultList,
} from '../../../components/larval-surveillance/samples/species-result-list';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import {
	DetailPageShell,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { useSpeciesOptions as useAdoptedSpeciesOptions } from '../../../hooks/explorer/use-species-options';
import {
	type SampleGeoRow,
	type SampleStatus,
	useSampleGeoContext,
} from '../../../hooks/larval-surveillance/use-sample-geo-context';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useSampleMutations } from '../../../hooks/mutations/use-sample-mutations';
import { useSampleSpeciesMutations } from '../../../hooks/mutations/use-sample-species-mutations';
import { activityGcTimeMs } from '../../../hooks/queries/shared';
import type { AskAcknowledged } from '../../../hooks/use-acknowledged-write';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { SAMPLE_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { sample_species } from '../../../lib/collections/sample_species';
import { samples } from '../../../lib/collections/samples';
import { habitatLabel } from '../../../lib/coordinate-label';
import { todayInTimeZone } from '../../../lib/local-date';
import { formatDateTime, formatFullDate, formatMonthDayYear } from '../../../lib/record-dates';
import { sampleName } from '../../../lib/sample-name';
import { errorMessageForSave } from '../../../lib/save-error';

export const Route = createFileRoute('/larval-surveillance/samples/$id')({
	component: RouteComponent,
});

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: {
		main: [['h-[320px]', 'h-64'], 'h-64'],
		aside: ['h-96'],
	},
};

/**
 * What this page calls the habitat a sample was taken at.
 *
 * The fallback is the sample's own category, not the inspection's: this page
 * reached `adhocLabel` on its default and a sample carrying no centroid read
 * `Ad-hoc inspection`.
 */
const SAMPLE_LABEL = { fallback: 'Ad-hoc sample' } as const;

function RouteComponent() {
	const { id } = Route.useParams();
	const query = useSampleGeoContext(id);

	return (
		<RecordDetailPage
			deleteRefusals={SAMPLE_DELETE_REFUSALS}
			layout={layout}
			recordType="sample"
			reading={{ isError: query.isError, isReady: !query.isPending, record: query.data }}
		>
			{(record, askDelete) => <SampleDetailContent askDelete={askDelete} geo={record} />}
		</RecordDetailPage>
	);
}

const SampleIcon = iconRegistry.entities.sample.icon;
// Identification is about the mosquitoes in the sample, not the taxonomy tree the
// names come from — the same mark heads the card on adult collections.
const SpeciesIcon = iconRegistry.simmer.mosquito.icon;
const InspectionIcon = iconRegistry.entities.inspection.icon;
const HabitatIcon = iconRegistry.entities.habitat.icon;
// Roles that may read but not manage sample results — they get a read-only view.
const readOnlyRoles = new Set(['viewer']);

interface StatusMeta {
	readonly label: string;
	readonly tone: 'success' | 'info' | 'neutral' | 'warning';
	readonly description: string;
}

const STATUS_META: Record<SampleStatus, StatusMeta> = {
	identified: {
		label: 'Identified',
		tone: 'success',
		description: 'One or more species have been identified in this sample.',
	},
	awaiting: {
		label: 'Awaiting ID',
		tone: 'info',
		description: 'This sample is collected but not yet identified.',
	},
	zero_larvae: {
		label: 'No larvae',
		tone: 'neutral',
		description: 'The sample was examined and held no mosquito larvae.',
	},
	unidentifiable: {
		label: 'Unidentifiable',
		tone: 'warning',
		description: 'The specimens could not be identified to species.',
	},
};

function SampleDetailContent({
	geo,
	askDelete,
}: {
	readonly geo: SampleGeoRow;
	readonly askDelete: AskAcknowledged;
}) {
	useBreadcrumbLabel(geo.id, breadcrumbLabel(geo));

	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const canManage =
		identity?.profileId != null &&
		identity.organizationId != null &&
		!(identity.role !== null && readOnlyRoles.has(identity.role));
	const sampleMutations = useSampleMutations();

	return (
		<DetailPageShell
			aside={
				<CommentsSection
					description="Lab notes, identification context, and follow-up for this sample."
					target={{ type: 'sample', id: geo.id }}
				/>
			}
			facts={<ContextCard geo={geo} />}
			header={{
				flags: <AccessBadge canManage={canManage} />,
				icon: SampleIcon,
				recordType: 'sample',
				remove: {
					ask: askDelete,
					name: breadcrumbLabel(geo),
					onDelete: (acknowledgements) => sampleMutations.remove(geo.id, acknowledgements),
					recordId: geo.id,
					returnTo: '/larval-surveillance/samples',
				},
				subtitle: <SampleSubtitle geo={geo} />,
				title: sampleName(geo),
			}}
			layout={layout}
			lead={<SampleLocationCard geometry={geo.geojson} geomType={geo.geomType} />}
		>
			<IdentificationCard canManage={canManage} identity={identity} sampleId={geo.id} seed={geo} />
		</DetailPageShell>
	);
}

/** When the sample was collected, and off what. */
function SampleSubtitle({ geo }: { readonly geo: SampleGeoRow }) {
	return (
		<p className="m-0 inline-flex flex-wrap items-center gap-1.5">
			<CalendarIcon aria-hidden="true" className="size-4" />
			<span>Collected {formatFullDate(geo.inspectionDate)}</span>
			{geo.habitatId === null ? (
				<>
					<span aria-hidden="true">·</span>
					<span className="tabular-nums">{habitatLabel(geo, SAMPLE_LABEL)}</span>
				</>
			) : (
				<>
					<span aria-hidden="true">·</span>
					<span>at</span>
					<Link
						className={recordLink()}
						params={{ id: geo.habitatId }}
						to="/larval-surveillance/habitats/$id"
					>
						{habitatLabel(geo, SAMPLE_LABEL)}
					</Link>
				</>
			)}
		</p>
	);
}

function AccessBadge({ canManage }: { readonly canManage: boolean }) {
	return (
		<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
			{canManage ? 'Editor access' : 'View only'}
		</Badge>
	);
}

// --- location ---------------------------------------------------------------

function SampleLocationCard({
	geometry,
	geomType,
}: {
	readonly geometry: GeoJsonGeometry | null;
	readonly geomType: string | null;
}) {
	return (
		<RecordLocationCard
			emptyDescription="The parent inspection has no location to display."
			geojson={geometry}
			geomType={geomType}
			height="h-[240px]"
		/>
	);
}

// --- identification form (the "manage sample results" surface) --------------

interface Identity {
	readonly organizationId: string | null;
	readonly profileId: string | null;
	readonly role: string | null;
}

/**
 * The core of the page: the editable identification result. Reads the live sample
 * record and its species rows from the on-demand collections (so optimistic edits
 * reflect immediately), derives the resolved lifecycle status the same way the
 * server does, and dispatches add / edit / remove through the sample and
 * sample-species optimistic mutation handlers. Every write is gated on
 * {@link canManage}; a viewer gets the same layout read-only.
 */
function IdentificationCard({
	sampleId,
	seed,
	canManage,
	identity,
}: {
	readonly sampleId: string;
	readonly seed: SampleGeoRow;
	readonly canManage: boolean;
	readonly identity: Identity | null;
}) {
	const [error, setError] = useState<string | null>(null);
	const [keyEntryOpen, setKeyEntryOpen] = useState(false);
	const sampleMutations = useSampleMutations();
	const speciesMutations = useSampleSpeciesMutations();

	// The on-demand sample record — the source of truth for the disposition flags
	// and label. Falls back to the one-shot seed until the subset is ready.
	const recordResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query.from({ sample: samples() }).where(({ sample }) => eq(sample.id, sampleId)),
	});
	const speciesResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ sampleSpecies: sample_species() })
				.where(({ sampleSpecies }) => eq(sampleSpecies.sample_id, sampleId))
				.orderBy(({ sampleSpecies }) => sampleSpecies.larvae_count, 'desc')
				.select(({ sampleSpecies }) => ({
					id: sampleSpecies.id,
					speciesId: sampleSpecies.species_id,
					larvaeCount: sampleSpecies.larvae_count,
					identifiedByProfileId: sampleSpecies.identified_by_profile_id,
					identifiedAt: sampleSpecies.identified_at,
				})),
	});

	const record = (recordResult.data ?? [])[0] as Sample | undefined;
	const speciesRows = (speciesResult.data ?? []) as readonly SampleSpeciesEntry[];
	const isReady = recordResult.isReady && speciesResult.isReady;
	const isError = recordResult.isError || speciesResult.isError;

	const { nameById, options } = useAdoptedSpeciesOptions();

	// Prefer the live record; fall back to the fetched seed while the subset loads.
	const isZeroLarvae = record?.is_zero_larvae ?? seed.isZeroLarvae;
	const hasNonMosquito = record?.has_non_mosquito ?? seed.hasNonMosquito;
	const unidentifiableReason = record?.unidentifiable_reason ?? seed.unidentifiableReason;
	const displayName = record?.display_name ?? seed.displayName;

	const status = resolveStatus({
		hasSpecies: speciesRows.length > 0,
		isZeroLarvae,
		unidentifiableReason,
	});
	const larvaeTotal = speciesRows.reduce((sum, row) => sum + row.larvaeCount, 0);
	const meta = STATUS_META[status];

	const takenSpeciesIds = new Set(speciesRows.map((row) => row.speciesId));

	const timeZone = useOrganizationTimeZone();

	const guard = (): boolean => {
		if (!canManage || identity?.organizationId == null) {
			setError('You do not have permission to manage this sample.');
			return false;
		}
		return true;
	};

	const handleAddSpecies = async (speciesId: string, larvaeCount: number) => {
		if (!guard()) {
			return;
		}
		setError(null);
		const identifiedByProfileId = identity?.profileId ?? null;
		try {
			await speciesMutations.add({
				sampleSpeciesId: newRecordId(),
				sampleId,
				fields: {
					speciesId,
					larvaeCount,
					identifiedByProfileId,
					// A calendar date, not a timestamp — the domain builder validates
					// identifiedAt against YYYY-MM-DD and rejects a full ISO string.
					identifiedAt: todayInTimeZone(timeZone),
				},
			});
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to add species.'));
		}
	};

	const handleUpdateCount = async (rowId: string, larvaeCount: number) => {
		if (!guard()) {
			return;
		}
		setError(null);
		const current = speciesRows.find((row) => row.id === rowId);
		if (current === undefined) {
			return;
		}
		try {
			await speciesMutations.save(rowId, { ...current, larvaeCount }, current);
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to update count.'));
		}
	};

	const handleRemoveSpecies = async (rowId: string) => {
		if (!guard()) {
			return;
		}
		setError(null);
		try {
			await speciesMutations.remove(rowId);
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to remove species.'));
		}
	};

	/**
	 * The four disposition writes, each naming its own command.
	 *
	 * They were one `onPatch(draft => …)` that mutated whichever field the
	 * control touched and let the server work out what was meant — the inference
	 * this migration removes. Zero-larvae is two commands because which way it
	 * moved is the point; the other three are one each.
	 */
	const runPatch = async (write: () => Promise<void>, fallback: string) => {
		if (!guard()) {
			return;
		}
		setError(null);
		try {
			await write();
		} catch (cause) {
			setError(errorMessageForSave(cause, fallback));
		}
	};

	const disposition = {
		setZeroLarvae: (next: boolean) =>
			runPatch(() => sampleMutations.setZeroLarvae(sampleId, next), 'Unable to update the sample.'),
		setNonMosquito: (next: boolean) =>
			runPatch(
				() => sampleMutations.setNonMosquito(sampleId, next),
				'Unable to update the sample.',
			),
		setUnidentifiableReason: (next: string) =>
			runPatch(
				() => sampleMutations.setUnidentifiableReason(sampleId, next === '' ? null : next),
				'Unable to update the sample.',
			),
		rename: (next: string) =>
			runPatch(() => sampleMutations.rename(sampleId, next), 'Unable to update the sample.'),
	};

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<SpeciesIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							Identification
						</CardTitle>
						<CardDescription>{meta.description}</CardDescription>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Badge tone={meta.tone} variant="outline">
							{meta.label}
						</Badge>
						{canManage ? (
							<Button
								onClick={() => setKeyEntryOpen(true)}
								size="sm"
								type="button"
								variant="outline"
							>
								<KeyboardIcon aria-hidden="true" />
								Key entry
							</Button>
						) : null}
					</div>
				</div>
			</CardHeader>
			<CardContent className="grid gap-5" padding="compact">
				{error !== null ? (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}

				{/* No `empty`: a sample nobody has keyed out still needs its add row and
				    its disposition controls, so `SpeciesResultList` says there are no
				    species where the list would be rather than in place of the card. */}
				<PanelRows
					icon={<SpeciesIcon aria-hidden="true" />}
					reading={{ isError, isReady, rows: speciesRows }}
					unavailable={{
						description: 'The sample’s identification could not be loaded. Try again shortly.',
						title: 'Results Unavailable',
					}}
					wrap="none"
				>
					{(rows) => (
						<>
							<SpeciesResultList
								canManage={canManage}
								nameById={nameById}
								onRemove={handleRemoveSpecies}
								onUpdateCount={handleUpdateCount}
								rows={rows}
								total={larvaeTotal}
							/>

							{canManage ? (
								<AddSpeciesRow
									onAdd={handleAddSpecies}
									options={options}
									takenSpeciesIds={takenSpeciesIds}
								/>
							) : null}

							<DispositionSection
								canManage={canManage}
								displayName={displayName}
								hasNonMosquito={hasNonMosquito}
								hasSpecies={rows.length > 0}
								isZeroLarvae={isZeroLarvae}
								disposition={disposition}
								unidentifiableReason={unidentifiableReason}
							/>
						</>
					)}
				</PanelRows>
			</CardContent>

			{identity?.organizationId == null ? null : (
				<SampleKeyEntryDialog
					actorProfileId={identity.profileId}
					onOpenChange={setKeyEntryOpen}
					open={keyEntryOpen}
					sampleId={sampleId}
				/>
			)}
		</Card>
	);
}

function ContextCard({ geo }: { readonly geo: SampleGeoRow }) {
	const timeZone = useOrganizationTimeZone();
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<DetailList>
					<DetailRow label="Inspection">
						<Link
							className={cn(recordLink(), 'inline-flex items-center gap-1.5')}
							params={{ id: geo.inspectionId }}
							to="/larval-surveillance/inspections/$id"
						>
							<InspectionIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
							{formatMonthDayYear(geo.inspectionDate)}
						</Link>
					</DetailRow>
					<DetailRow label="Habitat">
						{geo.habitatId === null ? (
							<span className="tabular-nums">{habitatLabel(geo, SAMPLE_LABEL)}</span>
						) : (
							<Link
								className={cn(recordLink(), 'inline-flex items-center gap-1.5')}
								params={{ id: geo.habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								<HabitatIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
								{habitatLabel(geo, SAMPLE_LABEL)}
							</Link>
						)}
					</DetailRow>
					<DetailRow label="Collected">{formatFullDate(geo.inspectionDate)}</DetailRow>
					<DetailRow label="Recorded">{formatDateTime(geo.createdAt, timeZone)}</DetailRow>
					<DetailRow label="Updated">{formatDateTime(geo.updatedAt, timeZone)}</DetailRow>
				</DetailList>
			</CardContent>
		</Card>
	);
}

// --- presentational states --------------------------------------------------

// --- helpers ----------------------------------------------------------------

function resolveStatus(input: {
	readonly hasSpecies: boolean;
	readonly isZeroLarvae: boolean;
	readonly unidentifiableReason: string | null;
}): SampleStatus {
	if (input.hasSpecies) {
		return 'identified';
	}
	if (input.isZeroLarvae) {
		return 'zero_larvae';
	}
	if (input.unidentifiableReason !== null && input.unidentifiableReason.trim().length > 0) {
		return 'unidentifiable';
	}
	return 'awaiting';
}

function breadcrumbLabel(geo: SampleGeoRow): string {
	return `Sample · ${formatMonthDayYear(geo.inspectionDate)}`;
}
