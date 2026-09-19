import { SignedOutEnvironmentBanner } from '@simmer-mosquito/ui-web/components/environment-banner';
import type { ReactNode } from 'react';
import { LandingStage } from '../landing/landing-stage';

export function AuthShell({
	title,
	description,
	children,
	footer,
}: {
	readonly title: string;
	readonly description?: ReactNode;
	readonly children?: ReactNode;
	readonly footer?: ReactNode;
}) {
	// Same frame as the landing page, banner wrapper included: the split is
	// `lg:h-svh`, so the strip goes outside it rather than in a row of its own,
	// and the column is flex so the split still fills the window on the
	// deployments where the strip renders nothing.
	return (
		<div className="flex min-h-svh flex-col lg:h-svh">
			<SignedOutEnvironmentBanner environment={import.meta.env.VITE_SIMMER_ENVIRONMENT} />
			<div className="grid flex-1 grid-rows-[auto_1fr] lg:min-h-0 lg:grid-cols-[1.05fr_0.95fr] lg:grid-rows-1">
				<LandingStage variant="aside" />
				{/* Animation on the panel, not the section — see the landing entry column. */}
				<section className="flex min-h-0 overflow-y-auto bg-(--app-stage) px-6 py-10 sm:px-10 lg:py-12">
					<div className="landing-fade m-auto flex w-full max-w-[400px] flex-col gap-6">
						<header className="grid gap-2">
							<h1 className="m-0 text-balance font-bold text-[1.55rem] text-foreground leading-tight tracking-[-0.01em]">
								{title}
							</h1>
							{description ? (
								<p className="m-0 text-muted-foreground leading-normal">{description}</p>
							) : null}
						</header>
						{children}
						{footer ? (
							<div className="border-border/60 border-t pt-5 text-muted-foreground text-sm">
								{footer}
							</div>
						) : null}
					</div>
				</section>
			</div>
		</div>
	);
}
