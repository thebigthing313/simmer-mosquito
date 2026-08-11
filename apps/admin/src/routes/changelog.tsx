import { ChangelogPage } from '@simmer-mosquito/ui-web/components/changelog';
import { createFileRoute } from '@tanstack/react-router';
// Inlined at build for the same reason as the workspace app's copy: the console
// ships as static files with no server behind them.
import changelogMarkdown from '../../CHANGELOG.md?raw';

export const Route = createFileRoute('/changelog')({
	component: ChangelogRoute,
});

function ChangelogRoute() {
	return (
		<ChangelogPage
			currentVersion={__APP_VERSION__}
			description="What has changed in the operator console, newest first."
			markdown={changelogMarkdown}
			title="What's new"
		/>
	);
}
