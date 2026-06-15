import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { thresholdSignals, todayWork } from '../../shared/demo-data';
import {
	PageHeader,
	SectionHeader,
	SignalRow,
	SummaryTile,
	Surface,
	WorkRow,
} from '../../shared/primitives';
import { RailShell } from '../outlet-shell';

/** No-map layout: an auto-fitting card grid of summaries and lists. */
export function RailPlainExample() {
	return (
		<RailShell
			activePath="/"
			page={{
				context: 'General',
				title: 'Dashboard',
				actions: (
					<Button type="button" size="sm">
						New record
					</Button>
				),
			}}
		>
			<div className="mx-auto grid w-full max-w-[1280px] content-start gap-5">
				<PageHeader
					kicker="No-map dashboard"
					title="Operational overview"
					body="A scannable summary that never forces a map to mount."
				/>
				<section className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
					<SummaryTile
						label="Activities scheduled"
						value="42"
						detail="16 not started"
						tone="info"
					/>
					<SummaryTile label="Open requests" value="18" detail="5 need triage" tone="attention" />
					<SummaryTile
						label="Breeding positive"
						value="7"
						detail="3 above threshold"
						tone="danger"
					/>
					<SummaryTile
						label="Crews available"
						value="6"
						detail="2 with spray equipment"
						tone="success"
					/>
				</section>
				<div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
					<Surface>
						<SectionHeader title="Today’s activities" meta="Across all crews" />
						<div className="grid gap-2.5">
							{todayWork.map((item) => (
								<WorkRow item={item} key={item.id} />
							))}
						</div>
					</Surface>
					<Surface>
						<SectionHeader title="Threshold signals" meta="Weather and surveillance" />
						<div className="grid gap-2.5">
							{thresholdSignals.map((signal) => (
								<SignalRow
									key={signal.label}
									label={signal.label}
									value={signal.value}
									detail={signal.detail}
									tone={signal.tone}
								/>
							))}
						</div>
					</Surface>
				</div>
			</div>
		</RailShell>
	);
}
