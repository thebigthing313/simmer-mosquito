import { ChangelogPage } from '@simmer-mosquito/ui-web/components/changelog';
import { createFileRoute } from '@tanstack/react-router';
// The generated release history, inlined at build. Production serves static
// files from Caddy with no Node behind them, so there is nothing to fetch this
// from at runtime; `?raw` makes the build the only place it can come from.
import changelogMarkdown from '../../CHANGELOG.md?raw';

export const Route = createFileRoute('/changelog')({
	component: ChangelogRoute,
});

function ChangelogRoute() {
	return (
		<ChangelogPage
			currentVersion={__APP_VERSION__}
			description="What has changed in SIMMER, newest first."
			markdown={changelogMarkdown}
			title="What's new"
		/>
	);
}
