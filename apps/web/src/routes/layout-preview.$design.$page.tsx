import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DEFAULT_DESIGN, DEFAULT_PAGE, getExample } from '../components/layout/registry';

export const Route = createFileRoute('/layout-preview/$design/$page')({
	component: LayoutPreviewExample,
});

function LayoutPreviewExample() {
	const { design, page } = Route.useParams();
	const Example = getExample(design, page);

	if (Example === undefined) {
		return (
			<div className="grid h-svh place-items-center bg-(--app-stage) p-6">
				<div className="grid max-w-md gap-3 rounded-lg border border-border/40 bg-card p-6 text-center">
					<p className="eyebrow">Layout preview</p>
					<strong className="text-[1rem] text-foreground">
						No example for “{design} / {page}”.
					</strong>
					<Button asChild>
						<Link
							to="/layout-preview/$design/$page"
							params={{ design: DEFAULT_DESIGN, page: DEFAULT_PAGE }}
						>
							Back to default
						</Link>
					</Button>
				</div>
			</div>
		);
	}

	return <Example />;
}
