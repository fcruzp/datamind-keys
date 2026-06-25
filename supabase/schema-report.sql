-- ============================================================================
-- BIweb Supabase Schema Report
-- Run this in the Supabase SQL Editor and paste the full output back.
-- It produces 5 sections: tables, columns, relationships, row counts,
-- and a focused check for tenant/datasource/dashboard concepts.
-- ============================================================================

-- ============================================================================
-- SECTION 1: All tables in the public schema with row counts
-- ============================================================================
SELECT
  t.table_name,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', t.table_schema, t.table_name)::regclass)) AS total_size,
  COALESCE(s.n_live_tup, 0) AS approx_row_count
FROM information_schema.tables t
LEFT JOIN pg_stat_user_tables s
  ON s.relname = t.table_name
 AND s.schemaname = t.table_schema
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;

-- ============================================================================
-- SECTION 2: All columns of all public tables (the "shape" of each table)
-- This is the most important section — tells me exactly what fields exist,
-- their types, nullability, and defaults.
-- ============================================================================
SELECT
  c.table_name,
  c.ordinal_position AS col_order,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.character_maximum_length AS char_len,
  c.numeric_precision AS num_prec,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;

-- ============================================================================
-- SECTION 3: Foreign key relationships (how tables connect to each other)
-- ============================================================================
SELECT
  tc.table_name AS child_table,
  kcu.column_name AS child_column,
  ccu.table_name AS parent_table,
  ccu.column_name AS parent_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- ============================================================================
-- SECTION 4: Primary keys + unique constraints (identifies the "identity"
-- columns and any natural keys)
-- ============================================================================
SELECT
  tc.table_name,
  tc.constraint_type,
  tc.constraint_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
GROUP BY tc.table_name, tc.constraint_type, tc.constraint_name
ORDER BY tc.table_name, tc.constraint_type;

-- ============================================================================
-- SECTION 5: Focused search for tenant / datasource / dashboard concepts
-- Looks for any table or column whose name contains keywords related to
-- multi-tenancy, datasources, dashboards, widgets, or queries.
-- ============================================================================
SELECT
  'TABLE' AS object_type,
  table_name AS object_name,
  '' AS column_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name ILIKE '%tenant%'
    OR table_name ILIKE '%datasource%'
    OR table_name ILIKE '%data_source%'
    OR table_name ILIKE '%connection%'
    OR table_name ILIKE '%dashboard%'
    OR table_name ILIKE '%widget%'
    OR table_name ILIKE '%query%'
    OR table_name ILIKE '%report%'
    OR table_name ILIKE '%chart%'
    OR table_name ILIKE '%dataset%')

UNION ALL

SELECT
  'COLUMN' AS object_type,
  table_name AS object_name,
  column_name AS column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name ILIKE '%tenant%'
    OR column_name ILIKE '%datasource%'
    OR column_name ILIKE '%data_source%'
    OR column_name ILIKE '%dashboard%'
    OR column_name ILIKE '%widget%'
    OR column_name ILIKE '%query%'
    OR column_name ILIKE '%owner%'
    OR column_name ILIKE '%created_by%'
    OR column_name ILIKE '%user_id%')
ORDER BY object_type, object_name, column_name;
