/**
 * SQL Templates for Table Operations
 */

export const TableSQL = {
  /**
   * SELECT statement
   */
  select: (schema: string, table: string, limit: number = 100) =>
    `SELECT * FROM ${schema}.${table} LIMIT ${limit};`,

  /**
   * DELETE statement template
   */
  delete: (schema: string, table: string) =>
    `-- Delete rows
DELETE FROM ${schema}.${table}
WHERE condition; -- e.g., id = 1

-- Delete with RETURNING
/*
DELETE FROM ${schema}.${table}
WHERE condition
RETURNING *;
*/`,

  /**
   * UPDATE statement template
   */
  update: (schema: string, table: string, whereClause: string) =>
    `-- Update data
UPDATE ${schema}.${table}
SET
    -- List columns to update:
    column_name = new_value
${whereClause}
RETURNING *;`,

  /**
   * INSERT statement template
   */
  insert: (schema: string, table: string, columns: string[], placeholders: string[]) =>
    `-- Insert single row
INSERT INTO ${schema}.${table} (
    ${columns.join(',\n    ')}
)
VALUES (
    ${placeholders.join(',\n    ')}
)
RETURNING *;

-- Insert multiple rows (example)
/*
INSERT INTO ${schema}.${table} (
    ${columns.join(',\n    ')}
)
VALUES
    (${placeholders.join(', ')}),
    (${placeholders.join(', ')})
RETURNING *;
*/`,

  /**
   * TRUNCATE statement
   */
  truncate: (schema: string, table: string) =>
    `-- Truncate table
TRUNCATE TABLE ${schema}.${table};`,

  /**
   * DROP TABLE statement
   */
  drop: (schema: string, table: string) =>
    `-- Drop table
DROP TABLE ${schema}.${table};`,

  /**
   * VACUUM statement with options
   */
  vacuum: (schema: string, table: string) =>
    `VACUUM (VERBOSE, ANALYZE) ${schema}.${table};`,

  /**
   * ANALYZE statement
   */
  analyze: (schema: string, table: string) =>
    `ANALYZE VERBOSE ${schema}.${table};`,

  /**
   * REINDEX statement
   */
  reindex: (schema: string, table: string) =>
    `REINDEX TABLE ${schema}.${table};`,

  /**
   * Table bloat and statistics query
   */
  bloatStats: (schema: string, table: string) =>
    `-- Table bloat and statistics
SELECT 
    schemaname,
    relname,
    n_live_tup,
    n_dead_tup,
    ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_tuple_percent,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = '${schema}' AND relname = '${table}';

-- Column statistics
SELECT 
    attname as column_name,
    n_distinct,
    ROUND((null_frac * 100)::numeric, 2) as null_percentage,
    avg_width,
    correlation
FROM pg_stats
WHERE schemaname = '${schema}' AND tablename = '${table}'
ORDER BY attname;`,

  /**
   * Table operations notebook templates
   */
  operations: {
    queryData: (schema: string, table: string) =>
      `-- Query data
SELECT *
FROM ${schema}.${table}
LIMIT 100;`,

    insertData: (schema: string, table: string) =>
      `-- Insert data
INSERT INTO ${schema}.${table} (
    -- List columns here
)
VALUES (
    -- List values here
);`,

    updateData: (schema: string, table: string) =>
      `-- Update data
UPDATE ${schema}.${table}
SET column_name = new_value
WHERE condition;`,

    deleteData: (schema: string, table: string) =>
      `-- Delete data
DELETE FROM ${schema}.${table}
WHERE condition;`,

    truncateData: (schema: string, table: string) =>
      `-- Truncate table (remove all data)
TRUNCATE TABLE ${schema}.${table};`,

    dropTable: (schema: string, table: string) =>
      `-- Drop table
DROP TABLE ${schema}.${table};`
  },

  /**
   * DROP TABLE with options
   */
  dropWithOptions: (schema: string, table: string) =>
    `-- Drop table (with dependencies)
DROP TABLE IF EXISTS ${schema}.${table} CASCADE;

-- Drop table (without dependencies - will fail if referenced)
-- DROP TABLE IF EXISTS ${schema}.${table} RESTRICT;`,

  /**
   * Build Create Table Definition Body
   */
  buildCreateDefinition: (columns: any[], constraints: any[]) => {
    const columnDefs = columns.map(col => {
      let def = `    ${col.column_name} ${col.data_type}`;
      if (col.character_maximum_length) def += `(${col.character_maximum_length})`;
      else if (col.numeric_precision) def += `(${col.numeric_precision}${col.numeric_scale ? ',' + col.numeric_scale : ''})`;

      if (col.is_nullable === 'NO') def += ' NOT NULL';
      if (col.column_default) def += ` DEFAULT ${col.column_default}`;
      return def;
    }).join(',\n');

    const constraintDefs = constraints.map(c => `    CONSTRAINT ${c.constraint_name} ${c.definition}`).join(',\n');

    return `(\n${columnDefs}${constraintDefs ? ',\n' + constraintDefs : ''}\n);`;
  }
};
