# OAuth 2.0 Authorization Server

A TypeScript implementation of the OAuth 2.0 Authorization Code Flow as described in [RFC 6749](https://tools.ietf.org/html/rfc6749).

## Overview

This server implements the complete OAuth 2.0 Authorization Code Flow with two main endpoints:

- **GET /authorize**: Authorization endpoint (steps A & B of the flow)
- **POST /token**: Token endpoint (steps C & D of the flow)

### OAuth 2.0 Flow

```
(A) Client requests authorization at GET /authorize
     ↓
(B) Client receives authorization grant (code) via redirect
     ↓
(C) Client exchanges code at POST /token
     ↓
(D) Authorization server issues access token
```

## Architecture

Layered architecture with separation of concerns:

```
├── server.ts                        # Application entry point
├── routes/                          # Routing (endpoint definitions)
├── controllers/                     # HTTP handling (request/response)
├── services/                        # Business logic (OAuth 2.0 flow)
├── stores.ts                        # Data persistence (in-memory)
├── types.ts                         # TypeScript types
└── utils/                           # Helper functions
```

📄 See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed flow diagrams and component interactions.

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- pnpm (or npm/yarn)

### Installation

1. Clone the repository and navigate to the project directory:

```bash
cd authorization-flow-simulation
```

2. Install dependencies:

```bash
pnpm install
```

### Running the Server

Start the development server:

```bash
pnpm run dev
```

The server will start on `http://localhost:4000`

### Build for Production

Compile TypeScript to JavaScript:

```bash
pnpm run build
```

Run the compiled version:

```bash
pnpm start
```

## API Documentation

### GET /authorize

Initiates the OAuth 2.0 authorization flow.

**Query Parameters:**

| Parameter     | Type   | Required | Description                           |
|--------------|--------|----------|---------------------------------------|
| response_type | string | Yes      | Must be "code"                        |
| client_id    | string | Yes      | The client identifier                 |
| redirect_uri | string | Yes      | Where to redirect after authorization |
| state        | string | No       | Client state for CSRF protection      |

**Example Request:**

```bash
curl "http://localhost:4000/authorize?response_type=code&client_id=my-client-id&redirect_uri=https://oauth.pstmn.io/v1/callback&state=xyz123"
```

**Success Response:**

```
HTTP 302 Redirect to:
https://oauth.pstmn.io/v1/callback?code=<authorization_code>&state=xyz123
```

**Error Response:**

```json
{
  "error": "invalid_client",
  "error_description": "Unknown client_id"
}
```

### POST /token

Exchanges an authorization code for an access token.

**Body Parameters (JSON or form-encoded):**

| Parameter     | Type   | Required | Description                          |
|--------------|--------|----------|--------------------------------------|
| grant_type   | string | Yes      | Must be "authorization_code"         |
| code         | string | Yes      | Authorization code from /authorize   |
| redirect_uri | string | Yes      | Must match the original redirect_uri |

**Example Request:**

```bash
curl -X POST http://localhost:4000/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "<authorization_code>",
    "redirect_uri": "https://oauth.pstmn.io/v1/callback"
  }'
```

**Success Response:**

```json
{
  "access_token": "<access_token>",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Error Response:**

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code has expired"
}
```

## Configuration

### Registered Clients

Clients are configured in `stores.ts`. Default client for Postman testing:

```typescript
{
  clientId: "my-client-id",
  redirectUri: "https://oauth.pstmn.io/v1/callback"
}
```

### Token Expiration

- **Authorization codes**: 5 minutes (configurable in `authorizationService.ts`)
- **Access tokens**: 1 hour (configurable in `tokenService.ts`)

## Security Notes

### Current Implementation

This is a **simplified implementation**. It includes:

- ✅ Authorization code generation and validation
- ✅ Single-use code enforcement
- ✅ Code expiration
- ✅ Redirect URI validation
- ✅ State parameter support (CSRF protection)

### Intentionally Omitted

This implementation prioritizes **simplicity**, **clarity**, and **avoiding over-engineering** as mentioned in the challenge. The following (and more) production-grade practices were intentionally not implemented:

- **Structured Logging**: Winston, Pino, or similar
- **Error Handling Middleware**: Centralized error handling
- **Request Correlation IDs**: Request tracking
- **Async Error Handling**: `wrapAsyncController` utilities
- **Validation Libraries**: Joi, Zod, express-validator
- **Environment Configuration**: dotenv, config management
- **Health Check Endpoints**: `/health`, `/ready`
- **API Versioning**: `/v1/` routing patterns
- **Rate Limiting**: Express rate-limit middleware
- **CORS Configuration**: Cross-origin setup
- **Security Headers**: Helmet.js middleware
- **Input Sanitization**: XSS/injection prevention
- **Metrics & Monitoring**: Prometheus, DataDog
- **API Documentation**: Swagger/OpenAPI specs
- **Testing**: Unit/integration tests
- **Database Layer**: ORM/ODM frameworks
- **Dependency Injection**: IoC containers
- **DTO Validation**: class-validator patterns

Focus remains on demonstrating OAuth 2.0 Authorization Code Flow architecture.

## Error Codes

The server returns standard OAuth 2.0 error codes:

| Error Code              | Description                                    |
|------------------------|------------------------------------------------|
| invalid_request        | Missing or invalid request parameters          |
| invalid_client         | Unknown or invalid client_id                   |
| unsupported_response_type | response_type is not "code"                 |
| unsupported_grant_type | grant_type is not "authorization_code"         |
| invalid_grant          | Code is invalid, expired, or already used      |

## References

- [RFC 6749 - The OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)
- [OAuth 2.0 Simplified](https://www.oauth.com/)
