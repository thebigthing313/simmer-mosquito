import { SplitPage } from '@simmer-mosquito/ui-web/components/app-shell/outlet/split-page';
import { ErrorReport } from '@simmer-mosquito/ui-web/components/error-report';
import { RecordFormPage } from '@simmer-mosquito/ui-web/components/form/form-components/record-form-page';
import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Card } from '@simmer-mosquito/ui-web/components/ui/card';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ArrowRightIcon, DropletIcon, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/templates')({
	component: TemplatesPage,
});

const stressRecords = [
	{
		name: 'A very long adult surveillance trap name that should wrap without breaking row actions',
		status: 'Needs review',
		region: 'Northwest marsh corridor with seasonal access restrictions',
	},
	{
		name: 'Service request near school boundary',
		status: 'Ready',
		region: 'District 04',
	},
	{
		name: 'لارفا habitat inspection with RTL content',
		status: 'Assigned',
		region: 'Mixed direction sample',
	},
] as const;

const checks = [
	['Keyboard focus', 'Visible focus rings on all controls', 'Pass'],
	['Color meaning', 'Badges include text labels, not color alone', 'Pass'],
	['RTL layout', 'Template can flip direction for copy stress', 'In review'],
	['Extreme data', 'Long names wrap while actions remain reachable', 'Pass'],
] as const;

/** Enough rows, paragraphs and fields to run each scrolling surface past its bound. */
const overflowRows = Array.from({ length: 14 }, (_, index) => `Source reduction ${index + 1}`);
const overflowFields = Array.from({ length: 12 }, (_, index) => `Field ${index + 1}`);

/** A long message and a long stack, so both of the report's scrollers overflow. */
const overflowError = (() => {
	const error = new Error(
		Array.from({ length: 12 }, (_, index) => `Line ${index + 1} of a long failure message.`).join(
			'\n',
		),
	);
	error.stack = Array.from(
		{ length: 40 },
		(_, index) => `    at frame${index} (src/module-${index}.ts:${index + 1}:1)`,
	).join('\n');
	return error;
})();

function MapStandIn() {
	return (
		<div className="template-map h-full">
			<MapPinnedIcon aria-hidden="true" />
			<span>Map context</span>
		</div>
	);
}

function TemplatesPage() {
	const [rtl, setRtl] = useState(false);

	return (
		<div className="workshop-page" dir={rtl ? 'rtl' : 'ltr'}>
			<header className="preview-page-header">
				<div>
					<p className="preview-eyebrow">Phase 5</p>
					<h1>Templates & Accessibility</h1>
				</div>
				<div className="template-toggle">
					<span>RTL stress</span>
					<Switch checked={rtl} onCheckedChange={setRtl} />
				</div>
			</header>

			<section className="template-layout preview-section">
				<div className="template-map">
					<MapPinnedIcon aria-hidden="true" />
					<span>Map context</span>
				</div>
				<div className="template-record-panel">
					<div className="preview-section-header">
						<div>
							<p className="preview-eyebrow">Real workflow</p>
							<h2>Mission dispatch review</h2>
						</div>
						<Button type="button" size="sm">
							Commit route
							<ArrowRightIcon aria-hidden="true" />
						</Button>
					</div>
					<div className="record-list">
						{stressRecords.map((record) => (
							<article className="stress-record" key={record.name}>
								<div>
									<strong>{record.name}</strong>
									<span>{record.region}</span>
								</div>
								<Badge tone={record.status === 'Ready' ? 'success' : 'warning'} variant="outline">
									{record.status}
								</Badge>
							</article>
						))}
					</div>
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Overflow</p>
						<h2>Scrolling Surfaces</h2>
					</div>
					<p>
						The shared page parts that scroll on their own, each filled past its bound so the styled
						bar shows: a capped panel body, the split page column, a split record form and the error
						report's message and stack.
					</p>
				</div>
				<div className="grid gap-4">
					<Panel
						icon={<DropletIcon aria-hidden="true" className="size-4" />}
						scrollBody
						title="Source Reductions"
					>
						<ul className="m-0 grid list-none gap-2 p-4">
							{overflowRows.map((row) => (
								<li className="rounded-md border border-border/40 px-3 py-2.5 text-sm" key={row}>
									{row}
								</li>
							))}
						</ul>
					</Panel>
					<div className="h-80 overflow-hidden rounded-lg border border-border">
						<SplitPage aside={<MapStandIn />}>
							<div className="grid gap-3 p-5">
								{overflowRows.map((row) => (
									<p className="m-0 text-sm" key={row}>
										{row}
									</p>
								))}
							</div>
						</SplitPage>
					</div>
					<div className="h-[28rem] overflow-hidden rounded-lg border border-border">
						<RecordFormPage
							actions={<Button type="submit">Save</Button>}
							aside={<MapStandIn />}
							header={{ backLabel: 'Templates', backTo: '/templates', title: 'Edit Habitat' }}
							onSubmit={() => {}}
						>
							{overflowFields.map((field) => (
								<Input aria-label={field} key={field} placeholder={field} />
							))}
						</RecordFormPage>
					</div>
					<Card className="gap-0 overflow-hidden py-0">
						<ErrorReport
							error={overflowError}
							reset={() => {}}
							title="The page did not load"
							version="preview"
						/>
					</Card>
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Accessibility</p>
						<h2>Matrix</h2>
					</div>
				</div>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Check</TableHead>
							<TableHead>Evidence</TableHead>
							<TableHead>Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{checks.map(([check, evidence, status]) => (
							<TableRow key={check}>
								<TableCell>{check}</TableCell>
								<TableCell>{evidence}</TableCell>
								<TableCell>
									<Badge tone={status === 'Pass' ? 'success' : 'warning'} variant="outline">
										{status}
									</Badge>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</section>
		</div>
	);
}
