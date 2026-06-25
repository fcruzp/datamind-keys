/**
 * ============================================================================
 * WORKFLOW: DataMind BI — Public API End-to-End Test
 * STEP 1 (and only step): Exercise every /api/public/v1/* endpoint
 * ============================================================================
 *
 * PURPOSE:
 * Validates that an API key issued from the DataMind BI Portal works
 * end-to-end against all 4 public REST endpoints. This is the "real test"
 * before wiring DataMind BI into an OpenFN production workflow.
 *
 * ENDPOINTS TESTED (in order):
 *   1. GET  /api/public/v1/me           → scope: read    → key validation
 *   2. GET  /api/public/v1/datasources   → scope: read    → list DB connections
 *   3. GET  /api/public/v1/dashboards    → scope: read    → list dashboards
 *   4. POST /api/public/v1/queries       → scope: execute → run sandboxed SELECT
 *
 * SECURITY APPROACH:
 * Authentication uses Bearer Token (RFC 6750) in the Authorization header.
 * The token is stored in OpenFn Credentials and accessed via
 * state.configuration.token — it NEVER appears in Job code, logs, or
 * version control. The HTTP adaptor injects it automatically as:
 *   Authorization: Bearer <token>
 *
 * OPENFN PATTERN (CRITICAL):
 * We declare get() and post() at the TOP LEVEL — NOT wrapped inside fn().
 * Per @openfn/language-http v7.x known behavior, wrapping HTTP operations
 * inside fn() causes the Authorization header (and any credential-based
 * headers) to be SILENTLY IGNORED. Top-level declarations resolve the
 * credential correctly.
 *
 * Between HTTP calls we use fn() only to snapshot state.data into a named
 * field (state.me, state.datasources, …) so the next get()/post() doesn't
 * overwrite it. This preserves all 4 responses for the final summary.
 *
 * ADAPTOR: @openfn/language-http
 * CREDENTIAL: DataMind BI API
 *   - baseUrl: https://datamind-api.mooo.com
 *   - token:   dm_live_••••  (your key from the Portal → API Keys page)
 *
 * EXPECTED RESULT:
 * The final fn() prints a summary like:
 *   ✓ Key valid for: Francisco Cruz (fcruzp@gmail.com)
 *   ✓ Datasources: 3 (Production Postgres, BigQuery Analytics, Legacy MySQL)
 *   ✓ Dashboards: 4 (Revenue Overview, Product Engagement, Support Ops, …)
 *   ✓ Query returned 3 rows in <N>ms
 *
 * TROUBLESHOOTING:
 *   401 Unauthorized        → token is wrong/expired/revoked
 *   403 Forbidden (scope)   → key lacks `execute` scope (only POST /queries needs it)
 *   429 Too Many Requests   → hit the 60 req/min default rate limit
 * ============================================================================
 */

// ============================================================================
// STEP 1: GET /api/public/v1/me — validate the key + show who owns it
// ============================================================================
// Returns: { ok, user:{id,email,name,role}, apiKey:{id,label,scopes,prefix},
//            account:{activeKeys,totalApiRequests}, server:{time,durationMs} }
get('/api/public/v1/me');

fn(state => {
  // get() wrote its response body into state.data. Move it to state.me
  // so the next get() (datasources) doesn't overwrite it.
  state.me = state.data;

  if (!state.me || !state.me.ok) {
    console.error('✗ /me did not return ok. Full response:');
    console.error(JSON.stringify(state.me, null, 2));
    throw new Error('API key validation failed — check token + baseUrl');
  }

  console.log('✓ Key valid for: ' +
    state.me.user.name + ' (' + state.me.user.email + ')');
  console.log('  Key label: ' + state.me.apiKey.label);
  console.log('  Scopes:    ' + state.me.apiKey.scopes.join(', '));
  console.log('  Active keys on account: ' + state.me.account.activeKeys);
  console.log('  Total API requests:     ' + state.me.account.totalApiRequests);
  return state;
});

// ============================================================================
// STEP 2: GET /api/public/v1/datasources — list connected databases
// ============================================================================
// Returns: { ok, count, datasources:[{id,name,type,host,port,database,
//            status,lastSyncAt}, …] }
get('/api/public/v1/datasources');

fn(state => {
  state.datasources = state.data;

  if (!state.datasources || !state.datasources.ok) {
    console.error('✗ /datasources did not return ok:');
    console.error(JSON.stringify(state.datasources, null, 2));
    return state; // keep going so we still test dashboards + queries
  }

  console.log('✓ Datasources: ' + state.datasources.count);
  state.datasources.datasources.forEach(ds => {
    console.log('  • ' + ds.name + ' (' + ds.type + ') — ' + ds.status);
  });
  return state;
});

// ============================================================================
// STEP 3: GET /api/public/v1/dashboards — list dashboards + widget counts
// ============================================================================
// Returns: { ok, count, dashboards:[{id,name,description,widgets,
//            lastEditedAt,url}, …] }
get('/api/public/v1/dashboards');

fn(state => {
  state.dashboards = state.data;

  if (!state.dashboards || !state.dashboards.ok) {
    console.error('✗ /dashboards did not return ok:');
    console.error(JSON.stringify(state.dashboards, null, 2));
    return state;
  }

  console.log('✓ Dashboards: ' + state.dashboards.count);
  state.dashboards.dashboards.forEach(d => {
    console.log('  • ' + d.name + ' — ' + d.widgets + ' widgets — ' + d.url);
  });
  return state;
});

// ============================================================================
// STEP 4: POST /api/public/v1/queries — run a sandboxed SQL SELECT
// ============================================================================
// Requires `execute` scope (the 3 GETs only need `read`).
// Body: { sql: 'SELECT …', datasourceId?: 'demo', limit?: 100 }
// Returns: { ok, sql, datasourceId, rowCount, durationMs,
//            rows:[{id,label,value,generated_at}, …] }
//
// OPENFN PATTERN — WHY request() INSTEAD OF post():
// Per the user's working POST example: post() at top-level correctly
// propagates the Credential token, but the body handling in
// @openfn/language-http v7.3.1 is buggy — the server receives valid JSON
// but with no top-level `sql` field → 422 "expected string, received
// undefined".
//
// request() inside fn(async …) is the recommended alternative for POST:
//   1. It still injects the Credential's Bearer token automatically (no
//      manual Authorization header needed)
//   2. It accepts body as a plain OBJECT (no JSON.stringify needed — the
//      adaptor serializes it correctly when using request())
//   3. It gives try/catch control so we can handle non-2xx responses
//      gracefully (post() throws un-catchably at top level)
//
// NOTE: request() returns a function (state) => Promise<state>, so we
// await request(...)(state). The response body lands in state.data.
fn(async (state) => {
  try {
    // request() returns a function (state) => Promise<state>. The resolved
    // value is the NEW state object with state.data populated by the
    // response body. We MUST capture the return value — reading the old
    // `state` after the await gives stale data (state.data is undefined).
    const nextState = await request('POST', '/api/public/v1/queries', {
      body: {
        sql: 'SELECT 1 AS one',
        datasourceId: 'demo',
        limit: 3,
      },
      headers: {
        'content-type': 'application/json',
      },
    })(state);

    // The response body is in nextState.data (not state.data).
    state.queryResult = nextState.data;

    if (!state.queryResult || !state.queryResult.ok) {
      console.error('✗ /queries did not return ok:');
      console.error(JSON.stringify(state.queryResult, null, 2));
      return state;
    }

    console.log('✓ Query returned ' + state.queryResult.rowCount +
      ' rows in ' + state.queryResult.durationMs + 'ms');
    console.log('  SQL: ' + state.queryResult.sql);
    console.log('  First row: ' + JSON.stringify(state.queryResult.rows[0]));
    return state;

  } catch (error) {
    // request() throws on non-2xx responses. error.statusCode is the
    // HTTP status (per @openfn/language-http v7.x error structure).
    console.error('✗ /queries failed: HTTP ' + error.statusCode);
    console.error('  ' + error.message);
    if (error.statusCode === 403) {
      console.error('  (Does your key have the `execute` scope? Edit the');
      console.error('   key in Portal → API Keys → Edit → add `execute`.)');
    }
    throw error;
  }
});

// ============================================================================
// FINAL SUMMARY — collect everything for downstream jobs
// ============================================================================
fn(state => {
  const summary = {
    testedAt: new Date().toISOString(),
    keyOwner: state.me?.user?.email ?? 'unknown',
    keyLabel: state.me?.apiKey?.label ?? 'unknown',
    keyScopes: state.me?.apiKey?.scopes ?? [],
    endpoints: {
      me:          state.me?.ok === true,
      datasources: state.datasources?.ok === true,
      dashboards:  state.dashboards?.ok === true,
      queries:     state.queryResult?.ok === true,
    },
    counts: {
      datasources: state.datasources?.count ?? 0,
      dashboards:  state.dashboards?.count ?? 0,
      queryRows:   state.queryResult?.rowCount ?? 0,
    },
  };

  const passed = Object.values(summary.endpoints).filter(Boolean).length;
  console.log('');
  console.log('════════════════════════════════════════════');
  console.log('  DataMind BI API test: ' + passed + '/4 endpoints OK');
  console.log('════════════════════════════════════════════');
  console.log(JSON.stringify(summary, null, 2));

  // Expose the summary for any downstream job in this workflow.
  state.summary = summary;
  return state;
});
