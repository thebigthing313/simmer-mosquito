import { errorName } from './error-name.js';
import { errorStatus } from './error-status.js';

export function isUnprocessable(error: unknown): boolean {
	return errorName(error) === 'UnprocessableEntityException' || errorStatus(error) === 422;
}
