import { randomUUID } from "crypto";
import { AccessToken, TokenRequest, TokenResult } from "../types";
import { authorizationCodes, accessTokens } from "../stores";

/**
 * Service layer for token-related business logic.
 * This layer contains the core OAuth 2.0 token exchange logic,
 * independent of HTTP concerns.
 */

/**
 * Validates the token request parameters.
 */
function validateTokenRequest(
  request: Partial<TokenRequest>
): TokenResult | null {
  const { grantType, code, redirectUri } = request;

  // Check for required parameters
  if (!grantType || !code || !redirectUri) {
    return {
      success: false,
      error: {
        code: "invalid_request",
        description:
          "Missing required parameters: grant_type, code, redirect_uri",
      },
    };
  }

  // Only support authorization_code grant type
  if (grantType !== "authorization_code") {
    return {
      success: false,
      error: {
        code: "unsupported_grant_type",
        description:
          "This authorization server only supports grant_type=authorization_code",
      },
    };
  }

  return null; // No validation errors
}

/**
 * Validates the authorization code.
 * Checks:
 *  - Code exists
 *  - Code hasn't been used (single-use enforcement)
 *  - Code hasn't expired
 *  - Redirect URI matches
 */
function validateAuthorizationCode(
  code: string,
  redirectUri: string
): TokenResult | null {
  const storedCode = authorizationCodes.get(code);

  if (!storedCode) {
    return {
      success: false,
      error: {
        code: "invalid_grant",
        description: "Authorization code is unknown",
      },
    };
  }

  // Enforce single-use codes
  if (storedCode.used) {
    return {
      success: false,
      error: {
        code: "invalid_grant",
        description: "Authorization code has already been used",
      },
    };
  }

  // Check expiration
  if (storedCode.expiresAt <= Date.now()) {
    return {
      success: false,
      error: {
        code: "invalid_grant",
        description: "Authorization code has expired",
      },
    };
  }

  // Verify redirect_uri matches
  if (storedCode.redirectUri !== redirectUri) {
    return {
      success: false,
      error: {
        code: "invalid_grant",
        description:
          "redirect_uri does not match the original redirect URI used in /authorize",
      },
    };
  }

  return null; // No validation errors
}

/**
 * Generates and stores an access token.
 */
function generateAccessToken(
  clientId: string,
  userId: string
): { token: string; expiresIn: number } {
  const accessTokenValue = randomUUID();
  const accessTokenExpiresInSeconds = 3600; // 1 hour

  const accessToken: AccessToken = {
    token: accessTokenValue,
    clientId,
    userId,
    expiresAt: Date.now() + accessTokenExpiresInSeconds * 1000,
  };

  accessTokens.set(accessTokenValue, accessToken);

  return {
    token: accessTokenValue,
    expiresIn: accessTokenExpiresInSeconds,
  };
}

/**
 * Main service method: Exchange authorization code for access token.
 *
 * This method implements the OAuth 2.0 token endpoint logic:
 *  1. Validate request parameters
 *  2. Validate authorization code
 *  3. Mark code as used
 *  4. Generate and return access token
 */
export function exchangeCodeForToken(
  request: Partial<TokenRequest>
): TokenResult {
  // Step 1: Validate request parameters
  const validationError = validateTokenRequest(request);
  if (validationError) {
    return validationError;
  }

  const { code, redirectUri } = request as TokenRequest;

  // Step 2: Validate authorization code
  const codeValidationError = validateAuthorizationCode(code, redirectUri);
  if (codeValidationError) {
    return codeValidationError;
  }

  // Step 3: Mark code as used (single-use enforcement)
  const storedCode = authorizationCodes.get(code)!;
  storedCode.used = true;
  // Optionally, we could delete it instead:
  // authorizationCodes.delete(code);

  // Step 4: Generate access token
  const { token, expiresIn } = generateAccessToken(
    storedCode.clientId,
    storedCode.userId
  );

  return {
    success: true,
    token: {
      access_token: token,
      token_type: "Bearer",
      expires_in: expiresIn,
    },
  };
}

