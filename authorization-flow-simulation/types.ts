/**
 * In a real OAuth 2.0 server, clients are usually stored in a database and
 * registered out-of-band (with client_id, redirect_uris, etc.).
 *
 * For this exercise, we hard-code a single client.
 *
 * This corresponds to the "Client" role in RFC 6749 §1.1.
 */
export type Client = {
  clientId: string;
  redirectUri: string; // in real life: array of allowed redirect URIs
};

/**
 * Authorization Code model.
 *
 * This represents the "authorization grant" of type "authorization code"
 * described in RFC 6749 §1.3.1.
 *
 * It is a short-lived, single-use credential that the client will later
 * exchange at the /token endpoint for an access token.
 */
export type AuthorizationCode = {
  code: string;          // the actual code value
  clientId: string;      // which client this code belongs to
  redirectUri: string;   // redirect_uri that was used in /authorize
  userId: string;        // which user granted the authorization (mocked)
  expiresAt: number;     // timestamp when the code expires (ms since epoch)
  used: boolean;         // single-use enforcement flag
};

/**
 * Access Token model.
 *
 * Represents the credential the client will use to access protected
 * resources (RFC 6749 §1.4).
 */
export type AccessToken = {
  token: string;
  clientId: string;
  userId: string;
  expiresAt: number;
};

/**
 * Authorize Request model.
 *
 * Represents the request to the authorization endpoint.
 */
export interface AuthorizeRequest {
  responseType: string;
  clientId: string;
  redirectUri: string;
  state?: string;
}

/**
 * Authorize Result model.
 *
 * Represents the result of the authorization endpoint.
 */
export interface AuthorizeResult {
  success: boolean;
  redirectUrl?: string;
  error?: {
    code: string;
    description: string;
  };
}

/**
 * Token Request model.
 *
 * Represents the request to the token endpoint.
 */
export interface TokenRequest {
  grantType: string;
  code: string;
  redirectUri: string;
}

/**
 * Token Result model.
 *
 * Represents the result of the token endpoint.
 */
export interface TokenResult {
  success: boolean;
  token?: {
    access_token: string;
    token_type: string;
    expires_in: number;
  };
  error?: {
    code: string;
    description: string;
  };
}