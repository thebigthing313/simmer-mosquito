---
'@simmer-mosquito/web': minor
---

Changed: Organization settings now refuse values they cannot use instead of quietly replacing them. A timezone the agency does not support, a unit default naming a code that is not that kind of unit, or a key binding pointing at a species that no longer exists were all accepted and stored as something else, with the save reporting success. Each is now an error that says what was wrong.

Changed: Saving a setting no longer overwrites changes somebody else made while you had the panel open. Two people editing the agency at once used to end with whoever saved second silently replacing the other's work, including settings they had not touched. A save now covers only the setting it changed, and a genuine collision says so and asks you to reopen.
