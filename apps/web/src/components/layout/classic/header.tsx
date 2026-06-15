import { Avatar, AvatarBadge, AvatarFallback } from '@simmer-mosquito/ui-web/components/ui/avatar';
import { demoIdentity } from '../shared/nav';
import { initialsFor } from '../shared/primitives';
import type { PageMeta } from '../shared/types';

/**
 * Classic console header: sticky context line + title + summary on the left, an
 * identity/organization chip on the right.
 */
export function ClassicHeader({ page }: { readonly page: PageMeta }) {
	return (
		<header className="sticky top-0 z-10 grid min-h-[88px] grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--app-chrome-strong)_22%,var(--app-chrome)),var(--app-chrome))] px-[clamp(18px,3vw,32px)] py-3 shadow-[0_14px_20px_-24px_oklch(36%_0.024_205/30%)] max-[900px]:grid-cols-1 max-[900px]:items-start">
			<div className="min-w-0">
				<div className="grid gap-1">
					<p className="eyebrow">{page.context}</p>
					<h1 className="m-0 text-[1.28rem] leading-tight font-extrabold text-foreground">
						{page.title}
					</h1>
					{page.summary === undefined ? null : (
						<p className="m-0 max-w-[72ch] text-[0.88rem] leading-normal text-muted-foreground">
							{page.summary}
						</p>
					)}
				</div>
			</div>
			<div className="flex items-center gap-3 rounded-md border border-border/45 bg-card/75 px-3 py-2 text-[0.84rem] font-semibold text-muted-foreground max-[560px]:w-full max-[560px]:justify-between">
				<div className="flex min-w-0 items-center gap-2">
					<Avatar size="sm" className="bg-(--app-selection) text-primary">
						<AvatarFallback>{initialsFor(demoIdentity.profileName)}</AvatarFallback>
						<AvatarBadge />
					</Avatar>
					<div className="min-w-0">
						<strong className="block whitespace-nowrap text-[0.86rem] leading-tight font-extrabold text-foreground">
							{demoIdentity.profileName}
						</strong>
						<span className="block text-[0.72rem] leading-tight font-bold text-(--quiet)">
							{demoIdentity.role}
						</span>
					</div>
				</div>
				<div className="hidden h-8 w-px bg-border/70 min-[561px]:block" />
				<div className="text-right max-[560px]:text-left">
					<span className="block text-[0.72rem] leading-tight font-bold text-(--quiet)">
						Organization
					</span>
					<strong className="block whitespace-nowrap text-[0.86rem] leading-tight font-extrabold text-foreground">
						{demoIdentity.organizationName}
					</strong>
				</div>
			</div>
		</header>
	);
}
