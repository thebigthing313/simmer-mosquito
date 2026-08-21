/**
 * The SIMMER error surfaces: one report body, and the frames that place it.
 *
 * `ErrorReport` is what a reader sees when something threw. `RouteErrorPage` is
 * the in-shell frame around it, wired as a router's `defaultErrorComponent`. The
 * pre-shell frame lives in the app that owns a shell to be outside of.
 */

export { ErrorReport, type ErrorReportProps } from './error-report';
export {
	buildErrorReport,
	describeError,
	type ErrorDetails,
	joinStacks,
	type ReportContext,
} from './error-report-text';
export { RouteErrorPage } from './route-error-page';
