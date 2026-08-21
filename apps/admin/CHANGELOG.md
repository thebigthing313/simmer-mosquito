# @simmer-mosquito/admin

## 0.4.0 — 2026-08-21

### Minor Changes

- Added: A page that fails to load now reports what broke, in a panel beside the navigation you were using, instead of a bare block of text with nothing to act on.

### Patch Changes

- Fixed: An invitation that cannot be sent now says which of three things went wrong, in SIMMER's words. It used to repeat whatever sentence the sign-in service wrote, which was a string nobody here controls.

- Fixed: Inviting somebody no longer reports a failure after their email has already gone out.

## 0.3.0 — 2026-08-21

### Minor Changes

- Changed: Reaching the operator console now requires being signed in as SIMMER, rather than holding an operator account. Operators join the agencies they support, and while signed in to one of those agencies the console previously still opened, so the same person could be acting as an agency's admin and working the control plane in the same session. It now refuses that case and says to sign back in as SIMMER, which is the step that fixes it. The refusal an operator sees when the console is not theirs to reach used to say their account was not on the operator list; that was rarely the reason and named a fix they could not perform themselves.

### Patch Changes

- Fixed: A failed invitation from the operator console no longer mails a sign-in link the agency has no record of. The invitation used to go out before the person was added, so an address that could not be invited got a working link while the invite came back as an error.

- Fixed: Deleting a unit is now refused while any agency has it set as a default, which the confirmation dialog had always promised. Deleting one used to succeed and leave that agency's default naming a unit that no longer existed.

## 0.2.0 — 2026-08-13

### Minor Changes

- Added: KMZ files are accepted everywhere KML already was — importing regions in bulk, filling a record's geometry from a file, and setting an agency's boundaries up in the console. A file saved out of Google Earth no longer has to be re-exported first, and it stays on your device as before.

## 0.1.0 — 2026-08-10

### Minor Changes

- Added: The first release in production use — agency creation and support, invitations, global taxonomy and units, and entering an agency to work on its behalf.
- Added: A version number under the SIMMER logo, linking to this page.
