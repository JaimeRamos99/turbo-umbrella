import { Request, Response } from "express";
import { processAuthorizationRequest } from "../services/authorizationService";

/**
 * Controller layer for authorization endpoint.
 * This layer handles HTTP-specific concerns:
 *  - Extracting parameters from request
 *  - Calling service layer
 *  - Formatting and sending response
 */

/**
 * GET /authorize
 *
 * Handles the authorization endpoint request.
 * Extracts query parameters, delegates to service layer,
 * and sends appropriate HTTP response.
 *
 * This endpoint implements steps (A) and (B) of RFC 6749 §1.2:
 *  (A) Client requests authorization
 *  (B) Client receives authorization grant (code) via redirect
 */
export function authorize(req: Request, res: Response): void {
  // Extract query parameters from HTTP request
  const responseType = req.query.response_type as string | undefined;
  const clientId = req.query.client_id as string | undefined;
  const redirectUri = req.query.redirect_uri as string | undefined;
  const state = req.query.state as string | undefined;

  // Delegate business logic to service layer
  const result = processAuthorizationRequest({
    responseType,
    clientId,
    redirectUri,
    state,
  });

  // Handle the result and send appropriate HTTP response
  if (result.success && result.redirectUrl) {
    // Success: redirect to client's redirect_uri with authorization code
    res.redirect(result.redirectUrl);
  } else if (result.error) {
    // Error: return JSON error response
    res.status(400).json({
      error: result.error.code,
      error_description: result.error.description,
    });
  }
}

