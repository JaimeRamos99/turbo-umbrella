import { randomUUID } from "crypto";
import { AuthorizationCode, AuthorizeRequest, AuthorizeResult, Client } from "../types";
import { authorizationCodes } from "../stores";
import { findClientById } from "../utils/clientUtils";

/**
 * Service layer for authorization-related business logic.
 * This layer contains the core OAuth 2.0 authorization flow logic,
 * independent of HTTP concerns.
 */

/**
 * Validates the authorization request parameters.
 */
function validateAuthorizationRequest(
  request: Partial<AuthorizeRequest>
): AuthorizeResult | null {
  const { responseType, clientId, redirectUri } = request;

  // Check for required parameters
  if (!responseType || !clientId || !redirectUri) {
    return {
      success: false,
      error: {
        code: "invalid_request",
        description:
          "Missing required query parameters: response_type, client_id, redirect_uri",
      },
    };
  }

  // Enforce response_type=code (Authorization Code Grant)
  if (responseType !== "code") {
    return {
      success: false,
      error: {
        code: "unsupported_response_type",
        description:
          "This authorization server only supports response_type=code",
      },
    };
  }

  return null; // No validation errors
}

/**
 * Validates the client and redirect URI.
 */
function validateClient(
  clientId: string,
  redirectUri: string
): { client: Client } | AuthorizeResult {
  const client = findClientById(clientId);

  if (!client) {
    return {
      success: false,
      error: {
        code: "invalid_client",
        description: "Unknown client_id",
      },
    };
  }

  // Validate redirect_uri matches the registered URI
  if (client.redirectUri !== redirectUri) {
    return {
      success: false,
      error: {
        code: "invalid_request",
        description:
          "The provided redirect_uri does not match the registered redirect URI for this client",
      },
    };
  }

  return { client };
}

/**
 * Generates and stores an authorization code.
 */
function generateAuthorizationCode(
  client: Client,
  redirectUri: string,
  userId: string
): string {
  const code = randomUUID();
  const expiresInMs = 5 * 60 * 1000; // 5 minutes

  const authCode: AuthorizationCode = {
    code,
    clientId: client.clientId,
    redirectUri,
    userId,
    expiresAt: Date.now() + expiresInMs,
    used: false,
  };

  authorizationCodes.set(code, authCode);
  return code;
}

/**
 * Builds the redirect URL with the authorization code and state.
 */
function buildRedirectUrl(
  redirectUri: string,
  code: string,
  state?: string
): string {
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);

  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  return redirectUrl.toString();
}

/**
 * Main service method: Process an authorization request.
 *
 * This method implements the OAuth 2.0 authorization endpoint logic:
 *  1. Validate request parameters
 *  2. Validate client and redirect URI
 *  3. Generate authorization code
 *  4. Return redirect URL
 *
 * In a real implementation, this would also:
 *  - Authenticate the user
 *  - Show a consent screen
 *  - Handle user approval/denial
 */
export function processAuthorizationRequest(
  request: Partial<AuthorizeRequest>
): AuthorizeResult {
  // Step 1: Validate request parameters
  const validationError = validateAuthorizationRequest(request);
  if (validationError) {
    return validationError;
  }

  const { clientId, redirectUri, state } = request as AuthorizeRequest;

  // Step 2: Validate client
  const clientValidation = validateClient(clientId, redirectUri);
  if (!("client" in clientValidation)) {
    return clientValidation;
  }

  const { client } = clientValidation;

  /**
   * Step 3: Simulate user authentication and consent.
   * In a real implementation:
   *  - Check if user is logged in (session/cookie)
   *  - Show consent screen
   *  - Get user approval
   *
   * For this exercise, we assume user is logged in and has consented.
   */
  const userId = "user-123"; // Mocked user ID (Resource Owner, RFC 6749 §1.1)

  // Step 4: Generate authorization code
  const code = generateAuthorizationCode(client, redirectUri, userId);

  // Step 5: Build redirect URL
  const redirectUrl = buildRedirectUrl(redirectUri, code, state);

  return {
    success: true,
    redirectUrl,
  };
}

