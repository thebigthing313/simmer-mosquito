import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link, Outlet, useParams } from '@tanstack/react-router';
import type React from 'react';
import {
	DEFAULT_DESIGN,
	DEFAULT_PAGE,
	designs,
	PAGE_KEYS,
	pageLabels,
} from '../components/layout/registry';

/**
 * Dev-only preview shell for the three candidate layout designs. Renders the
 * selected example full-viewport with a floating switcher to walk every
 * design × page combination. Not wired into product navigation; the root route
 * renders this subtree standalone (no production chrome, no auth).
 */
export const Route = createFileRoute('/layout-preview')({
	component: LayoutPreviewLayout,
});

function LayoutPreviewLayout() {
	const params = useParams({ strict: false }) as { design?: string; page?: string };
	const activeDesign = params.design ?? DEFAULT_DESIGN;
	const activePage = params.page ?? DEFAULT_PAGE;

	return (
		<div className="relative h-svh w-full overflow-hidden">
			<Outlet />
			<div className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card/95 px-3 py-2 shadow-[0_18px_40px_-20px_oklch(36%_0.024_205/60%)] backdrop-blur">
				<span className="px-1 text-[0.68rem] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
					Layout preview
				</span>
				<SegmentedGroup>
					{designs.map((design) => (
						<Link
							key={design.key}
							to="/layout-preview/$design/$page"
							params={{ design: design.key, page: activePage }}
							className={segmentClass(design.key === activeDesign)}
							title={design.description}
						>
							{design.label}
						</Link>
					))}
				</SegmentedGroup>
				<SegmentedGroup>
					{PAGE_KEYS.map((page) => (
						<Link
							key={page}
							to="/layout-preview/$design/$page"
							params={{ design: activeDesign, page }}
							className={segmentClass(page === activePage)}
						>
							{pageLabels[page]}
						</Link>
					))}
				</SegmentedGroup>
			</div>
		</div>
	);
}

function SegmentedGroup({ children }: { readonly children: React.ReactNode }) {
	return <div className="flex gap-1 rounded-full bg-muted p-1">{children}</div>;
}

function segmentClass(active: boolean): string {
	return cn(
		'rounded-full px-3 py-1 text-[0.8rem] font-semibold no-underline transition-colors',
		active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
	);
}
