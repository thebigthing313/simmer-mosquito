# Observed WorkOS password failures

Captured from a live WorkOS **staging** environment on 2026-08-05 by
`packages/auth/src/probe-reset-password.ts` (#54). Re-run the probe rather than
editing this by hand:

```sh
WORKOS_API_KEY=<staging key> pnpm --filter @simmer-mosquito/auth probe:reset-password
```

SDK: `@workos-inc/node` 8.13.0.

| Scenario | `name` | `status` | `code` |
|---|---|---|---|
| `resetPassword`, valid token, password below minimum length | `BadRequestException` | 400 | `password_reset_error` |
| `resetPassword`, valid token, known-breached password | `BadRequestException` | 400 | `password_reset_error` |
| `resetPassword`, already-used token | `NotFoundException` | 404 | `password_reset_token_not_found` |
| `resetPassword`, malformed token | `NotFoundException` | 404 | `password_reset_token_not_found` |
| `createUser`, weak password | `BadRequestException` | 400 | `password_strength_error` |
| `updateUser`, weak password | `BadRequestException` | 400 | `password_strength_error` |

**Not captured: an expired token.** WorkOS sets the lifetime, so producing one
means waiting. Its shape is very likely the 404 above — a spent token and an
unknown token already answer identically, and both messages read "Could not
locate user with provided token".

## What this changed

Every guess the mapping was built on was wrong in at least one way.

**Nothing is a 422.** `isPasswordRejection` opened with
`if (!isUnprocessable(error)) return false`, so it answered `false` for every
real policy rejection, which then fell through to `isBadRequest` and returned
`invalid_token`. A user who chose a seven-character password on the reset form
was told their link had expired — the precise misdirection #54 was filed to
prevent, shipping in the direction nobody had checked.

**Of the three inferred codes, one existed.** `password_strength_error` is real
but belongs to `createUser`/`updateUser`, not to the reset path.
`password_validation_error` and `weak_password` were not observed anywhere.

**The top-level message is useless and `errors[]` is not.** A refused reset says
"Could not reset password." The sentence worth showing is in `errors[]`:

```json
{
  "code": "password_too_short",
  "message": "The provided password does not meet the minimum length requirements. Please try a password with 10 or more characters.",
  "minimum_length": 10
}
```

A password can fail more than one requirement at once — short *and* weak — so
there can be several entries.

**Token failures are cleanly separable by status.** 404 versus 400 settles it
without reading any string, which is what let the message-substring fallback go.

## Full payloads

```json
[
  {
    "scenario": "valid token, password below the policy minimum",
    "name": "BadRequestException",
    "status": 400,
    "code": "password_reset_error",
    "message": "Could not reset password.",
    "errors": [
      {
        "message": "The provided password does not meet the minimum length requirements. Please try a password with 10 or more characters.",
        "code": "password_too_short",
        "minimum_length": 10
      },
      {
        "message": "The provided password is not strong enough. ",
        "code": "password_too_weak",
        "warning": "",
        "suggestions": ["Add more words that are less common."]
      }
    ]
  },
  {
    "scenario": "valid token, known-breached password",
    "name": "BadRequestException",
    "status": 400,
    "code": "password_reset_error",
    "message": "Could not reset password.",
    "errors": [
      {
        "message": "The provided password is not strong enough. This is similar to a commonly used password.",
        "code": "password_too_weak",
        "warning": "This is similar to a commonly used password.",
        "suggestions": [
          "Add more words that are less common.",
          "Capitalize more than the first letter."
        ]
      }
    ]
  },
  {
    "scenario": "already-used token",
    "name": "NotFoundException",
    "status": 404,
    "code": "password_reset_token_not_found",
    "message": "Could not locate user with provided token: 'qYdC3AJiF6DWzZIujAgkf5nBb'",
    "errors": null
  },
  {
    "scenario": "malformed token",
    "name": "NotFoundException",
    "status": 404,
    "code": "password_reset_token_not_found",
    "message": "Could not locate user with provided token: 'not-a-real-token'",
    "errors": null
  },
  {
    "scenario": "updateUser with a weak password",
    "name": "BadRequestException",
    "status": 400,
    "code": "password_strength_error",
    "message": "Password does not meet strength requirements.",
    "errors": [
      {
        "message": "The provided password does not meet the minimum length requirements. Please try a password with 10 or more characters.",
        "code": "password_too_short",
        "minimum_length": 10
      },
      {
        "message": "The provided password is not strong enough. ",
        "code": "password_too_weak",
        "warning": "",
        "suggestions": ["Add more words that are less common."]
      }
    ]
  }
]
```
