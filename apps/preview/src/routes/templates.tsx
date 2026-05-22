import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ArrowRightIcon, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
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
