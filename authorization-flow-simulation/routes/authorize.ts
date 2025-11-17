import { Router } from "express";
import type { Router as RouterType } from "express";
import { authorize } from "../controllers/authorizationController";

const router: RouterType = Router();

/**
 * GET /authorize
 *
 * Authorization endpoint for OAuth 2.0 Authorization Code Flow.
 * This implements steps (A) and (B) of RFC 6749 §1.2.
 *
 * Expected query parameters:
 *  - response_type: Must be "code"
 *  - client_id: The client identifier
 *  - redirect_uri: Where to redirect after authorization
 *  - state: (optional) Client state for CSRF protection
*/
router.get("/", authorize);

export default router;

