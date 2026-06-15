import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { thresholdSignals, todayWork } from '../../shared/demo-data';
import {
	PageHeader,
	SectionHeader,
	SignalRow,
	SummaryTile,
	Surface,
	spanClass,
	TimelineItem,
	twelveColumnGridClass,
	WorkRow,
} from '../../shared/primitives';
import { ClassicShell } from '../outlet-shell';

/** No-map layout: a scannable operational dashboard. */
export function ClassicPlainExample() {
	return (
		<ClassicShell
			activePath="/"
			page={{
				context: 'General',
				title: 'Today at a glance',
				summary: 'A dashboard should summarize the work without forcing a map to render.',
			}}
		>
			<div className="mx-auto grid w-full max-w-[1380px] content-start gap-6">
				<PageHeader
					kicker="No-map dashboard"
					title="Today at a glance"
					body="Summaries, signals, and dispatch notes — no spatial context required."
					action={<Button type="button">Open activity map</Button>}
				/>
				<section
					className="grid grid-cols-4 gap-5 max-[1080px]:grid-cols-2 max-[820px]:grid-cols-1"
					aria-label="Operational overview"
				>
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
				<div className={twelveColumnGridClass}>
					<Surface className={spanClass(7)}>
						<SectionHeader title="Today’s activities" meta="Click through for spatial focus" />
						<div className="grid gap-2.5">
							{todayWork.map((item) => (
								<WorkRow item={item} key={item.id} />
							))}
						</div>
					</Surface>
					<Surface className={spanClass(5)}>
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
					<Surface className={spanClass(8)}>
						<SectionHeader title="Dispatch notes" meta="Recent command outcomes" />
						<div className="grid gap-2.5">
							<TimelineItem
								title="Mission scheduled"
								detail="North basin larval inspection route assigned to Crew 2."
							/>
							<TimelineItem
								title="Service request created"
								detail="SR-1048 received by phone, location matched to 18 Maple Court."
							/>
							<TimelineItem
								title="Inspection recorded"
								detail="HT-884 marked breeding positive with fourth instar and pupae present."
							/>
						</div>
					</Surface>
				</div>
			</div>
		</ClassicShell>
	);
}
