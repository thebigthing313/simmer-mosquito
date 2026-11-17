import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { TreatmentDetail } from '../../../hooks/queries/control-action-view';
import type { TreatmentLine } from '../../../hooks/queries/treatment-lines';
import { useApplicationBatchNames } from '../../../hooks/queries/use-application-batch-names';
import { formatMeasure } from '../control-display';

const InsecticideIcon = iconRegistry.entities.insecticide.icon;

/**
 * The Treatment's products, one row per Chemical Application: the Insecticide,
 * the amount and the batches it drew from. Under a Formulation, the header
 * names the mix and its total. Takes the Treatment.
 */
export function TreatmentProductsCard({ treatment }: { readonly treatment: TreatmentDetail }) {
	const total = treatment.lines.length;
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<InsecticideIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							Products
						</CardTitle>
						{treatment.formulationId === null ? null : (
							<p className="m-0 text-muted-foreground text-xs">
								From{' '}
								{treatment.mixAmount === null
									? ''
									: `${formatMeasure(treatment.mixAmount, treatment.mixUnitAbbreviation)} of `}
								{treatment.formulationName ?? 'an unknown formulation'}
							</p>
						)}
					</div>
					<Badge tone="neutral" variant="outline">
						{total} {total === 1 ? 'product' : 'products'}
					</Badge>
				</div>
			</CardHeader>
			<CardContent padding="compact">
				<div className="overflow-hidden rounded-md border border-border/40">
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead>Insecticide</TableHead>
								<TableHead>Amount</TableHead>
								<TableHead>Batches</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{treatment.lines.map((line) => (
								<TreatmentProductRow key={line.id} line={line} />
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}

function TreatmentProductRow({ line }: { readonly line: TreatmentLine }) {
	// A batch link names the line, not the Treatment, so each row reads its own.
	const batchNames = useApplicationBatchNames(line.id);
	return (
		<TableRow>
			<TableCell className="font-medium">{line.insecticideName ?? 'Unknown insecticide'}</TableCell>
			<TableCell className="tabular-nums">
				{formatMeasure(line.amount, line.unitAbbreviation)}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{batchNames.length === 0 ? <AbsentValue /> : batchNames.join(', ')}
			</TableCell>
		</TableRow>
	);
}
