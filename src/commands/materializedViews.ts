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
import { MaterializedViewSQL } from './sql';



export async function cmdRefreshMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔄 Refresh Materialized View: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.infoBox('Execute the cell below to refresh the materialized view data.')
      )
      .addMarkdown('##### 🔄 Refresh Command')
      .addSql(MaterializedViewSQL.refresh(item.schema!, item.label))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create refresh materialized view notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function cmdEditMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;

    try {
      const result = await client.query(QueryBuilder.matViewDefinition(item.schema!, item.label));
      if (!result.rows[0]?.definition) {
        throw new Error('Materialized view definition not found');
      }

      const viewDef = (result.rows[0].definition || '').replace(/;\s*$/, '');
      const createMatViewStatement = `CREATE MATERIALIZED VIEW ${item.schema}.${item.label} AS\n${viewDef}\nWITH DATA;`;

      await new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`✏️ Edit Materialized View: \`${item.schema}.${item.label}\``) +
          MarkdownUtils.infoBox('Modify the materialized view definition below and execute the cell to update it.') +
          MarkdownUtils.warningBox('This will drop and recreate the materialized view.')
        )
        .addMarkdown('##### 📝 View Definition')
        .addSql(`DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};\n\n${createMatViewStatement}\nWITH DATA;`)
        .show();
    } finally {
      // Connection is managed by ConnectionManager
    }
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create materialized view edit notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function cmdViewMatViewData(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`📖 View Data: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.infoBox('Modify the query below to filter or transform the data as needed.')
      )
      .addMarkdown('##### 📖 Query Data')
      .addSql(MaterializedViewSQL.queryData(item.schema!, item.label))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create view data notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function cmdViewMatViewProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;

    try {
      // Gather comprehensive materialized view information
      const [matviewInfo, columnInfo, indexInfo, dependenciesInfo, referencedInfo, statsInfo] = await Promise.all([
        client.query(QueryBuilder.matViewInfo(item.schema!, item.label)),
        client.query(QueryBuilder.tableColumns(item.schema!, item.label)),
        client.query(QueryBuilder.tableIndexes(item.schema!, item.label)),
        client.query(QueryBuilder.objectDependencies(item.schema!, item.label)),
        client.query(QueryBuilder.objectReferences(item.schema!, item.label)),
        client.query(QueryBuilder.matViewStats(item.schema!, item.label))
      ]);

      if (matviewInfo.rows.length === 0) {
        throw new Error('Materialized view not found');
      }

      const matview = matviewInfo.rows[0];
      const columns = columnInfo.rows;
      const indexes = indexInfo.rows;
      const dependents = dependenciesInfo.rows;
      const references = referencedInfo.rows;
      const stats = statsInfo.rows[0] || {};

      // Get definition
      const viewDefResult = await client.query(QueryBuilder.matViewDefinition(item.schema!, item.label));
      const viewDefinition = (viewDefResult.rows[0]?.definition || '').replace(/;\s*$/, '');

      // Build column table HTML
      const columnRows = columns.map((col: any) => {
        const dataType = col.character_maximum_length
          ? `${col.data_type}(${col.character_maximum_length})`
          : col.numeric_precision
            ? `${col.data_type}(${col.numeric_precision}${col.numeric_scale ? ',' + col.numeric_scale : ''})`
            : col.data_type;
        return `    <tr>
        <td>${col.ordinal_position}</td>
        <td><strong>${col.column_name}</strong></td>
        <td><code>${dataType}</code></td>
        <td>${FormatHelpers.formatBoolean(col.is_nullable === 'YES')}</td>
        <td>${col.default_value ? `<code>${col.default_value}</code>` : '—'}</td>
        <td>${col.description || '—'}</td>
    </tr>`;
      }).join('\n');

      // Build indexes table HTML
      const indexRows = indexes.map((idx: any) => {
        const badges = [];
        if (idx.is_primary) badges.push('🔑 PRIMARY');
        if (idx.is_unique) badges.push('⭐ UNIQUE');
        return `    <tr>
        <td><strong>${idx.index_name}</strong>${badges.length > 0 ? ` <span style="font-size: 9px;">${badges.join(' ')}</span>` : ''}</td>
        <td>${idx.columns || ''}</td>
        <td>${idx.index_size}</td>
    </tr>`;
      }).join('\n');

      // Build dependencies table HTML
      const dependencyRows = dependents.map((dep: any) => {
        return `    <tr>
        <td>${ObjectUtils.getKindLabel(dep.kind)}</td>
        <td><code>${dep.schema}.${dep.name}</code></td>
    </tr>`;
      }).join('\n');

      // Build references table HTML
      const referenceRows = references.map((ref: any) => {
        return `    <tr>
        <td>${ObjectUtils.getKindLabel(ref.kind)}</td>
        <td><code>${ref.schema}.${ref.name}</code></td>
    </tr>`;
      }).join('\n');

      const ownerInfo = `${matview.owner} | <strong>Populated:</strong> ${FormatHelpers.formatBoolean(matview.ispopulated, 'Yes', 'No')}${matview.comment ? ` | <strong>Comment:</strong> ${matview.comment}` : ''}`;

      await new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`💾 Materialized View Properties: \`${item.schema}.${item.label}\``) +
          MarkdownUtils.infoBox(`<strong>Owner:</strong> ${ownerInfo}`) +
          `\n\n#### 📊 General Information\n\n` +
          MarkdownUtils.propertiesTable({
            'Schema': matview.schema_name,
            'Name': matview.matview_name,
            'Owner': matview.owner,
            'Is Populated': FormatHelpers.formatBoolean(matview.ispopulated, 'Yes', 'No'),
            'Total Size': matview.total_size,
            'Table Size': matview.table_size,
            'Indexes Size': matview.indexes_size,
            'Row Estimate': matview.row_estimate?.toLocaleString() || 'N/A',
            'Live Tuples': stats.live_tuples?.toLocaleString() || 'N/A',
            'Dead Tuples': stats.dead_tuples?.toLocaleString() || 'N/A'
          }) +
          `\n\n#### 📋 Columns (${columns.length})\n\n` +
          `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 5%;">#</th>
        <th style="text-align: left; width: 20%;">Name</th>
        <th style="text-align: left; width: 20%;">Data Type</th>
        <th style="text-align: left; width: 10%;">Nullable</th>
        <th style="text-align: left; width: 20%;">Default</th>
        <th style="text-align: left;">Description</th>
    </tr>
${columnRows}
</table>

` +
          (indexes.length > 0 ? `#### 🔍 Indexes (${indexes.length})

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 35%;">Index Name</th>
        <th style="text-align: left; width: 40%;">Columns</th>
        <th style="text-align: left;">Size</th>
    </tr>
${indexRows}
</table>

` : '') +
          (references.length > 0 ? `#### 🔗 Referenced Objects (${references.length})

${MarkdownUtils.infoBox('Objects that this materialized view depends on:', 'Info')}

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 20%;">Type</th>
        <th style="text-align: left;">Object</th>
    </tr>
${referenceRows}
</table>

` : '') +
          (dependents.length > 0 ? `#### 🔄 Dependent Objects (${dependents.length})

${MarkdownUtils.infoBox('Objects that depend on this materialized view:', 'Info')}

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 20%;">Type</th>
        <th style="text-align: left;">Object</th>
    </tr>
${dependencyRows}
</table>

` : '') +
          '---'
        )
        .addMarkdown('##### 📝 CREATE MATERIALIZED VIEW Script')
        .addSql(`-- DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};\n\nCREATE MATERIALIZED VIEW ${item.schema}.${item.label} AS\n${viewDefinition}\nWITH DATA;\n\n-- Materialized view comment\n${matview.comment ? `COMMENT ON MATERIALIZED VIEW ${item.schema}.${item.label} IS '${matview.comment.replace(/'/g, "''")}';` : `-- COMMENT ON MATERIALIZED VIEW ${item.schema}.${item.label} IS 'view description';`}\n\n-- Indexes\n${indexes.map((idx: any) => idx.definition).join('\n')}`)
        .addMarkdown('##### 🔄 Refresh Materialized View')
        .addSql(`-- Refresh materialized view (blocking)\nREFRESH MATERIALIZED VIEW ${item.schema}.${item.label};\n\n-- Refresh materialized view (concurrent, allows reads during refresh)\n-- REFRESH MATERIALIZED VIEW CONCURRENTLY ${item.schema}.${item.label};`)
        .addMarkdown('##### 🗑️ DROP Materialized View Script')
        .addSql(`${SQL_TEMPLATES.DROP.MATERIALIZED_VIEW(item.schema!, item.label)}\n\n-- Drop materialized view (with dependencies)\n-- DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label} CASCADE;\n\n-- Drop materialized view (without dependencies - will fail if referenced)\n-- DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label} RESTRICT;`)
        .addMarkdown('##### 🔍 Query Materialized View Data')
        .addSql(`-- Query materialized view data\nSELECT * FROM ${item.schema}.${item.label}\nLIMIT 100;`)
        .addMarkdown('##### 📊 Statistics and Metadata')
        .addSql(`-- Get detailed statistics\nSELECT \n    schemaname,\n    matviewname,\n    matviewowner,\n    tablespace,\n    hasindexes,\n    ispopulated,\n    pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as total_size\nFROM pg_matviews\nWHERE schemaname = '${item.schema}' AND matviewname = '${item.label}';\n\n-- Check when it was last refreshed\nSELECT \n    schemaname,\n    relname,\n    last_vacuum,\n    last_autovacuum,\n    last_analyze,\n    last_autoanalyze,\n    n_live_tup,\n    n_dead_tup\nFROM pg_stat_user_tables\nWHERE schemaname = '${item.schema}' AND relname = '${item.label}';`)
        .show();
    } finally {
      // Do not close shared client
    }
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show materialized view properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function cmdDropMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`❌ Drop Materialized View: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.dangerBox('This action will permanently delete the materialized view. This operation cannot be undone.')
      )
      .addMarkdown('##### ❌ Drop Command')
      .addSql(SQL_TEMPLATES.DROP.MATERIALIZED_VIEW(item.schema!, item.label))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create drop materialized view notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function cmdMatViewOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔄 Materialized View Operations: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.infoBox('Materialized views store query results as physical tables that need periodic refreshing. They provide faster query performance at the cost of data freshness.') +
        `\n\n#### 📋 Common Operations\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '🔄 Refresh', description: 'Updates the materialized view with fresh data from underlying tables. Locks the view during refresh.', riskLevel: 'Standard data refresh' },
          { operation: '⚡ Concurrent Refresh', description: 'Refreshes without locking (requires unique index). Allows reads during refresh.', riskLevel: 'High-availability scenarios' },
          { operation: '🔍 Create Index', description: 'Adds indexes to improve query performance on the materialized view.', riskLevel: 'Query optimization' },
          { operation: '📊 Analyze', description: 'Updates statistics for the query planner to optimize query execution.', riskLevel: 'After large refreshes' },
          { operation: '🔍 Query Data', description: 'Query the materialized view data like a regular table.', riskLevel: 'Data analysis' },
          { operation: '📈 Check Freshness', description: 'View when the materialized view was last refreshed.', riskLevel: 'Monitoring data staleness' }
        ])
      )
      .addMarkdown(`##### 🔄 Standard Refresh\n\n${MarkdownUtils.warningBox('This operation locks the materialized view and prevents reads during refresh.')}`)
      .addSql(MaterializedViewSQL.refreshWithOptions(item.schema!, item.label))
      .addMarkdown(`##### ⚡ Concurrent Refresh\n\n${MarkdownUtils.infoBox('Requires a unique index. Allows queries during refresh but is slower than standard refresh.', 'Note')}`)
      .addSql(MaterializedViewSQL.refreshConcurrently(item.schema!, item.label))
      .addMarkdown(`##### 🔍 Create Indexes\n\n${MarkdownUtils.successBox('Indexes on materialized views improve query performance, just like on regular tables.')}`)
      .addSql(MaterializedViewSQL.createIndexes(item.schema!, item.label))
      .addMarkdown('##### 📊 Update Statistics')
      .addSql(MaterializedViewSQL.analyze(item.schema!, item.label))
      .addMarkdown('##### 🔍 Query Data')
      .addSql(`-- Query materialized view data\nSELECT * FROM ${item.schema}.${item.label}\nLIMIT 100;\n\n-- Count rows\nSELECT COUNT(*) as row_count\nFROM ${item.schema}.${item.label};\n\n-- Get column statistics\nSELECT column_name, data_type, is_nullable\nFROM information_schema.columns\nWHERE table_schema = '${item.schema}' \n  AND table_name = '${item.label}'\nORDER BY ordinal_position;`)
      .addMarkdown('##### 📈 Monitor Freshness and Performance')
      .addSql(MaterializedViewSQL.monitorFreshness(item.schema!, item.label))
      .addMarkdown('##### 🔧 Advanced Operations')
      .addSql(MaterializedViewSQL.advancedOperations(item.schema!, item.label))
      .addMarkdown(`##### 📚 Best Practices\n\n${MarkdownUtils.infoBox(`<strong>✨ Refresh Strategy:</strong><br/>• Use <code>REFRESH MATERIALIZED VIEW CONCURRENTLY</code> for high-availability scenarios (requires unique index)<br/>• Schedule regular refreshes based on data freshness requirements<br/>• Run <code>ANALYZE</code> after large refreshes to update statistics<br/>• Monitor materialized view size and query performance<br/>• Consider partitioning for very large materialized views`, 'Best Practices')}`)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show materialized view operations');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdCreateMaterializedView - Command to create a new materialized view in the database.
 */
export async function cmdCreateMaterializedView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    const schema = item.schema!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`➕ Create New Materialized View in Schema: \`${schema}\``) +
        MarkdownUtils.infoBox('This notebook provides templates for creating materialized views. Modify the templates below and execute to create materialized views.') +
        `\n\n#### 📋 Materialized View Design Guidelines\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '<strong>Naming</strong>', description: 'Use snake_case for materialized view names (e.g., sales_summary, user_statistics)' },
          { operation: '<strong>Purpose</strong>', description: 'Store pre-computed query results for faster access to expensive queries' },
          { operation: '<strong>Refresh Strategy</strong>', description: 'Plan regular refreshes based on data freshness requirements' },
          { operation: '<strong>Indexes</strong>', description: 'Create unique indexes to enable CONCURRENT refresh' },
          { operation: '<strong>Performance</strong>', description: 'Trade data freshness for query speed - data is stored physically' }
        ]) +
        `\n\n#### 🏷️ Materialized View vs Regular View\n\n` +
        MarkdownUtils.propertiesTable({
          'Regular View': 'Virtual - queries underlying tables each time',
          'Materialized View': 'Physical - stores data, requires refresh',
          'Query Speed': 'Regular: Slower | Materialized: Faster',
          'Data Freshness': 'Regular: Always current | Materialized: Stale until refresh',
          'Storage': 'Regular: None | Materialized: Uses disk space',
          'Refresh': 'Regular: Automatic | Materialized: Manual or scheduled'
        }) +
        MarkdownUtils.successBox('Use materialized views for expensive aggregations, complex joins, or frequently accessed query results. Create a unique index to enable CONCURRENT refresh.') +
        `\n\n---`
      )
      .addMarkdown('##### 📝 Basic Materialized View (Recommended Start)')
      .addSql(MaterializedViewSQL.create.basic(schema))
      .addMarkdown('##### 📊 Aggregated Materialized View')
      .addSql(MaterializedViewSQL.create.aggregated(schema))
      .addMarkdown('##### 🔄 Materialized View with Refresh Strategy')
      .addSql(`-- Create materialized view with refresh setup\nCREATE MATERIALIZED VIEW ${schema}.daily_stats AS\nSELECT \n    DATE(created_at) as stat_date,\n    COUNT(*) as total_records,\n    COUNT(DISTINCT user_id) as unique_users\nFROM ${schema}.events\nGROUP BY DATE(created_at)\nWITH DATA;\n\n-- Unique index for concurrent refresh\nCREATE UNIQUE INDEX idx_daily_stats_date ON ${schema}.daily_stats (stat_date);\n\n-- Schedule refresh (example using pg_cron extension)\n-- SELECT cron.schedule('refresh-daily-stats', '0 2 * * *', \n--     'REFRESH MATERIALIZED VIEW CONCURRENTLY ${schema}.daily_stats');`)
      .addMarkdown('##### 🔗 Joined Materialized View')
      .addSql(MaterializedViewSQL.create.joined(schema))
      .addMarkdown('##### 📈 Time-Series Materialized View')
      .addSql(MaterializedViewSQL.create.timeSeries(schema))
      .addMarkdown('##### 🎯 Materialized View with Filtered Data')
      .addSql(`-- Materialized view with WHERE clause filter\nCREATE MATERIALIZED VIEW ${schema}.active_users_summary AS\nSELECT \n    u.id,\n    u.name,\n    u.email,\n    COUNT(DISTINCT o.id) as active_orders,\n    SUM(o.total_amount) as active_total\nFROM ${schema}.users u\nJOIN ${schema}.orders o ON u.id = o.user_id\nWHERE o.status = 'active'\n    AND o.created_at >= NOW() - INTERVAL '30 days'\nGROUP BY u.id, u.name, u.email\nWITH DATA;\n\n-- Create unique index\nCREATE UNIQUE INDEX idx_active_users_summary_id \n    ON ${schema}.active_users_summary (id);`)
      .addMarkdown(MarkdownUtils.warningBox('After creating a materialized view, remember to: 1) Create a unique index for concurrent refresh, 2) Set up a refresh schedule, 3) Monitor data freshness, 4) Run ANALYZE after refreshes, 5) Consider partitioning for very large materialized views.'))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create materialized view notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}