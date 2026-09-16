/**
 * Facts the legal pages need that cannot be derived from the code.
 *
 * `/privacy` and `/terms` used to tell readers to "contact the address published on the site"
 * while no address was published anywhere in the application. That is a promise the product did
 * not keep, and for a privacy notice it is the most material kind of gap, because a right nobody
 * can exercise is not a right. The values live here so there is exactly one place to fill in, and
 * so both pages change together rather than drifting apart.
 *
 * Leave a value `null` and the pages describe the position honestly instead of asserting
 * something untrue. Set it and they use it.
 */

/** Contact address for privacy requests that cannot be self-served. */
export const PRIVACY_CONTACT_EMAIL: string | null = null;

/**
 * Who the data controller is: a named individual or a company, and the country.
 *
 * This determines the controller identity in the notice, which supervisory authority leads, and
 * what a governing law clause should say, so it is a decision rather than a label.
 */
export const DATA_CONTROLLER: string | null = null;
