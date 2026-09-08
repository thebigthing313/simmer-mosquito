---
'@simmer-mosquito/web': patch
---

Changed: every date and count in the app now reads the same
whatever machine it is opened on. Fifty-six formatters named no locale, so each
one inherited whatever the browser happened to be set to. A record dated
"Aug 4, 2026" for one person read "4. Aug. 2026" for the person beside them with
a different setting, and a count of 14,245 larvae read 14.245, which is a
different number to anyone reading quickly. All of them now render as en-US,
which is what the rest of the product was already written in, and what the other
six formatters already pinned.

Nothing else moves. Which day a record belongs to is still your Organization's
zone, not the reader's, so a date is the day the work happened either way. The
two formatters that pick a tag for its shape rather than for a reader are
untouched: the one that writes a date column back as `YYYY-MM-DD`, and the one
that fills a time field with a 24-hour `HH:MM`.
