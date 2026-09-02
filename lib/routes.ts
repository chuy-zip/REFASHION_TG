/**
 * Route constants shared by the middleware and the auth screens.
 * Keeping them here means the post-login destination changes in one place.
 */

export const LOGIN_PATH = "/login";

/** Where a user lands after signing in. */
export const POST_LOGIN_PATH = "/clients";

/**
 * The one API route that does not require a valid session.
 *
 * Signing out is the single thing an expired session still has to be able to
 * do. Guarding it with the same 401 as everything else would refuse exactly the
 * person trying to leave — and leave their cookies in place, so the next page
 * load would refuse them too.
 */
export const LOGOUT_PATH = "/api/auth/logout";
