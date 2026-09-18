/** A request declares itself a token client by sending `x-simmer-client: token`. */
export const SESSION_CLIENT_HEADER = 'x-simmer-client';
export const TOKEN_CLIENT = 'token';

/** Where a rotated sealed session is returned to a token client. */
export const SESSION_RESPONSE_HEADER = 'x-simmer-session';
