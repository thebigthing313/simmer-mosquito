import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/habitats/create')({
	component: CreateHabitatRoute,
});

function CreateHabitatRoute() {
	return (
		<Card variant="surface" className="border border-border/40">
			<CardHeader>
				<CardTitle>Create habitat</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="m-0 text-sm text-muted-foreground">Habitat creation will be added here.</p>
			</CardContent>
		</Card>
	);
}
