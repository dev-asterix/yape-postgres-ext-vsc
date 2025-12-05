import * as vscode from 'vscode';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../services/ConnectionManager';
import { TablePropertiesPanel } from '../tableProperties';
import { 
    MarkdownUtils, 
    FormatHelpers, 
    ErrorHandlers, 
    SQL_TEMPLATES, 
    ObjectUtils,
    createSimpleNotebook 
} from './helper';

/**
 * SQL query to get the view definition from PostgreSQL.
 */

/**
 * VIEW_DEFINITION_QUERY - SQL query to get the view definition from PostgreSQL.
 * fetches - the view definition from the database.
 */
const VIEW_DEFINITION_QUERY = `SELECT pg_get_viewdef($1:: regclass, true) as definition`;

/**
 * COLUMN_INFO_QUERY - SQL query to get column information for a view
 */
const COLUMN_INFO_QUERY = `
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = $1
AND table_name = $2
ORDER BY ordinal_position`;


/**
 * cmdScriptSelect - Command to generate a SELECT script for a view
 */
export async function cmdScriptSelect(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    const markdown = MarkdownUtils.header(`📖 SELECT Script: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.infoBox('Execute the query below to retrieve data from the view.');
    await createSimpleNotebook(item, 'SELECT Script', `SELECT * FROM ${item.schema}.${item.label} LIMIT 100;`, markdown);
}

/**
 * cmdScriptCreate - Command to generate a CREATE script for a view
 */
export async function cmdScriptCreate(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    await cmdEditView(item, context);
}

/**
 * viewEditCmd - Command to edit a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdEditView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const viewResult = await client.query(VIEW_DEFINITION_QUERY, [`${item.schema}.${item.label} `]);
            if (!viewResult.rows[0]?.definition) {
                throw new Error('View definition not found');
            }

            const createViewStatement = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition} `;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`✏️ Edit View: \`${item.schema}.${item.label}\``) +
                    MarkdownUtils.infoBox('Modify the view definition below and execute the cell to update the view.'),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 View Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    createViewStatement,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create view edit notebook');
    }
}

/**
 * viewViewDataCmd - Command to view data from a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdViewData(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
                `-- View data
SELECT *
    FROM ${item.schema}.${item.label}
LIMIT 100; `,
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create view data notebook');
    }
}

/**
 * viewDropCmd - Command to drop a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdDropView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const cells = [
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.header(`❌ Drop View: \`${item.schema}.${item.label}\``) +
                MarkdownUtils.dangerBox('This action will permanently delete the view. This operation cannot be undone.'),
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ❌ Drop Command`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                SQL_TEMPLATES.DROP.VIEW(item.schema!, item.label),
                'sql'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create drop view notebook');
    }
}

/**
 * viewOperationsCmd - Command to create a notebook for common operations on a PostgreSQL view.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdViewOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const viewResult = await client.query(VIEW_DEFINITION_QUERY, [`${item.schema}.${item.label} `]);
            if (!viewResult.rows[0]?.definition) {
                throw new Error('View definition not found');
            }

            // Get column information
            const columnsResult = await client.query(COLUMN_INFO_QUERY, [item.schema, item.label]);
            const columns = columnsResult.rows;

            const viewDefinition = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition} `;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`👁️ View Operations: \`${item.schema}.${item.label}\``) +
                    MarkdownUtils.infoBox('This notebook contains common operations for the PostgreSQL view. Run the cells below to execute the operations.') +
                    `\n\n#### 📋 View Information\n\n` +
                    MarkdownUtils.propertiesTable({
                        'Schema': item.schema || '',
                        'View Name': item.label,
                        'Column Count': `${columns.length}`
                    }) +
                    `\n\n#### 🎯 Available Operations\n\n` +
                    MarkdownUtils.operationsTable([
                        { operation: '📋 View Columns', description: 'Display column definitions' },
                        { operation: '📝 View Definition', description: 'Show the CREATE VIEW statement' },
                        { operation: '📖 Query Data', description: 'Select the first 100 rows' },
                        { operation: '🔍 Query with Filters', description: 'Advanced SELECT with WHERE clause' },
                        { operation: '📊 Query with Aggregation', description: 'Group and aggregate data' },
                        { operation: '✏️ Modify Definition', description: 'Template for updating the view' },
                        { operation: '❌ Drop', description: 'Delete the view (Warning: Irreversible)' }
                    ]),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📋 View Columns`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- View columns\nSELECT \n    column_name,\n    data_type,\n    is_nullable,\n    column_default\nFROM information_schema.columns\nWHERE table_schema = '${item.schema}'\n  AND table_name = '${item.label}'\nORDER BY ordinal_position;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 View Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- View definition\n${viewDefinition} `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📖 Query Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query view data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔍 Query with Filters`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query with filters
SELECT *
FROM ${item.schema}.${item.label}
WHERE condition = value
ORDER BY column_name
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📊 Query with Aggregation`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query with aggregation
SELECT 
    column_name,
    COUNT(*) as count,
    AVG(numeric_column) as average
FROM ${item.schema}.${item.label}
GROUP BY column_name
ORDER BY count DESC;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ✏️ Modify Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Modify view definition
CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS
SELECT * FROM source_table
WHERE condition;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop View`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    SQL_TEMPLATES.DROP.VIEW(item.schema!, item.label),
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create view operations notebook');
    }
}

/**
 * Show properties of a PostgreSQL view.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the properties are shown.
 */
export async function cmdShowViewProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            // Gather comprehensive view information
            const [viewInfo, columnInfo, dependenciesInfo, referencedInfo, sizeInfo] = await Promise.all([
                // Basic view info
                client.query(`
                    SELECT 
                        c.relname as view_name,
                        n.nspname as schema_name,
                        pg_get_userbyid(c.relowner) as owner,
                        obj_description(c.oid) as comment,
                        c.reltuples::bigint as row_estimate
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'v'
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
                
                // Dependent objects (views/tables that depend on this view)
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
                
                // Referenced objects (tables/views this view depends on)
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
                
                // Size information
                client.query(`
                    SELECT 
                        pg_size_pretty(pg_relation_size($1::regclass)) as view_size
                `, [`${item.schema}.${item.label}`])
            ]);

            const view = viewInfo.rows[0];
            const columns = columnInfo.rows;
            const dependents = dependenciesInfo.rows;
            const references = referencedInfo.rows;
            const sizes = sizeInfo.rows[0];

            // Get view definition
            const viewDefResult = await client.query(`SELECT pg_get_viewdef($1::regclass, true) as definition`, [`${item.schema}.${item.label}`]);
            const viewDefinition = viewDefResult.rows[0]?.definition || '';

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
        <td>${col.column_default ? `<code>${col.column_default}</code>` : '—'}</td>
        <td>${col.description || '—'}</td>
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

            // Build CREATE VIEW script
            const createViewScript = `-- DROP VIEW IF EXISTS ${item.schema}.${item.label};

CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS
${viewDefinition};

-- View comment
${view.comment ? `COMMENT ON VIEW ${item.schema}.${item.label} IS '${view.comment.replace(/'/g, "''")}';` : `-- COMMENT ON VIEW ${item.schema}.${item.label} IS 'view description';`}`;

            const ownerInfo = view.owner + (view.comment ? ` | <strong>Comment:</strong> ${view.comment}` : '');
            const markdown = MarkdownUtils.header(`👁️ View Properties: \`${item.schema}.${item.label}\``) +
                MarkdownUtils.infoBox(`<strong>Owner:</strong> ${ownerInfo}`) +
                `\n\n#### 📊 General Information\n\n` +
                MarkdownUtils.propertiesTable({
                    'Schema': view.schema_name,
                    'View Name': view.view_name,
                    'Owner': view.owner,
                    'Size': sizes.view_size,
                    'Row Estimate': view.row_estimate?.toLocaleString() || 'N/A',
                    'Column Count': `${columns.length}`
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
                (references.length > 0 ? `#### 🔗 Referenced Objects (${references.length})

${MarkdownUtils.infoBox('Objects that this view depends on (base tables and views):', 'Info')}

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 20%;">Type</th>
        <th style="text-align: left;">Object</th>
    </tr>
${referenceRows}
</table>

` : '') +
                (dependents.length > 0 ? `#### 🔄 Dependent Objects (${dependents.length})

${MarkdownUtils.infoBox('Objects that depend on this view (other views that reference this one):', 'Info')}

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
                    `##### 📝 CREATE VIEW Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    createViewScript,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🗑️ DROP VIEW Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `${SQL_TEMPLATES.DROP.VIEW(item.schema!, item.label)}

-- Drop view (with dependencies)
-- DROP VIEW IF EXISTS ${item.schema}.${item.label} CASCADE;

-- Drop view (without dependencies - will fail if referenced)
-- DROP VIEW IF EXISTS ${item.schema}.${item.label} RESTRICT;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔍 Query View Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Select all data from view
SELECT * FROM ${item.schema}.${item.label}
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📊 View Definition Details`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Get detailed view information
SELECT 
    schemaname,
    viewname,
    viewowner,
    definition
FROM pg_views
WHERE schemaname = '${item.schema}' AND viewname = '${item.label}';

-- Check view dependencies
SELECT DISTINCT
    v.table_schema,
    v.table_name,
    v.column_name
FROM information_schema.view_column_usage v
WHERE v.view_schema = '${item.schema}' 
AND v.view_name = '${item.label}'
ORDER BY v.table_schema, v.table_name, v.column_name;`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'show view properties');
    }
}

/**
 * cmdRefreshView - Refreshes the view item in the tree view.
 */
export async function cmdRefreshView(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}

/**
 * cmdCreateView - Command to create a new view in the database.
 */
export async function cmdCreateView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const schema = item.schema!;

        const markdown = MarkdownUtils.header(`➕ Create New View in Schema: \`${schema}\``) +
            MarkdownUtils.infoBox('This notebook provides templates for creating views. Modify the templates below and execute to create views.') +
            `\n\n#### 📋 View Design Guidelines\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '<strong>Naming</strong>', description: 'Use snake_case for view names (e.g., user_summary, order_details)' },
                { operation: '<strong>Purpose</strong>', description: 'Views simplify complex queries, provide abstraction, or enforce security' },
                { operation: '<strong>Performance</strong>', description: 'Views don\'t store data; queries execute against underlying tables' },
                { operation: '<strong>Materialized Views</strong>', description: 'For better performance, consider materialized views for expensive queries' },
                { operation: '<strong>Security</strong>', description: 'Use views to restrict column/row access without modifying base tables' }
            ]) +
            `\n\n#### 🏷️ Common View Patterns\n\n` +
            MarkdownUtils.propertiesTable({
                'Simple View': 'SELECT columns FROM single table',
                'Joined View': 'JOIN multiple tables for simplified access',
                'Aggregated View': 'GROUP BY with aggregate functions',
                'Filtered View': 'WHERE clause to show subset of data',
                'Computed View': 'Calculated columns and expressions',
                'Security View': 'Row-level security with WHERE conditions'
            }) +
            MarkdownUtils.successBox('Views are updated automatically when underlying tables change. Use CREATE OR REPLACE to modify existing views.') +
            `\n\n---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Basic View (Recommended Start)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create basic view
CREATE OR REPLACE VIEW ${schema}.view_name AS
SELECT 
    column1, 
    column2,
    column3
FROM 
    ${schema}.table_name
WHERE 
    condition;

-- Add comment
COMMENT ON VIEW ${schema}.view_name IS 'Description of what this view provides';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔗 Joined View`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View with JOINs
CREATE OR REPLACE VIEW ${schema}.user_orders_summary AS
SELECT 
    u.id as user_id,
    u.name as user_name,
    o.id as order_id,
    o.total_amount,
    o.created_at
FROM 
    ${schema}.users u
    INNER JOIN ${schema}.orders o ON u.id = o.user_id
WHERE 
    o.status = 'completed';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Aggregated View`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View with aggregations
CREATE OR REPLACE VIEW ${schema}.sales_summary AS
SELECT 
    product_id,
    COUNT(*) as total_orders,
    SUM(quantity) as total_quantity,
    SUM(amount) as total_revenue,
    AVG(amount) as avg_order_value
FROM 
    ${schema}.order_items
GROUP BY 
    product_id;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔒 Security View (Row-Level Access)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View that restricts data access
CREATE OR REPLACE VIEW ${schema}.my_documents AS
SELECT 
    id,
    title,
    content,
    created_at
FROM 
    ${schema}.documents
WHERE 
    created_by = current_user_id()
    AND deleted_at IS NULL;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🧮 Computed View (Calculated Columns)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View with calculated columns
CREATE OR REPLACE VIEW ${schema}.product_pricing AS
SELECT 
    id,
    name,
    base_price,
    discount_percent,
    base_price * (1 - discount_percent / 100.0) as final_price,
    CASE 
        WHEN discount_percent > 20 THEN 'High Discount'
        WHEN discount_percent > 10 THEN 'Medium Discount'
        ELSE 'Low Discount'
    END as discount_category
FROM 
    ${schema}.products
WHERE 
    is_active = true;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Recursive View (CTE)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- View using Common Table Expression (CTE)
CREATE OR REPLACE VIEW ${schema}.category_hierarchy AS
WITH RECURSIVE category_tree AS (
    -- Base case: root categories
    SELECT 
        id,
        name,
        parent_id,
        0 as level,
        name as path
    FROM 
        ${schema}.categories
    WHERE 
        parent_id IS NULL
    
    UNION ALL
    
    -- Recursive case: child categories
    SELECT 
        c.id,
        c.name,
        c.parent_id,
        ct.level + 1,
        ct.path || ' > ' || c.name
    FROM 
        ${schema}.categories c
        INNER JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.warningBox('After creating a view, remember to: 1) Test the view with sample queries, 2) Add appropriate indexes on underlying tables if needed, 3) Grant necessary permissions to roles, 4) Consider materialized views for expensive queries.'),
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create view notebook');
    }
}