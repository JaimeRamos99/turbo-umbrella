import { Request, Response } from "express";
import { exchangeCodeForToken } from "../services/tokenService";

/**
 * Controller layer for token endpoint.
 * This layer handles HTTP-specific concerns:
 *  - Extracting parameters from request body
 *  - Calling service layer
 *  - Formatting and sending response
 */

/**
 * POST /token
 *
 * Handles the token endpoint request.
 * Extracts body parameters, delegates to service layer,
 * and sends appropriate HTTP response.
 *
 * This endpoint implements steps (C) and (D) of RFC 6749 §1.2:
 *  (C) Client sends authorization code to token endpoint
 *  (D) Authorization server validates code and returns access token
 */
export function token(req: Request, res: Response): void {
  // Extract parameters from HTTP request body
  const grantType = req.body.grant_type as string | undefined;
  const code = req.body.code as string | undefined;
  const redirectUri = req.body.redirect_uri as string | undefined;

  // Delegate business logic to service layer
  const result = exchangeCodeForToken({
    grantType,
    code,
    redirectUri,
  });

  // Handle the result and send appropriate HTTP response
  if (result.success && result.token) {
    // Success: return access token
    res.json(result.token);
  } else if (result.error) {
    // Error: return JSON error response
    res.status(400).json({
      error: result.error.code,
      error_description: result.error.description,
    });
  }
}

