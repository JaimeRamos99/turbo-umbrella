import { Router } from "express";
import type { Router as RouterType } from "express";
import { token } from "../controllers/tokenController";

const router: RouterType = Router();

/**
 * POST /token
 *
 * Token endpoint for OAuth 2.0 Authorization Code Flow.
 * This implements steps (C) and (D) of RFC 6749 §1.2.
 *
 * Expected body parameters:
 *  - grant_type: Must be "authorization_code"
 *  - code: The authorization code received from /authorize
 *  - redirect_uri: Must match the redirect_uri from /authorize
 */
router.post("/", token);

export default router;

