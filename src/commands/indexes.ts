import * as vscode from 'vscode';

import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import {
  MarkdownUtils,
  FormatHelpers,
  ErrorHandlers,
  SQL_TEMPLATES,
  ObjectUtils,
  getDatabaseConnection,
  NotebookBuilder,
  QueryBuilder
} from './helper';
import { IndexSQL } from './sql';

/**
 * Show index properties in a notebook
 */
export async function showIndexProperties(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { client, metadata } = dbConn;

    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const indexName = treeItem.label;

    // Get detailed index information
    const result = await client.query(`
            SELECT 
                i.relname as index_name,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary,
                ix.indisclustered as is_clustered,
                ix.indisvalid as is_valid,
                ix.indisready as is_ready,
                ix.indislive as is_live,
                am.amname as access_method,
                pg_size_pretty(pg_relation_size(i.oid)) as index_size,
                pg_relation_size(i.oid) as index_size_bytes,
                pg_get_indexdef(ix.indexrelid) as index_definition,
                obj_description(i.oid) as comment,
                t.reltuples::bigint as estimated_rows,
                string_agg(a.attname, ', ' ORDER BY array_position(ix.indkey, a.attnum)) as columns
            FROM pg_index ix
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            WHERE i.relname = $1
                AND n.nspname = $2
                AND t.relname = $3
            GROUP BY i.relname, ix.indisunique, ix.indisprimary, ix.indisclustered, ix.indisvalid,
                     ix.indisready, ix.indislive, am.amname, i.oid, ix.indexrelid, t.reltuples
        `, [indexName, schema, tableName]);

    if (result.rows.length === 0) {
      vscode.window.showErrorMessage('Index not found');
      return;
    }

    const idx = result.rows[0];

    // Get index statistics - combining pg_stat and pg_statio views
    const statsResult = await client.query(`
            SELECT 
                s.idx_scan as scans,
                s.idx_tup_read as tuples_read,
                s.idx_tup_fetch as tuples_fetched,
                COALESCE(io.idx_blks_hit, 0) as cache_hits,
                COALESCE(io.idx_blks_read, 0) as disk_reads,
                CASE 
                    WHEN (COALESCE(io.idx_blks_hit, 0) + COALESCE(io.idx_blks_read, 0)) = 0 THEN 0
                    ELSE ROUND(100.0 * io.idx_blks_hit / (io.idx_blks_hit + io.idx_blks_read), 2)
                END as cache_hit_ratio
            FROM pg_stat_user_indexes s
            LEFT JOIN pg_statio_user_indexes io 
                ON s.indexrelid = io.indexrelid
            WHERE s.indexrelname = $1
                AND s.schemaname = $2
                AND s.relname = $3
        `, [indexName, schema, tableName]);

    const stats = statsResult.rows[0] || {};

    // Build index type icon
    const typeIcon = ObjectUtils.getIndexIcon(idx.is_primary, idx.is_unique);

    const attributes = [];
    if (idx.is_primary) attributes.push('🔑 PRIMARY KEY');
    if (idx.is_unique && !idx.is_primary) attributes.push('⭐ UNIQUE');
    if (idx.is_clustered) attributes.push('📍 CLUSTERED');
    if (!idx.is_valid) attributes.push('⚠️ INVALID');
    if (!idx.is_ready) attributes.push('⏳ NOT READY');

    let markdown = MarkdownUtils.header(`${typeIcon} Index Properties: \`${indexName}\``) +
      MarkdownUtils.infoBox(`Index on table <strong>${schema}.${tableName}</strong>`) +
      '\n\n#### 📊 Index Statistics\n\n' +
      MarkdownUtils.propertiesTable({
        'Access Method': idx.access_method.toUpperCase(),
        'Size': idx.index_size,
        'Columns': idx.columns,
        'Scans': FormatHelpers.formatNumber(stats.scans || 0),
        'Tuples Read': FormatHelpers.formatNumber(stats.tuples_read || 0),
        'Tuples Fetched': FormatHelpers.formatNumber(stats.tuples_fetched || 0),
        'Cache Hit Ratio': FormatHelpers.formatPercentage(stats.cache_hit_ratio || 0),
        'Estimated Rows': FormatHelpers.formatNumber(idx.estimated_rows || 0)
      });

    if (attributes.length > 0) {
      markdown += '\n\n#### 🏷️ Attributes\n\n' + attributes.join(' | ');
    }

    if (idx.comment) {
      markdown += `\n\n#### 📝 Comment\n\n${idx.comment}`;
    }

    markdown += '\n\n---';

    await new NotebookBuilder(metadata)
      .addMarkdown(markdown)
      .addMarkdown('##### 📝 Index Definition')
      .addSql(`-- Index Definition\n${idx.index_definition};`)
      .addMarkdown('##### 📊 Detailed Statistics')
      .addSql(IndexSQL.detailedStatistics(schema, indexName))
      .show();

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show index properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Copy index name to clipboard
 */
export async function copyIndexName(treeItem: DatabaseTreeItem): Promise<void> {
  const indexName = treeItem.label;
  await vscode.env.clipboard.writeText(indexName);
  vscode.window.showInformationMessage(`Copied: ${indexName}`);
}

/**
 * Generate DROP INDEX script
 */
export async function generateDropIndexScript(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const indexName = treeItem.label.replace(/^[🔑⭐🔍]\s+/, '');

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🗑️ Drop Index: \`${indexName}\``) +
        MarkdownUtils.dangerBox('This will permanently remove the index. Query performance may be affected.') +
        MarkdownUtils.infoBox(`Schema: \`${schema}\``)
      )
      .addSql(`${SQL_TEMPLATES.DROP.INDEX(schema, indexName)}

-- Drop index concurrently (doesn't block writes)
-- DROP INDEX CONCURRENTLY "${schema}"."${indexName}";`)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate drop index script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate REINDEX script
 */
export async function generateReindexScript(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const indexName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔄 Reindex: \`${indexName}\``) +
        MarkdownUtils.warningBox('Reindexing will lock the table unless done concurrently.') +
        MarkdownUtils.infoBox(`Schema: \`${schema}\` | Table: \`${tableName}\``)
      )
      .addSql(IndexSQL.reindex(schema, indexName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate reindex script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate CREATE INDEX template script
 */
export async function generateCreateIndexScript(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header('📐 Create Index Templates') +
        MarkdownUtils.infoBox(`Schema: \`${schema}\` | Table: \`${tableName}\``) +
        MarkdownUtils.successBox('Choose the index type that best fits your query patterns.')
      )
      .addMarkdown('##### 📝 Basic B-tree Index')
      .addSql(IndexSQL.create.btree(schema, tableName, `idx_${tableName}_column_name`))
      .addMarkdown('##### ⭐ Unique Index')
      .addSql(IndexSQL.create.unique(schema, tableName, `idx_${tableName}_column_name_unique`))
      .addMarkdown('##### 🔍 Partial Index')
      .addSql(IndexSQL.create.partial(schema, tableName, `idx_${tableName}_column_name_partial`))
      .addMarkdown('##### 🔗 Composite Index')
      .addSql(IndexSQL.create.composite(schema, tableName, `idx_${tableName}_composite`))
      .addMarkdown('##### ⚡ Concurrent Index')
      .addSql(IndexSQL.create.concurrent(schema, tableName, `idx_${tableName}_concurrent`))
      .addMarkdown('##### 📦 GIN Index')
      .addSql(IndexSQL.create.gin(schema, tableName, `idx_${tableName}_gin`))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate create index script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Analyze index usage
 */
export async function analyzeIndexUsage(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const indexName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`📊 Index Usage Analysis: \`${indexName}\``) +
        MarkdownUtils.infoBox(`Schema: \`${schema}\` | Table: \`${tableName}\``)
      )
      .addSql(IndexSQL.usageAnalysis(schema, tableName, indexName))
      .addSql(IndexSQL.scanComparison(schema, tableName, indexName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'analyze index usage');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate ALTER INDEX script
 */
export async function generateAlterIndexScript(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const indexName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`✏️ Alter Index: \`${indexName}\``) +
        MarkdownUtils.infoBox(`Schema: \`${schema}\``)
      )
      .addMarkdown('##### 🔄 Rename Index')
      .addSql(IndexSQL.alter.rename(schema, indexName))
      .addMarkdown('##### 📁 Set Tablespace')
      .addSql(IndexSQL.alter.setTablespace(schema, indexName))
      .addMarkdown('##### ⚙️ Set Statistics')
      .addSql(IndexSQL.alter.setStatistics(schema, indexName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate alter index script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Add comment to index
 */
export async function addIndexComment(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const indexName = treeItem.label;

    const comment = await vscode.window.showInputBox({
      prompt: 'Enter comment for index',
      placeHolder: 'Index description...'
    });

    if (comment === undefined) return;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`💬 Add Comment: \`${indexName}\``) +
        MarkdownUtils.infoBox(`Schema: \`${schema}\``)
      )
      .addSql(`-- Add comment to index
COMMENT ON INDEX "${schema}"."${indexName}" IS '${FormatHelpers.escapeSqlString(comment)}';`)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'add index comment');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Alias for generateCreateIndexScript to match extension.ts import
 */
export { generateCreateIndexScript as generateScriptCreate };

/**
 * Show index operations notebook
 */
export async function cmdIndexOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const schema = item.schema!;
    const indexName = item.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔧 Index Operations: \`${indexName}\``) +
        MarkdownUtils.infoBox('This notebook provides common operations for managing your index. Each cell is a ready-to-execute template.') +
        `\n\n#### 🎯 Available Operations\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '🔍 <strong>Properties</strong>', description: 'View index definition and stats', riskLevel: '✅ Safe' },
          { operation: '📊 <strong>Analyze</strong>', description: 'Check usage statistics', riskLevel: '✅ Safe' },
          { operation: '🔄 <strong>Reindex</strong>', description: 'Rebuild the index', riskLevel: '⚠️ Locks Table' },
          { operation: '✏️ <strong>Alter</strong>', description: 'Rename or change settings', riskLevel: '⚠️ Modifies Schema' },
          { operation: '❌ <strong>Drop</strong>', description: 'Remove the index', riskLevel: '🔴 Destructive' }
        ]) + `\n---`
      )
      .addMarkdown('##### 🔍 Index Definition')
      .addSql(IndexSQL.definition(schema, indexName))
      .addMarkdown('##### 📊 Analyze Usage')
      .addSql(IndexSQL.statistics(schema, indexName))
      .addMarkdown('##### 🔄 Reindex')
      .addSql(IndexSQL.reindex(schema, indexName))
      .addMarkdown('##### ❌ Drop Index')
      .addSql(IndexSQL.drop(schema, indexName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show index operations');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Add new index to table - generates a comprehensive notebook with guidelines and SQL templates
 */
export async function cmdAddIndex(item: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const schema = item.schema!;
    const tableName = item.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`➕ Add New Index to \`${schema}.${tableName}\``) +
        MarkdownUtils.infoBox('Indexes improve query performance by providing fast lookup paths. Choose the right index type for your use case.') +
        `\n\n#### 📋 Index Types Overview\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '🔍 <strong>B-tree</strong>', description: 'Default. Best for equality and range queries (=, <, >, BETWEEN).' },
          { operation: '📚 <strong>Hash</strong>', description: 'Equality comparisons only (=). Faster for exact matches.' },
          { operation: '🔎 <strong>GiST</strong>', description: 'Generalized. Good for geometric, full-text, and range types.' },
          { operation: '📖 <strong>GIN</strong>', description: 'Inverted index. Best for arrays, JSONB, and full-text search.' },
          { operation: '🔤 <strong>BRIN</strong>', description: 'Block Range. Very efficient for large, naturally ordered tables.' }
        ]) +
        `\n\n#### ⚡ Best Practices\n\n` +
        MarkdownUtils.propertiesTable({
          'WHERE clauses': 'Index columns frequently used in WHERE conditions',
          'JOIN columns': 'Index foreign keys and join columns',
          'ORDER BY': 'Index columns used for sorting',
          'Partial Index': 'Use WHERE clause to index subset of rows',
          'Expression Index': 'Index computed expressions (e.g., LOWER(email))',
          'Concurrently': 'Use CONCURRENTLY to avoid locking in production'
        }) +
        MarkdownUtils.warningBox('Too many indexes slow down INSERT/UPDATE/DELETE. Only create indexes for frequent queries.') +
        `\n\n---`
      )
      .addMarkdown('##### 🔍 Basic B-tree Index (Most Common)')
      .addSql(`-- Create basic B-tree index
CREATE INDEX idx_${tableName}_column_name 
ON "${schema}"."${tableName}" (column_name);

-- Create index concurrently (doesn't block writes)
-- CREATE INDEX CONCURRENTLY idx_${tableName}_column_name 
-- ON "${schema}"."${tableName}" (column_name);`)
      .addMarkdown('##### ⭐ Unique Index')
      .addSql(`-- Create unique index (enforces uniqueness)
CREATE UNIQUE INDEX idx_${tableName}_unique_column 
ON "${schema}"."${tableName}" (column_name);

-- Unique index on multiple columns
-- CREATE UNIQUE INDEX idx_${tableName}_multi_unique 
-- ON "${schema}"."${tableName}" (col1, col2);`)
      .addMarkdown('##### 📊 Composite Index (Multiple Columns)')
      .addSql(`-- Composite index (column order matters!)
-- Place most selective columns first
CREATE INDEX idx_${tableName}_composite 
ON "${schema}"."${tableName}" (status, created_at, user_id);

-- Good for queries like:
-- WHERE status = 'active' AND created_at > '2024-01-01'`)
      .addMarkdown('##### 📍 Partial Index (WHERE clause)')
      .addSql(`-- Partial index - only indexes rows matching condition
-- Smaller and faster than full index
CREATE INDEX idx_${tableName}_active_only 
ON "${schema}"."${tableName}" (created_at)
WHERE status = 'active';

-- Index only non-null values
-- CREATE INDEX idx_${tableName}_not_null 
-- ON "${schema}"."${tableName}" (email)
-- WHERE email IS NOT NULL;`)
      .addMarkdown('##### 🔤 Expression Index')
      .addSql(`-- Index on expression (for case-insensitive search)
CREATE INDEX idx_${tableName}_lower_email 
ON "${schema}"."${tableName}" (LOWER(email));

-- Date extraction
-- CREATE INDEX idx_${tableName}_year 
-- ON "${schema}"."${tableName}" (EXTRACT(YEAR FROM created_at));`)
      .addMarkdown('##### 📖 GIN Index (for JSONB, Arrays, Full-Text)')
      .addSql(`-- GIN index for JSONB column
CREATE INDEX idx_${tableName}_jsonb_gin 
ON "${schema}"."${tableName}" USING GIN (data);

-- GIN index for JSONB with specific operators
-- CREATE INDEX idx_${tableName}_jsonb_path 
-- ON "${schema}"."${tableName}" USING GIN (data jsonb_path_ops);

-- For array columns
-- CREATE INDEX idx_${tableName}_tags 
-- ON "${schema}"."${tableName}" USING GIN (tags);`)
      .addMarkdown('##### 🔎 Full-Text Search Index')
      .addSql(`-- Full-text search index
CREATE INDEX idx_${tableName}_fts 
ON "${schema}"."${tableName}" 
USING GIN (to_tsvector('english', title || ' ' || description));

-- Usage: 
-- SELECT * FROM ${tableName} 
-- WHERE to_tsvector('english', title || ' ' || description) @@ to_tsquery('search_term');`)
      .addMarkdown('##### 🔤 BRIN Index (for large, ordered tables)')
      .addSql(`-- BRIN index - very compact, good for time-series data
-- Works best when data is naturally ordered by the indexed column
CREATE INDEX idx_${tableName}_brin 
ON "${schema}"."${tableName}" USING BRIN (created_at);`)
      .addMarkdown('##### 📈 Covering Index (INCLUDE columns)')
      .addSql(`-- Covering index with INCLUDE (PostgreSQL 11+)
-- Includes additional columns in the index for index-only scans
CREATE INDEX idx_${tableName}_covering 
ON "${schema}"."${tableName}" (user_id)
INCLUDE (username, email);

-- Useful for: SELECT username, email FROM ${tableName} WHERE user_id = 123;`)
      .addMarkdown(MarkdownUtils.successBox('After creating an index, use EXPLAIN ANALYZE to verify it is being used by your queries.'))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'add index');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}
