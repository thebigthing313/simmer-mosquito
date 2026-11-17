import { CommandError } from '@simmer-mosquito/sync';
import type { TreatmentFormValues } from './treatment-form-values';
import {
	isRecipeIssue,
	lineFieldForIssue,
	recomputeLines,
	type TreatmentLineValue,
	type TreatmentRecipe,
} from './treatment-line-values';

/** What the form does with a refused save. */
export interface TreatmentSaveRefusal {
	/** The error the form's alert shows. */
	readonly error: unknown;
	/** Row refusals keyed by the form field each lands on. */
	readonly fields: Readonly<Record<string, string>>;
	/** Rows recomputed from the current recipe, when the recipe check refused. */
	readonly lines: readonly TreatmentLineValue[] | null;
}

/** The text of the alert after the recipe check refused and the rows were recomputed. */
export const recipeChangedMessage =
	'The formulation changed since this form opened, so its products were worked out again from the current recipe. Check them and save again.';

interface IssueBody {
	readonly issues?: readonly { readonly path?: unknown; readonly message?: unknown }[];
}

/**
 * Read a refused save for the rows it names. A 400 naming `applications.N`
 * lands on row N+1. Under formulation entry, an issue on a row's product, unit
 * or amount, or a missing product, is the recipe check's: the rows are
 * recomputed from the recipe as it stands now rather than marked.
 */
export function treatmentSaveRefusal(
	error: unknown,
	values: TreatmentFormValues,
	recipeFor: (formulationId: string) => TreatmentRecipe,
): TreatmentSaveRefusal {
	if (!(error instanceof CommandError) || error.status !== 400) {
		return { error, fields: {}, lines: null };
	}
	const issues = ((error.body as IssueBody).issues ?? []).flatMap((issue) =>
		typeof issue.path === 'string' && typeof issue.message === 'string'
			? [{ path: issue.path, message: issue.message }]
			: [],
	);
	if (values.entry === 'formulation' && values.formulationId !== '') {
		if (issues.some((issue) => isRecipeIssue(issue.path))) {
			return {
				error: new Error(recipeChangedMessage),
				fields: {},
				lines: recomputeLines(values.lines, recipeFor(values.formulationId), values.mixAmount),
			};
		}
	}
	const fields: Record<string, string> = {};
	for (const issue of issues) {
		const field = lineFieldForIssue(values.lines, issue.path);
		if (field !== null) {
			fields[field] ??= issue.message;
		}
	}
	return { error, fields, lines: null };
}
