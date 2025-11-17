# OAuth 2.0 Authorization Code Flow - Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Authorization Server                         │
│                      (localhost:4000)                            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    server.ts (Entry)                      │  │
│  │                  - Express app setup                      │  │
│  │                  - Middleware mounting                    │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                      │
│         ┌─────────────────┴────────────────┐                    │
│         │                                  │                    │
│         ▼                                  ▼                    │
│  ┌─────────────┐                   ┌─────────────┐             │
│  │   ROUTES    │                   │   ROUTES    │             │
│  │  /authorize │                   │   /token    │             │
│  └──────┬──────┘                   └──────┬──────┘             │
│         │                                  │                    │
│         ▼                                  ▼                    │
│  ┌──────────────┐                  ┌──────────────┐            │
│  │ CONTROLLERS  │                  │ CONTROLLERS  │            │
│  │  authorize() │                  │   token()    │            │
│  │ - Extract    │                  │ - Extract    │            │
│  │   params     │                  │   body       │            │
│  │ - Format     │                  │ - Format     │            │
│  │   response   │                  │   response   │            │
│  └──────┬───────┘                  └──────┬───────┘            │
│         │                                  │                    │
│         ▼                                  ▼                    │
│  ┌──────────────────┐              ┌──────────────────┐        │
│  │    SERVICES      │              │    SERVICES      │        │
│  │ Authorization    │              │     Token        │        │
│  │ - Validate       │              │ - Validate       │        │
│  │   client         │              │   grant_type     │        │
│  │ - Generate code  │              │ - Validate code  │        │
│  │ - Build redirect │              │ - Generate token │        │
│  └────────┬─────────┘              └────────┬─────────┘        │
│           │                                  │                  │
│           └──────────────┬───────────────────┘                  │
│                          ▼                                      │
│                  ┌───────────────┐                              │
│                  │  DATA STORES  │                              │
│                  │  - clients[]  │                              │
│                  │  - authCodes  │                              │
│                  │  - tokens     │                              │
│                  └───────────────┘                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## OAuth 2.0 Authorization Code Flow

```
┌─────────┐                                              ┌──────────────┐
│         │                                              │              │
│ Client  │                                              │   Resource   │
│  App    │                                              │    Owner     │
│         │                                              │   (User)     │
└────┬────┘                                              └──────────────┘
     │                                                           │
     │                                                           │
     │    (A) GET /authorize?response_type=code&client_id=...   │
     ├───────────────────────────────────────────────────────────►
     │                                                           │
     │                  ┌─────────────────────────────────┐     │
     │                  │  Authorization Server           │     │
     │                  │                                 │     │
     │                  │  1. Validate client_id          │     │
     │                  │  2. Validate redirect_uri       │     │
     │                  │  3. (Mock) User auth & consent  │     │
     │                  │  4. Generate auth code          │     │
     │                  │  5. Store code                  │     │
     │                  └─────────────────────────────────┘     │
     │                                                           │
     │    (B) 302 Redirect to redirect_uri?code=AUTH_CODE       │
     ◄───────────────────────────────────────────────────────────┤
     │                                                           │
     │                                                           │
     │    (C) POST /token                                        │
     │        grant_type=authorization_code                      │
     │        code=AUTH_CODE                                     │
     │        redirect_uri=...                                   │
     ├───────────────────────────────────────────────────────────►
     │                                                           │
     │                  ┌─────────────────────────────────┐     │
     │                  │  Authorization Server           │     │
     │                  │                                 │     │
     │                  │  1. Validate code exists        │     │
     │                  │  2. Check not used (single-use) │     │
     │                  │  3. Check not expired           │     │
     │                  │  4. Verify redirect_uri matches │     │
     │                  │  5. Mark code as used           │     │
     │                  │  6. Generate access token       │     │
     │                  │  7. Store token                 │     │
     │                  └─────────────────────────────────┘     │
     │                                                           │
     │    (D) 200 OK                                             │
     │    { access_token, token_type, expires_in }               │
     ◄───────────────────────────────────────────────────────────┤
     │                                                           │
     │                                                           │
     │    Now can access protected resources with token         │
     │                                                           │
```

## Request Flow Through Layers

### Authorization Request (GET /authorize)

```
HTTP Request (Query Params)
         │
         ▼
    Routes Layer
    (authorize.ts)
         │
         ▼
  Controller Layer
  (authorizationController.ts)
    - Extract query params
         │
         ▼
   Service Layer
   (authorizationService.ts)
    - validateAuthorizationRequest()
    - validateClient()
    - generateAuthorizationCode()
    - buildRedirectUrl()
         │
         ▼
    Data Stores
    (stores.ts)
    - authorizationCodes.set()
         │
         ▼
  Controller Layer
    - Send redirect response
         │
         ▼
    HTTP Response (302 Redirect)
```

### Token Request (POST /token)

```
HTTP Request (Body Params)
         │
         ▼
    Routes Layer
    (token.ts)
         │
         ▼
  Controller Layer
  (tokenController.ts)
    - Extract body params
         │
         ▼
   Service Layer
   (tokenService.ts)
    - validateTokenRequest()
    - validateAuthorizationCode()
    - generateAccessToken()
         │
         ▼
    Data Stores
    (stores.ts)
    - authorizationCodes.get()
    - authorizationCodes.set() [mark used]
    - accessTokens.set()
         │
         ▼
  Controller Layer
    - Send JSON response
         │
         ▼
    HTTP Response (200 OK + Token)
```

## Key Components

### Routes
- **Purpose**: Map HTTP endpoints to controller functions
- **Files**: `routes/authorize.ts`, `routes/token.ts`
- **Responsibility**: Routing only, no business logic

### Controllers
- **Purpose**: Handle HTTP request/response concerns
- **Files**: `controllers/authorizationController.ts`, `controllers/tokenController.ts`
- **Responsibility**: Extract params, call services, format responses

### Services
- **Purpose**: Core OAuth 2.0 business logic
- **Files**: `services/authorizationService.ts`, `services/tokenService.ts`
- **Responsibility**: Validation, code/token generation, flow orchestration

### Stores
- **Purpose**: Data persistence layer
- **Files**: `stores.ts`
- **Responsibility**: In-memory storage of clients, codes, and tokens

### Types
- **Purpose**: TypeScript type definitions
- **Files**: `types.ts`
- **Responsibility**: Type safety across all layers

### Utils
- **Purpose**: Reusable helper functions
- **Files**: `utils/clientUtils.ts`
- **Responsibility**: Common utilities (e.g., client lookup)

## Security Features

- ✅ **Authorization Code Pattern**: Separates authorization from token issuance
- ✅ **Single-Use Codes**: Codes can only be exchanged once
- ✅ **Code Expiration**: Codes expire after 5 minutes
- ✅ **Redirect URI Validation**: Prevents open redirector vulnerabilities
- ✅ **State Parameter**: CSRF protection mechanism

