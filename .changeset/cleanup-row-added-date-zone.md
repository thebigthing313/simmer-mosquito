---
'@simmer-mosquito/web': patch
---

Fixed: The added date on a cleanup suggestion row is now the day the record was
added on your Organization's calendar, not on the calendar of whoever opened the
page. A contact added at 9pm read as the next day to a colleague a zone east,
which is a difference you cannot see and a date two rows of a group get compared
on. The same correction applies to the dates in the Service Request Activity
panel on the Public Engagement overview, which were read in UTC.
