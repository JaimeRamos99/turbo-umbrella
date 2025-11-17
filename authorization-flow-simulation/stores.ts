import { Client, AuthorizationCode, AccessToken } from "./types";

/**
 * In-memory store for clients.
 * In real implementations, this would be a database.
 */
export const clients: Client[] = [
  {
    clientId: "my-client-id",
    redirectUri: "https://oauth.pstmn.io/v1/callback", // Postman OAuth mock callback URL
  },
];

/**
 * In-memory store for authorization codes.
 */
export const authorizationCodes = new Map<string, AuthorizationCode>();

/**
 * In-memory store for access tokens.
 */
export const accessTokens = new Map<string, AccessToken>();

