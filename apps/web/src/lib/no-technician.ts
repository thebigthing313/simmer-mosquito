/**
 * What a technician select carries when nobody is assigned.
 *
 * Radix Select forbids an empty-string item value, so "Unassigned" needs a
 * sentinel of its own, and every form holding a technician field reads the same
 * one: the biocontrol, source reduction and outreach forms draw the option, and
 * their edit routes map a null `technicianProfileId` onto it before the form
 * opens. It was written out three times before #908, once in each form module
 * and exported from each, so the value a form offered and the value its edit
 * route seeded were one fact in three places.
 *
 * It is a form-field value rather than a stored one. Nothing sends it: each form
 * maps it back to `null` on the way out.
 */
export const noTechnicianValue = 'none';
