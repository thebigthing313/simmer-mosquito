import { errorName } from './error-name.js';
import { errorStatus } from './error-status.js';

export function isNotFound(error: unknown): boolean {
	return errorName(error) === 'NotFoundException' || errorStatus(error) === 404;
}
