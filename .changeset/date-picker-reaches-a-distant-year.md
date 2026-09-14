---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Added: The date picker reaches a distant month or year in three presses. The
month and the year in the calendar's caption are each a button now: the month
opens a grid of twelve months, the year opens a grid of twelve years that pages
a decade at a time, and picking one hands the calendar back on it. A Today
button sits under the day grid. Reaching a day three years back used to be 36
presses of the same arrow. Where a picker is bounded, the months and years the
bound puts out of reach are greyed out along with the days, and Today is greyed
where today is outside the range.
