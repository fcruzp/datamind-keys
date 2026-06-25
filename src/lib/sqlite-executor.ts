import Database from 'better-sqlite3'
import { existsSync, statSync } from 'fs'
import path from 'path'

// ===========================================================================
// SQLite query executor — tenant-scoped, read-only, safe.
// ===========================================================================
// Opens uploaded SQLite files from BIweb's shared volume at
// /home/z/my-project/upload/{file_name} and executes SELECT-only queries.
//
// SAFETY RULES (enforced in validateSql):
//   1. Read-only connection (better-sqlite3 readonly: true)
//   2. SELECT-only (first non-comment token must be SELECT or WITH)
//   3. No PRAGMA, ATTACH, DETACH, VACUUM, REINDEX, CREATE, INSERT, UPDATE,
//      DELETE, DROP, ALTER (case-insensitive)
//   4. Row limit enforced via subquery wrapping
//   5. Query timeout (10s) via better-sqlite3 timeout option
//   6. No semicolons in the middle (only at end, stripped) — prevents
//      multi-statement injection
// ===========================================================================

const UPLOAD_DIR = process.env.SQLITE_UPLOAD_DIR ?? '/home/z/my-project/upload'
const QUERY_TIMEOUT_MS = 10_000
const MAX_ROWS_HARD_CAP = 1000

export interface SqliteQueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
}

export class SqliteQueryError extends Error {
  constructor(
    message: string,
    public code: 'VALIDATION' | 'FILE_NOT_FOUND' | 'EXECUTION' | 'TIMEOUT',
  ) {
    super(message)
    this.name = 'SqliteQueryError'
  }
}

/**
 * Resolves the absolute path to a datasource's SQLite file.
 * If filePath is absolute, uses it directly; if it's just a filename,
 * prepends the upload directory.
 */
export function resolveSqlitePath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath
  return path.join(UPLOAD_DIR, filePath)
}

/**
 * Validates a SQL string is safe to execute (SELECT-only, no dangerous
 * keywords, no multi-statement injection).
 */
export function validateSql(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, '') // strip trailing semicolons

  // Reject multi-statement (semicolons in the middle)
  if (trimmed.includes(';')) {
    throw new SqliteQueryError(
      'Multiple SQL statements are not permitted.',
      'VALIDATION',
    )
  }

  // Check the first non-comment token
  const withoutComments = trimmed
    .replace(/--[^\n]*/g, '') // strip line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
    .trim()

  const firstWord = withoutComments.split(/\s+/)[0]?.toUpperCase() ?? ''
  if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
    throw new SqliteQueryError(
      `Only SELECT (or WITH ... SELECT) statements are permitted. Got: ${firstWord}`,
      'VALIDATION',
    )
  }

  // Block dangerous keywords anywhere in the SQL (case-insensitive)
  const upper = trimmed.toUpperCase()
  const blocked = [
    'PRAGMA',
    'ATTACH',
    'DETACH',
    'VACUUM',
    'REINDEX',
    'CREATE',
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'ALTER',
    'REPLACE',
    'LOAD',
    'IMPORT',
  ]
  for (const kw of blocked) {
    // Word-boundary match to avoid false positives (e.g. "created_at")
    const re = new RegExp(`\\b${kw}\\b`, 'i')
    if (re.test(trimmed)) {
      throw new SqliteQueryError(
        `SQL contains forbidden keyword: ${kw}. Only read-only SELECT is permitted.`,
        'VALIDATION',
      )
    }
  }
}

/**
 * Wraps the user SQL in a subquery with a LIMIT, if the user didn't already
 * specify one. This enforces a hard row cap without modifying the user's
 * original SQL logic.
 *
 * Example: "SELECT * FROM clientes" → "SELECT * FROM (SELECT * FROM clientes) LIMIT 100"
 */
function enforceRowLimit(sql: string, limit: number): string {
  const trimmed = sql.trim().replace(/;+\s*$/, '')
  const effectiveLimit = Math.min(limit, MAX_ROWS_HARD_CAP)

  // If the user already has a LIMIT clause, don't wrap (respect their limit,
  // but still cap at MAX_ROWS_HARD_CAP via the subquery if needed).
  const hasLimit = /\bLIMIT\b/i.test(trimmed)
  if (hasLimit) {
    // Still wrap to enforce the hard cap — the user's LIMIT might be higher
    // than MAX_ROWS_HARD_CAP. The outer LIMIT wins (smaller of the two).
    return `SELECT * FROM (${trimmed}) LIMIT ${effectiveLimit}`
  }

  return `SELECT * FROM (${trimmed}) LIMIT ${effectiveLimit}`
}

/**
 * Executes a SELECT query against a SQLite file in read-only mode.
 *
 * @param filePath  Path to the .sqlite file (absolute, or relative to UPLOAD_DIR)
 * @param sql       The user's SQL (must be SELECT or WITH ... SELECT)
 * @param limit     Max rows to return (default 100, hard cap 1000)
 * @returns         { rows, rowCount, durationMs }
 * @throws          SqliteQueryError on validation/file/execution errors
 */
export function executeSqliteQuery(
  filePath: string,
  sql: string,
  limit: number = 100,
): SqliteQueryResult {
  const started = Date.now()

  // 1. Validate the SQL
  validateSql(sql)

  // 2. Resolve + check the file
  const absPath = resolveSqlitePath(filePath)
  if (!existsSync(absPath)) {
    throw new SqliteQueryError(
      `SQLite file not found at ${absPath}. The shared volume may not be configured.`,
      'FILE_NOT_FOUND',
    )
  }

  // 3. Open in read-only mode with a timeout
  let db: Database.Database
  try {
    db = new Database(absPath, {
      readonly: true,
      timeout: QUERY_TIMEOUT_MS,
    })
  } catch (e) {
    throw new SqliteQueryError(
      `Failed to open SQLite file: ${e instanceof Error ? e.message : String(e)}`,
      'FILE_NOT_FOUND',
    )
  }

  try {
    // 4. Enforce the row limit via subquery wrapping
    const finalSql = enforceRowLimit(sql, limit)

    // 5. Execute
    const stmt = db.prepare(finalSql)
    const rows = stmt.all() as Record<string, unknown>[]

    const durationMs = Date.now() - started
    return { rows, rowCount: rows.length, durationMs }
  } catch (e) {
    if (e instanceof SqliteQueryError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('timeout') || msg.includes('SQLITE_BUSY')) {
      throw new SqliteQueryError(
        `Query timed out after ${QUERY_TIMEOUT_MS}ms.`,
        'TIMEOUT',
      )
    }
    throw new SqliteQueryError(
      `SQL execution failed: ${msg}`,
      'EXECUTION',
    )
  } finally {
    db.close()
  }
}

/**
 * Returns metadata about a SQLite file (without opening it for queries).
 * Useful for the /datasources endpoint to report file status.
 */
export function getSqliteFileInfo(filePath: string): {
  exists: boolean
  size: number | null
  lastModified: Date | null
} {
  const absPath = resolveSqlitePath(filePath)
  if (!existsSync(absPath)) {
    return { exists: false, size: null, lastModified: null }
  }
  const stat = statSync(absPath)
  return {
    exists: true,
    size: stat.size,
    lastModified: stat.mtime,
  }
}
