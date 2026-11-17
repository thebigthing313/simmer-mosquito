import { customSchemaFor } from '@simmer-mosquito/ui-web/components/form';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { TreatmentDetailsCard } from '../../../components/control-operations/chemical/treatment-details-card';
import { TreatmentLocationCard } from '../../../components/control-operations/chemical/treatment-location-card';
import { TreatmentProductsCard } from '../../../components/control-operations/chemical/treatment-products-card';
import {
	ContextBadge,
	controlContext,
	formatActionDate,
	formatMeasure,
} from '../../../components/control-operations/control-display';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	DetailPageShell,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { useTreatmentMutations } from '../../../hooks/mutations/use-treatment-mutations';
import { catalogs } from '../../../hooks/queries/catalog-register';
import type { TreatmentDetail } from '../../../hooks/queries/control-action-view';
import { useCatalogRoster } from '../../../hooks/queries/use-catalog-roster';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useTreatment } from '../../../hooks/queries/use-treatment';
import type { AskAcknowledged } from '../../../hooks/use-acknowledged-write';
import { TREATMENT_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { listTreatmentLines } from '../../../lib/list-treatment-lines';
import { recordNoun } from '../../../lib/record-nouns';

export const Route = createFileRoute('/control-operations/chemical/$id')({
	component: RouteComponent,
});

const TreatmentIcon = iconRegistry.entities.application.icon;

// Roles that get a read-only view: no edit entry.
const READ_ONLY_ROLES = new Set(['viewer']);

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { main: [['h-[360px]', 'h-64'], 'h-48'], aside: ['h-72'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const snapshot = auth.snapshot?.authenticated === true ? auth.snapshot : null;
	const role = snapshot?.localIdentity.role ?? null;
	const canEdit = snapshot !== null && !(role !== null && READ_ONLY_ROLES.has(role));
	// The Treatment by id and its lines by `treatment_id`, in one read.
	// `treatments` is on-demand, so this is status-gated rather than suspending.
	const { treatment, isReady, isError } = useTreatment(id);

	return (
		<RecordDetailPage
			deleteRefusals={TREATMENT_DELETE_REFUSALS}
			layout={layout}
			recordType="treatment"
			reading={{ isError, isReady, record: treatment }}
		>
			{(record, askDelete) => (
				<TreatmentDetailContent askDelete={askDelete} canEdit={canEdit} treatment={record} />
			)}
		</RecordDetailPage>
	);
}

function TreatmentDetailContent({
	treatment,
	askDelete,
	canEdit,
}: {
	readonly treatment: TreatmentDetail;
	readonly askDelete: AskAcknowledged;
	readonly canEdit: boolean;
}) {
	// The roster is read for the custom-field schema the chosen method declares;
	// the method's name arrives joined.
	const methods = useCatalogRoster(catalogs.applicationMethods);
	const { remove } = useTreatmentMutations();
	// habitats is on-demand and has no join here; resolve the linked habitat's
	// name as a subset.
	const habitatNameById = useHabitatNames(
		treatment.habitatId === null ? [] : [treatment.habitatId],
	);
	const habitatName =
		treatment.habitatId === null
			? null
			: (habitatNameById.get(treatment.habitatId) ?? 'Unknown habitat');

	const title =
		treatment.lines.length === 0
			? recordNoun('treatment').title
			: listTreatmentLines(
					treatment.lines,
					(line) => line.insecticideName ?? 'Unknown insecticide',
				);
	const amounts = listTreatmentLines(treatment.lines, (line) =>
		formatMeasure(line.amount, line.unitAbbreviation),
	);

	useBreadcrumbLabel(treatment.id, title);

	return (
		<DetailPageShell
			aside={<CommentsSection target={{ type: 'treatment', id: treatment.id }} />}
			facts={
				<>
					<TreatmentDetailsCard habitatName={habitatName} treatment={treatment} />
					<CustomFieldsCard
						metadata={treatment.metadata}
						schema={customSchemaFor(methods, treatment.methodId)}
					/>
				</>
			}
			header={{
				...(canEdit
					? {
							edit: {
								params: { id: treatment.id },
								to: '/control-operations/chemical/$id/edit' as const,
							},
						}
					: {}),
				flags: <ContextBadge context={controlContext(treatment)} />,
				icon: TreatmentIcon,
				recordType: 'treatment',
				remove: {
					ask: askDelete,
					name: title,
					onDelete: (acknowledgements) => remove(treatment.id, acknowledgements),
					recordId: treatment.id,
					returnTo: '/control-operations/chemical',
				},
				subtitle: `${amounts === '' ? '' : `${amounts} · `}${formatActionDate(treatment.actionDate)}`,
				title,
			}}
			layout={layout}
			lead={
				<div className="grid content-start gap-3">
					<TreatmentLocationCard habitatName={habitatName} treatment={treatment} />
					<RecordRegionsBand recordId={treatment.id} recordType="treatments" />
				</div>
			}
		>
			<TreatmentProductsCard treatment={treatment} />
		</DetailPageShell>
	);
}
