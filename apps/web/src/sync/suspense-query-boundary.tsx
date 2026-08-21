import { QueryErrorResetBoundary } from '@tanstack/react-query';
import type React from 'react';
import { Component, Suspense } from 'react';

/**
 * The error fallback, either as a fixed node or as a render function.
 *
 * The function form exists because a fallback that cannot see what was thrown
 * can only say "something failed", which leaves the reader with nothing to
 * report. `reset` clears the caught error and re-renders the children, so a
 * fallback can offer a retry that does not cost a full page load.
 */
type ErrorFallback = React.ReactNode | ((error: unknown, reset: () => void) => React.ReactNode);

interface SuspenseQueryBoundaryProps {
	readonly children: React.ReactNode;
	readonly errorFallback?: ErrorFallback;
	readonly loadingFallback: React.ReactNode;
	readonly resetKey?: string;
}

interface SuspenseQueryBoundaryState {
	readonly error: unknown;
	readonly caught: boolean;
}

/**
 * `QueryErrorResetBoundary` is what makes the fallback's retry mean anything.
 *
 * Clearing this boundary's own state only re-renders the children. A react-query
 * read that already failed re-throws its cached error on that render, so the
 * retry looks inert: the surface flickers and comes straight back. The reset
 * boundary clears those cached errors first, so the read is actually reissued.
 *
 * It does not cover every way a child can fail. A component that throws
 * synchronously on state that has not changed will throw again, which is correct
 * behaviour and not something a retry button can fix.
 */
export function SuspenseQueryBoundary({
	children,
	errorFallback,
	loadingFallback,
	resetKey,
}: SuspenseQueryBoundaryProps) {
	return (
		<QueryErrorResetBoundary>
			{({ reset: resetQueries }) => {
				const boundaryProps =
					resetKey === undefined
						? { fallback: errorFallback ?? null, onReset: resetQueries }
						: { fallback: errorFallback ?? null, onReset: resetQueries, resetKey };

				return (
					<QueryErrorBoundary {...boundaryProps}>
						<Suspense fallback={loadingFallback}>{children}</Suspense>
					</QueryErrorBoundary>
				);
			}}
		</QueryErrorResetBoundary>
	);
}

class QueryErrorBoundary extends Component<
	{
		readonly children: React.ReactNode;
		readonly fallback: ErrorFallback;
		readonly onReset: () => void;
		readonly resetKey?: string;
	},
	SuspenseQueryBoundaryState
> {
	// `caught` rather than a `null` error: a bare `throw` and a rejected
	// `undefined` both reach here as a thrown `undefined`, and a boundary that
	// tests the value for null renders its children again on the next commit.
	override state: SuspenseQueryBoundaryState = {
		error: undefined,
		caught: false,
	};

	static getDerivedStateFromError(error: unknown): SuspenseQueryBoundaryState {
		return { error, caught: true };
	}

	override componentDidUpdate(previousProps: { readonly resetKey?: string }) {
		if (this.state.caught && previousProps.resetKey !== this.props.resetKey) {
			this.reset();
		}
	}

	// Queries first: clearing local state re-renders the children, and a cached
	// query error still standing at that point throws straight back into here.
	reset = () => {
		this.props.onReset();
		this.setState({ error: undefined, caught: false });
	};

	override render() {
		if (this.state.caught) {
			const { fallback } = this.props;
			return typeof fallback === 'function' ? fallback(this.state.error, this.reset) : fallback;
		}

		return this.props.children;
	}
}
