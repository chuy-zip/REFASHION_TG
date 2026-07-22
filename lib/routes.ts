/**
 * Route constants shared by the middleware and the auth screens.
 * Keeping them here means the post-login destination changes in one place.
 */

export const LOGIN_PATH = "/login";

/**
 * Where a user lands after signing in.
 * Step 1 uses "/" as a placeholder; this becomes "/clients" in step 2.
 */
export const POST_LOGIN_PATH = "/";
