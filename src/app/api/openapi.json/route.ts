import { NextResponse } from 'next/server'

// GET /api/openapi.json
// Returns an OpenAPI 3.1 spec describing the /api/public/v1/* endpoints.
// Used by the in-app API explorer and importable by OpenFN / N8N / Postman.

const SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'DataMind BI — Public API',
    version: '1.0.0',
    description:
      'REST API for third-party integrations (OpenFN, N8N, custom scripts). ' +
      'Authenticate with a `dm_live_…` bearer token generated from Settings → API Keys.',
    contact: { name: 'DataMind BI', url: 'https://datamind.mooo.com' },
  },
  servers: [
    { url: 'https://datamind.mooo.com', description: 'Production' },
    { url: 'http://localhost:3000', description: 'Sandbox / local dev' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key in `dm_live_…` format. Generated under Settings → API Keys.',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string', nullable: true },
        },
        required: ['id', 'email'],
      },
      ApiKey: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          scopes: {
            type: 'array',
            items: { type: 'string', enum: ['read', 'execute', 'admin'] },
          },
          prefix: { type: 'string', example: 'dm_live_a1B2' },
          lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
          allowedIps: { type: 'array', items: { type: 'string' } },
          rateLimitPerMinute: { type: 'integer', nullable: true },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: { type: 'object' },
        },
        required: ['error'],
      },
      Datasource: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['postgres', 'mysql', 'bigquery', 'snowflake', 'redshift'] },
          status: { type: 'string', enum: ['connected', 'error', 'syncing'] },
          lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Dashboard: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          widgets: { type: 'integer' },
          lastEditedAt: { type: 'string', format: 'date-time' },
          url: { type: 'string' },
        },
      },
      QueryRequest: {
        type: 'object',
        properties: {
          sql: { type: 'string', example: 'SELECT * FROM orders LIMIT 10' },
          datasourceId: { type: 'string', nullable: true },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
        },
        required: ['sql'],
      },
      QueryResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          sql: { type: 'string' },
          datasourceId: { type: 'string' },
          rowCount: { type: 'integer' },
          durationMs: { type: 'integer' },
          rows: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/public/v1/me': {
      get: {
        summary: 'Validate key & return owning user',
        description:
          'Use this as a "ping" endpoint to verify a key is valid, active, and has the expected scopes. ' +
          'Returns the owning user plus an account summary.',
        tags: ['account'],
        operationId: 'getMe',
        responses: {
          '200': {
            description: 'Key is valid',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    user: { $ref: '#/components/schemas/User' },
                    apiKey: { $ref: '#/components/schemas/ApiKey' },
                    account: {
                      type: 'object',
                      properties: {
                        activeKeys: { type: 'integer' },
                        totalApiRequests: { type: 'integer' },
                      },
                    },
                    server: {
                      type: 'object',
                      properties: {
                        time: { type: 'string', format: 'date-time' },
                        durationMs: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
            headers: {
              'X-RateLimit-Limit': { schema: { type: 'integer' } },
              'X-RateLimit-Remaining': { schema: { type: 'integer' } },
            },
          },
          '401': {
            description: 'Missing / invalid / revoked / expired key',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'IP not in allowlist, or scope insufficient',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '429': {
            description: 'Rate limit exceeded',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            headers: {
              'Retry-After': { schema: { type: 'integer' } },
              'X-RateLimit-Limit': { schema: { type: 'integer' } },
              'X-RateLimit-Remaining': { schema: { type: 'integer' } },
            },
          },
        },
      },
    },
    '/api/public/v1/datasources': {
      get: {
        summary: 'List datasources',
        description: 'Returns datasources connected to the account, with status + last sync time.',
        tags: ['datasources'],
        operationId: 'listDatasources',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    datasources: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Datasource' },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Forbidden (IP / scope)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '429': {
            description: 'Rate limit exceeded',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/public/v1/dashboards': {
      get: {
        summary: 'List dashboards',
        description: 'Returns dashboards owned by the account, with widget counts and URLs.',
        tags: ['dashboards'],
        operationId: 'listDashboards',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    dashboards: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Dashboard' },
                    },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Forbidden (IP / scope)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/public/v1/queries': {
      post: {
        summary: 'Run a sandboxed SQL SELECT',
        description:
          'Executes a SELECT-only query against a datasource and returns the rows. ' +
          'Non-SELECT statements are rejected. `limit` caps the row count (default 100, max 1000).',
        tags: ['queries'],
        operationId: 'runQuery',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/QueryRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Query executed',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/QueryResponse' } },
            },
          },
          '400': {
            description: 'Only SELECT statements are permitted',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Unauthorized',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Forbidden (IP / scope — requires `execute`)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '422': {
            description: 'Validation failed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '429': {
            description: 'Rate limit exceeded',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
  tags: [
    { name: 'account', description: 'Account & key validation' },
    { name: 'datasources', description: 'Datasource listing' },
    { name: 'dashboards', description: 'Dashboard listing' },
    { name: 'queries', description: 'Query execution' },
  ],
} as const

export async function GET() {
  return NextResponse.json(SPEC, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  })
}
