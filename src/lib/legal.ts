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
 *
 * Do not set `PRIVACY_CONTACT_EMAIL` until mail to that address actually arrives somewhere a
 * person reads. Publishing an address that silently discards mail is the same failure as
 * publishing none, with the added problem that it looks like it works.
 *
 * Do not set `DATA_CONTROLLER` to a company name unless that company is genuinely the one
 * operating the service. Under GDPR the controller is whoever decides the purposes and means of
 * processing, which is a question of fact rather than of branding. If a company is named here,
 * the hosting account and the payment account should be in that company's name too, and users
 * should be contracting with it.
 */

/** Contact address for privacy requests that cannot be self-served. */
export const PRIVACY_CONTACT_EMAIL: string | null = null;

/** The operating entity, including its jurisdiction, for example "Example Labs LLC (Delaware, USA)". */
export const DATA_CONTROLLER: string | null = null;
