---
'@simmer-mosquito/web': patch
---

Fixed: A date or time you type is now stored as the moment it names on the Agency's clock. Dates already read back in the Agency's timezone, but the saving half still used the browser's, so the two could disagree. An assignment's due time and a mission's scheduled start were written in whatever timezone the person filling the form was sitting in — set a 4pm deadline or a 6am muster from anywhere other than the yard and the crew read a different time than the one that was set, and simply reopening the record to save an unrelated change moved it again. A collection's date was stored at midday UTC, which lands on the following day for an agency at UTC+12 or beyond, so every surface filed it under the wrong day.
