import * as vscode from 'vscode';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../services/ConnectionManager';
import { 
    MarkdownUtils, 
    FormatHelpers, 
    ErrorHandlers, 
    SQL_TEMPLATES, 
    ObjectUtils
} from './helper';

/**
 * SQL Queries for materialized view operations
 */

/**
 * MATVIEW_INFO_QUERY - Query to get materialized view details
 * fetches - definition, schema, name, owner, tablespace, indexes, populated status
 * from pg_matviews table
 */
const MATVIEW_INFO_QUERY = `
SELECT pg_get_viewdef($1::regclass, true) as definition,
       schemaname,
       matviewname,
       matviewowner,
       tablespace,
       hasindexes,
       ispopulated,
       pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, matviewname))) as size
FROM pg_matviews
WHERE schemaname = $2 AND matviewname = $3`;

/**
 * MATVIEW_DEF_QUERY - Query to get materialized view definition
 */
const MATVIEW_DEF_QUERY = `
SELECT pg_get_viewdef($1::regclass, true) as definition
FROM pg_matviews
WHERE schemaname = $2 AND matviewname = $3`;

export async function cmdRefreshMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header(`🔄 Refresh Materialized View: \`${item.schema}.${item.label}\``) +
                MarkdownUtils.infoBox('Execute the cell below to refresh the materialized view data.'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Refresh Command`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `REFRESH MATERIALIZED VIEW ${item.schema}.${item.label};`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create refresh materialized view notebook');
    }
}

export async function cmdEditMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            const result = await client.query(MATVIEW_DEF_QUERY, [`${item.schema}.${item.label}`, item.schema, item.label]);
            if (!result.rows[0]?.definition) {
                throw new Error('Materialized view definition not found');
            }

            const viewDef = (result.rows[0].definition || '').replace(/;\s*$/, '');
            const createMatViewStatement = `CREATE MATERIALIZED VIEW ${item.schema}.${item.label} AS\n${viewDef}\nWITH DATA;`;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`✏️ Edit Materialized View: \`${item.schema}.${item.label}\``) +
                    MarkdownUtils.infoBox('Modify the materialized view definition below and execute the cell to update it.') +
                    MarkdownUtils.warningBox('This will drop and recreate the materialized view.'),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 View Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};\n\n${createMatViewStatement}\nWITH DATA;`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create materialized view edit notebook');
    }
}

export async function cmdViewMatViewData(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header(`📖 View Data: \`${item.schema}.${item.label}\``) +
                MarkdownUtils.infoBox('Modify the query below to filter or transform the data as needed.'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📖 Query Data`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create view data notebook');
    }
}

export async function cmdViewMatViewProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const client = await ConnectionManager.getInstance().getConnection({
            id: connection.id,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            database: item.databaseName,
            name: connection.name
        });

        try {
            // Gather comprehensive materialized view information
            const [matviewInfo, columnInfo, indexInfo, dependenciesInfo, referencedInfo, statsInfo] = await Promise.all([
                // Basic materialized view info
                client.query(`
                    SELECT 
                        c.relname as matview_name,
                        n.nspname as schema_name,
                        pg_get_userbyid(c.relowner) as owner,
                        obj_description(c.oid) as comment,
                        c.reltuples::bigint as row_estimate,
                        pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
                        pg_size_pretty(pg_relation_size(c.oid)) as table_size,
                        pg_size_pretty(pg_indexes_size(c.oid)) as indexes_size,
                        mv.ispopulated
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    LEFT JOIN pg_matviews mv ON mv.schemaname = n.nspname AND mv.matviewname = c.relname
                    WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'm'
                `, [item.schema, item.label]),
                
                // Column details
                client.query(`
                    SELECT 
                        column_name,
                        data_type,
                        character_maximum_length,
                        numeric_precision,
                        numeric_scale,
                        is_nullable,
                        column_default,
                        ordinal_position,
                        col_description((table_schema||'.'||table_name)::regclass::oid, ordinal_position) as description
                    FROM information_schema.columns
                    WHERE table_schema = $1 AND table_name = $2
                    ORDER BY ordinal_position
                `, [item.schema, item.label]),
                
                // Indexes
                client.query(`
                    SELECT 
                        i.relname as index_name,
                        ix.indisunique as is_unique,
                        ix.indisprimary as is_primary,
                        string_agg(a.attname, ', ' ORDER BY a.attnum) as columns,
                        pg_get_indexdef(i.oid) as definition,
                        pg_size_pretty(pg_relation_size(i.oid)) as index_size
                    FROM pg_index ix
                    JOIN pg_class i ON i.oid = ix.indexrelid
                    JOIN pg_class t ON t.oid = ix.indrelid
                    JOIN pg_namespace n ON n.oid = t.relnamespace
                    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
                    WHERE n.nspname = $1 AND t.relname = $2
                    GROUP BY i.relname, ix.indisunique, ix.indisprimary, i.oid
                    ORDER BY ix.indisprimary DESC, ix.indisunique DESC, i.relname
                `, [item.schema, item.label]),
                
                // Dependent objects
                client.query(`
                    SELECT DISTINCT
                        dependent_ns.nspname as schema,
                        dependent_view.relname as name,
                        dependent_view.relkind as kind
                    FROM pg_depend 
                    JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid 
                    JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid 
                    JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
                    WHERE pg_depend.refobjid = $1::regclass
                    AND dependent_view.relname != $2
                    ORDER BY schema, name
                `, [`${item.schema}.${item.label}`, item.label]),
                
                // Referenced objects
                client.query(`
                    SELECT DISTINCT
                        ref_nsp.nspname as schema,
                        ref_class.relname as name,
                        ref_class.relkind as kind
                    FROM pg_depend dep
                    JOIN pg_rewrite rew ON dep.objid = rew.oid
                    JOIN pg_class ref_class ON dep.refobjid = ref_class.oid
                    JOIN pg_namespace ref_nsp ON ref_nsp.oid = ref_class.relnamespace
                    WHERE rew.ev_class = $1::regclass
                    AND ref_class.relname != $2
                    AND ref_class.relkind IN ('r', 'v', 'm')
                    ORDER BY schema, name
                `, [`${item.schema}.${item.label}`, item.label]),
                
                // Statistics
                client.query(`
                    SELECT 
                        n_live_tup as live_tuples,
                        n_dead_tup as dead_tuples,
                        last_vacuum,
                        last_autovacuum,
                        last_analyze,
                        last_autoanalyze
                    FROM pg_stat_user_tables
                    WHERE schemaname = $1 AND relname = $2
                `, [item.schema, item.label])
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
            const viewDefResult = await client.query(`SELECT pg_get_viewdef($1::regclass, true) as definition`, [`${item.schema}.${item.label}`]);
            const viewDefinition = (viewDefResult.rows[0]?.definition || '').replace(/;\s*$/, '');

            const metadata = createMetadata(connection, item.databaseName);


            // Build column table HTML
            const columnRows = columns.map(col => {
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
            const indexRows = indexes.map(idx => {
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
            const dependencyRows = dependents.map(dep => {
                return `    <tr>
        <td>${ObjectUtils.getKindLabel(dep.kind)}</td>
        <td><code>${dep.schema}.${dep.name}</code></td>
    </tr>`;
            }).join('\n');

            // Build references table HTML
            const referenceRows = references.map(ref => {
                return `    <tr>
        <td>${ObjectUtils.getKindLabel(ref.kind)}</td>
        <td><code>${ref.schema}.${ref.name}</code></td>
    </tr>`;
            }).join('\n');

            const ownerInfo = `${matview.owner} | <strong>Populated:</strong> ${FormatHelpers.formatBoolean(matview.ispopulated, 'Yes', 'No')}${matview.comment ? ` | <strong>Comment:</strong> ${matview.comment}` : ''}`;
            const markdown = MarkdownUtils.header(`💾 Materialized View Properties: \`${item.schema}.${item.label}\``) +
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
                '---';

            const cells = [
                new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 CREATE MATERIALIZED VIEW Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label};\n\nCREATE MATERIALIZED VIEW ${item.schema}.${item.label} AS\n${viewDefinition}\nWITH DATA;\n\n-- Materialized view comment\n${matview.comment ? `COMMENT ON MATERIALIZED VIEW ${item.schema}.${item.label} IS '${matview.comment.replace(/'/g, "''")}';` : `-- COMMENT ON MATERIALIZED VIEW ${item.schema}.${item.label} IS 'view description';`}\n\n-- Indexes\n${indexes.map(idx => idx.definition).join('\n')}`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔄 Refresh Materialized View`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Refresh materialized view (blocking)\nREFRESH MATERIALIZED VIEW ${item.schema}.${item.label};\n\n-- Refresh materialized view (concurrent, allows reads during refresh)\n-- REFRESH MATERIALIZED VIEW CONCURRENTLY ${item.schema}.${item.label};`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🗑️ DROP Materialized View Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `${SQL_TEMPLATES.DROP.MATERIALIZED_VIEW(item.schema!, item.label)}

-- Drop materialized view (with dependencies)
-- DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label} CASCADE;

-- Drop materialized view (without dependencies - will fail if referenced)
-- DROP MATERIALIZED VIEW IF EXISTS ${item.schema}.${item.label} RESTRICT;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔍 Query Materialized View Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query materialized view data\nSELECT * FROM ${item.schema}.${item.label}\nLIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📊 Statistics and Metadata`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Get detailed statistics\nSELECT \n    schemaname,\n    matviewname,\n    matviewowner,\n    tablespace,\n    hasindexes,\n    ispopulated,\n    pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as total_size\nFROM pg_matviews\nWHERE schemaname = '${item.schema}' AND matviewname = '${item.label}';\n\n-- Check when it was last refreshed\nSELECT \n    schemaname,\n    relname,\n    last_vacuum,\n    last_autovacuum,\n    last_analyze,\n    last_autoanalyze,\n    n_live_tup,\n    n_dead_tup\nFROM pg_stat_user_tables\nWHERE schemaname = '${item.schema}' AND relname = '${item.label}';`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'show materialized view properties');
    }
}

export async function cmdDropMatView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header(`❌ Drop Materialized View: \`${item.schema}.${item.label}\``) +
                MarkdownUtils.dangerBox('This action will permanently delete the materialized view. This operation cannot be undone.'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ❌ Drop Command`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                SQL_TEMPLATES.DROP.MATERIALIZED_VIEW(item.schema!, item.label),
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create drop materialized view notebook');
    }
}

export async function cmdMatViewOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const markdown = MarkdownUtils.header(`🔄 Materialized View Operations: \`${item.schema}.${item.label}\``) +
            MarkdownUtils.infoBox('Materialized views store query results as physical tables that need periodic refreshing. They provide faster query performance at the cost of data freshness.') +
            `\n\n#### 📋 Common Operations\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '🔄 Refresh', description: 'Updates the materialized view with fresh data from underlying tables. Locks the view during refresh.', riskLevel: 'Standard data refresh' },
                { operation: '⚡ Concurrent Refresh', description: 'Refreshes without locking (requires unique index). Allows reads during refresh.', riskLevel: 'High-availability scenarios' },
                { operation: '🔍 Create Index', description: 'Adds indexes to improve query performance on the materialized view.', riskLevel: 'Query optimization' },
                { operation: '📊 Analyze', description: 'Updates statistics for the query planner to optimize query execution.', riskLevel: 'After large refreshes' },
                { operation: '🔍 Query Data', description: 'Query the materialized view data like a regular table.', riskLevel: 'Data analysis' },
                { operation: '📈 Check Freshness', description: 'View when the materialized view was last refreshed.', riskLevel: 'Monitoring data staleness' }
            ]) +
            `\n\n---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Standard Refresh\n\n${MarkdownUtils.warningBox('This operation locks the materialized view and prevents reads during refresh.')}`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Refresh materialized view (blocking operation)\nREFRESH MATERIALIZED VIEW ${item.schema}.${item.label};\n\n-- Alternative: Truncate and rebuild\nREFRESH MATERIALIZED VIEW ${item.schema}.${item.label} WITH DATA;\n\n-- Clear data without dropping structure\nREFRESH MATERIALIZED VIEW ${item.schema}.${item.label} WITH NO DATA;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⚡ Concurrent Refresh\n\n${MarkdownUtils.infoBox('Requires a unique index. Allows queries during refresh but is slower than standard refresh.', 'Note')}`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Concurrent refresh (non-blocking, requires unique index)\nREFRESH MATERIALIZED VIEW CONCURRENTLY ${item.schema}.${item.label};\n\n-- First, ensure you have a unique index\n-- Example:\n-- CREATE UNIQUE INDEX ${item.label}_unique_idx ON ${item.schema}.${item.label} (id);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔍 Create Indexes\n\n${MarkdownUtils.successBox('Indexes on materialized views improve query performance, just like on regular tables.')}`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create a unique index (enables concurrent refresh)\nCREATE UNIQUE INDEX ${item.label}_unique_idx \n    ON ${item.schema}.${item.label} (id);\n\n-- Create a regular B-tree index\nCREATE INDEX ${item.label}_column_idx \n    ON ${item.schema}.${item.label} (column_name);\n\n-- Create a multi-column index\nCREATE INDEX ${item.label}_multi_idx \n    ON ${item.schema}.${item.label} (col1, col2);\n\n-- Create a partial index (with WHERE clause)\nCREATE INDEX ${item.label}_partial_idx \n    ON ${item.schema}.${item.label} (status)\n    WHERE status = 'active';\n\n-- Create a GiST index (for spatial/full-text data)\nCREATE INDEX ${item.label}_gist_idx \n    ON ${item.schema}.${item.label} USING GIST (column_name);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Update Statistics`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Update query planner statistics\nANALYZE ${item.schema}.${item.label};\n\n-- Analyze specific columns\nANALYZE ${item.schema}.${item.label} (column1, column2);\n\n-- Verbose analyze (shows detailed output)\nANALYZE VERBOSE ${item.schema}.${item.label};`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔍 Query Data`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Query materialized view data\nSELECT * FROM ${item.schema}.${item.label}\nLIMIT 100;\n\n-- Count rows\nSELECT COUNT(*) as row_count\nFROM ${item.schema}.${item.label};\n\n-- Get column statistics\nSELECT column_name, data_type, is_nullable\nFROM information_schema.columns\nWHERE table_schema = '${item.schema}' \n  AND table_name = '${item.label}'\nORDER BY ordinal_position;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📈 Monitor Freshness and Performance`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Check when materialized view was last refreshed\nSELECT \n    schemaname,\n    matviewname,\n    matviewowner,\n    tablespace,\n    hasindexes,\n    ispopulated,\n    pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as total_size\nFROM pg_matviews\nWHERE schemaname = '${item.schema}' AND matviewname = '${item.label}';\n\n-- Check statistics and last maintenance\nSELECT \n    schemaname,\n    tablename,\n    last_vacuum,\n    last_autovacuum,\n    last_analyze,\n    last_autoanalyze,\n    n_live_tup as live_rows,\n    n_dead_tup as dead_rows\nFROM pg_stat_user_tables\nWHERE schemaname = '${item.schema}' AND tablename = '${item.label}';\n\n-- View all indexes on the materialized view\nSELECT \n    indexname,\n    indexdef,\n    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size\nFROM pg_indexes\nWHERE schemaname = '${item.schema}' AND tablename = '${item.label}'\nORDER BY indexname;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔧 Advanced Operations`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Change materialized view owner\nALTER MATERIALIZED VIEW ${item.schema}.${item.label} OWNER TO new_owner;\n\n-- Rename materialized view\nALTER MATERIALIZED VIEW ${item.schema}.${item.label} RENAME TO new_name;\n\n-- Move to different schema\nALTER MATERIALIZED VIEW ${item.schema}.${item.label} SET SCHEMA new_schema;\n\n-- Change tablespace\nALTER MATERIALIZED VIEW ${item.schema}.${item.label} SET TABLESPACE new_tablespace;\n\n-- Add comment\nCOMMENT ON MATERIALIZED VIEW ${item.schema}.${item.label} IS 'Description of the materialized view';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📚 Best Practices\n\n${MarkdownUtils.infoBox(`<strong>✨ Refresh Strategy:</strong><br/>• Use <code>REFRESH MATERIALIZED VIEW CONCURRENTLY</code> for high-availability scenarios (requires unique index)<br/>• Schedule regular refreshes based on data freshness requirements<br/>• Run <code>ANALYZE</code> after large refreshes to update statistics<br/>• Monitor materialized view size and query performance<br/>• Consider partitioning for very large materialized views`, 'Best Practices')}`,
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'show materialized view operations');
    }
}

/**
 * cmdCreateMaterializedView - Command to create a new materialized view in the database.
 */
export async function cmdCreateMaterializedView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const schema = item.schema!;

        const markdown = MarkdownUtils.header(`➕ Create New Materialized View in Schema: \`${schema}\``) +
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
            `\n\n---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Basic Materialized View (Recommended Start)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create basic materialized view
CREATE MATERIALIZED VIEW ${schema}.matview_name AS
SELECT 
    column1, 
    column2,
    COUNT(*) as count
FROM ${schema}.source_table
WHERE condition = true
WITH DATA;

-- Add unique index (enables concurrent refresh)
CREATE UNIQUE INDEX idx_matview_name_id ON ${schema}.matview_name (column1);

-- Add comment
COMMENT ON MATERIALIZED VIEW ${schema}.matview_name IS 'Materialized view description';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Aggregated Materialized View`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Materialized view with aggregations
CREATE MATERIALIZED VIEW ${schema}.sales_summary AS
SELECT 
    product_id,
    DATE_TRUNC('month', order_date) as month,
    COUNT(*) as order_count,
    SUM(quantity) as total_quantity,
    SUM(amount) as total_revenue,
    AVG(amount) as avg_order_value
FROM ${schema}.orders o
JOIN ${schema}.order_items oi ON o.id = oi.order_id
GROUP BY product_id, DATE_TRUNC('month', order_date)
WITH DATA;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_sales_summary_unique 
    ON ${schema}.sales_summary (product_id, month);

-- Create additional indexes for common queries
CREATE INDEX idx_sales_summary_month ON ${schema}.sales_summary (month);
CREATE INDEX idx_sales_summary_product ON ${schema}.sales_summary (product_id);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Materialized View with Refresh Strategy`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create materialized view with refresh setup
CREATE MATERIALIZED VIEW ${schema}.daily_stats AS
SELECT 
    DATE(created_at) as stat_date,
    COUNT(*) as total_records,
    COUNT(DISTINCT user_id) as unique_users
FROM ${schema}.events
GROUP BY DATE(created_at)
WITH DATA;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX idx_daily_stats_date ON ${schema}.daily_stats (stat_date);

-- Schedule refresh (example using pg_cron extension)
-- SELECT cron.schedule('refresh-daily-stats', '0 2 * * *', 
--     'REFRESH MATERIALIZED VIEW CONCURRENTLY ${schema}.daily_stats');`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔗 Joined Materialized View`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Materialized view joining multiple tables
CREATE MATERIALIZED VIEW ${schema}.user_order_summary AS
SELECT 
    u.id as user_id,
    u.name as user_name,
    u.email,
    COUNT(o.id) as total_orders,
    SUM(o.total_amount) as lifetime_value,
    MAX(o.created_at) as last_order_date
FROM ${schema}.users u
LEFT JOIN ${schema}.orders o ON u.id = o.user_id
GROUP BY u.id, u.name, u.email
WITH DATA;

-- Create unique index
CREATE UNIQUE INDEX idx_user_order_summary_user_id 
    ON ${schema}.user_order_summary (user_id);

-- Create index for common queries
CREATE INDEX idx_user_order_summary_lifetime_value 
    ON ${schema}.user_order_summary (lifetime_value DESC);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📈 Time-Series Materialized View`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Materialized view for time-series data
CREATE MATERIALIZED VIEW ${schema}.hourly_metrics AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    metric_type,
    SUM(value) as total_value,
    AVG(value) as avg_value,
    MIN(value) as min_value,
    MAX(value) as max_value
FROM ${schema}.metrics
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), metric_type
WITH DATA;

-- Create unique index
CREATE UNIQUE INDEX idx_hourly_metrics_unique 
    ON ${schema}.hourly_metrics (hour, metric_type);

-- Create index for time-based queries
CREATE INDEX idx_hourly_metrics_hour ON ${schema}.hourly_metrics (hour DESC);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🎯 Materialized View with Filtered Data`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Materialized view with WHERE clause filter
CREATE MATERIALIZED VIEW ${schema}.active_users_summary AS
SELECT 
    u.id,
    u.name,
    u.email,
    COUNT(DISTINCT o.id) as active_orders,
    SUM(o.total_amount) as active_total
FROM ${schema}.users u
JOIN ${schema}.orders o ON u.id = o.user_id
WHERE o.status = 'active'
    AND o.created_at >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.name, u.email
WITH DATA;

-- Create unique index
CREATE UNIQUE INDEX idx_active_users_summary_id 
    ON ${schema}.active_users_summary (id);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.warningBox('After creating a materialized view, remember to: 1) Create a unique index for concurrent refresh, 2) Set up a refresh schedule, 3) Monitor data freshness, 4) Run ANALYZE after refreshes, 5) Consider partitioning for very large materialized views.'),
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create materialized view notebook');
    }
}