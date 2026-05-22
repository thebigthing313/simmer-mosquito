import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldSet,
	FieldTitle,
} from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	NativeSelect,
	NativeSelectOption,
} from '@simmer-mosquito/ui-web/components/ui/native-select';
import { Progress } from '@simmer-mosquito/ui-web/components/ui/progress';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tabs';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import {
	CheckCircle2Icon,
	DownloadIcon,
	PlusIcon,
	SaveIcon,
	SearchIcon,
	TriangleAlertIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/kitchen-sink')({
	component: KitchenSinkPage,
});

const buttonVariants = ['default', 'secondary', 'outline', 'ghost', 'destructive'] as const;
const badgeTones = ['success', 'warning', 'info', 'catalog', 'danger', 'neutral'] as const;

function KitchenSinkPage() {
	return (
		<div className="workshop-page">
			<header className="preview-page-header">
				<div>
					<p className="preview-eyebrow">Phase 3</p>
					<h1>Kitchen Sink</h1>
				</div>
				<p>Default shared UI states in one scrollable surface for visual regression review.</p>
			</header>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Actions</p>
						<h2>Buttons & Badges</h2>
					</div>
				</div>
				<div className="component-grid dense">
					{buttonVariants.map((variant) => (
						<Button key={variant} type="button" variant={variant}>
							{variant === 'default' ? <SaveIcon aria-hidden="true" /> : null}
							{variant}
						</Button>
					))}
					<Button type="button" size="sm" variant="outline">
						<DownloadIcon aria-hidden="true" />
						Small
					</Button>
					<Button type="button" size="icon" aria-label="Add record">
						<PlusIcon aria-hidden="true" />
					</Button>
					<Button type="button" disabled>
						Disabled
					</Button>
				</div>
				<div className="component-grid dense">
					{badgeTones.map((tone) => (
						<Badge key={tone} tone={tone} variant="outline">
							{tone}
						</Badge>
					))}
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Forms</p>
						<h2>Fields & Controls</h2>
					</div>
				</div>
				<div className="form-preview-grid">
					<FieldSet>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="trap-name">Trap name</FieldLabel>
								<Input id="trap-name" placeholder="BG Sentinel 14" />
								<FieldDescription>Operational label shown in mission dispatch.</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="district">District</FieldLabel>
								<NativeSelect id="district" defaultValue="north">
									<NativeSelectOption value="north">North field district</NativeSelectOption>
									<NativeSelectOption value="south">South field district</NativeSelectOption>
								</NativeSelect>
							</Field>
							<Field>
								<FieldLabel htmlFor="notes">Notes</FieldLabel>
								<Textarea id="notes" placeholder="Access gate is locked after 4 PM." />
							</Field>
						</FieldGroup>
					</FieldSet>
					<FieldSet className="control-stack">
						<Field orientation="horizontal">
							<Checkbox id="include-archived" />
							<FieldTitle>Include archived records</FieldTitle>
						</Field>
						<Field orientation="horizontal">
							<Switch id="map-context" defaultChecked />
							<FieldTitle>Keep map context visible</FieldTitle>
						</Field>
						<Separator />
						<Progress value={68} />
					</FieldSet>
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Containers</p>
						<h2>Cards, Alerts & Tabs</h2>
					</div>
				</div>
				<div className="component-grid cards">
					<Card>
						<CardHeader>
							<CardTitle>Route readiness</CardTitle>
							<CardDescription>Inspection queue for tomorrow morning.</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="fact-row">
								<span>Stops</span>
								<strong>37</strong>
							</div>
							<div className="fact-row">
								<span>Unassigned</span>
								<strong>4</strong>
							</div>
						</CardContent>
						<CardFooter>
							<Button type="button" size="sm" variant="secondary">
								Review
							</Button>
						</CardFooter>
					</Card>
					<div className="alert-stack">
						<Alert>
							<CheckCircle2Icon aria-hidden="true" />
							<AlertTitle>Sync current</AlertTitle>
							<AlertDescription>
								All shared taxonomy records are available offline.
							</AlertDescription>
						</Alert>
						<Alert variant="destructive">
							<TriangleAlertIcon aria-hidden="true" />
							<AlertTitle>Threshold exceeded</AlertTitle>
							<AlertDescription>
								Adult trap count requires review before publishing.
							</AlertDescription>
						</Alert>
					</div>
					<Tabs defaultValue="records">
						<TabsList>
							<TabsTrigger value="records">Records</TabsTrigger>
							<TabsTrigger value="map">Map</TabsTrigger>
						</TabsList>
						<TabsContent value="records">
							<div className="tab-panel">34 records ready for assignment.</div>
						</TabsContent>
						<TabsContent value="map">
							<div className="tab-panel">Spatial layer preview placeholder.</div>
						</TabsContent>
					</Tabs>
				</div>
			</section>

			<section className="preview-section">
				<div className="preview-section-header">
					<div>
						<p className="preview-eyebrow">Data</p>
						<h2>Table & Loading</h2>
					</div>
					<div className="icon-search compact">
						<SearchIcon aria-hidden="true" />
						<Input aria-label="Visual table search" placeholder="Search records" />
					</div>
				</div>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Record</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Assigned</TableHead>
							<TableHead className="text-right">Count</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{['Larval habitat check', 'Adult trap pickup', 'Public service request'].map(
							(record, index) => (
								<TableRow key={record}>
									<TableCell>{record}</TableCell>
									<TableCell>
										<Badge tone={index === 0 ? 'warning' : 'success'} variant="outline">
											{index === 0 ? 'Review' : 'Ready'}
										</Badge>
									</TableCell>
									<TableCell>{index === 2 ? 'Unassigned' : 'Field team A'}</TableCell>
									<TableCell className="text-right">{12 + index * 9}</TableCell>
								</TableRow>
							),
						)}
					</TableBody>
				</Table>
				<div className="skeleton-row">
					<Skeleton className="h-10 w-10 rounded-md" />
					<Skeleton className="h-4 w-48" />
					<Skeleton className="h-4 w-28" />
				</div>
			</section>
		</div>
	);
}
