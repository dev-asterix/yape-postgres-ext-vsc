import { Client } from 'pg';
import * as vscode from 'vscode';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateCategoryItem, validateItem } from '../commands/connection';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../services/ConnectionManager';
import { TablePropertiesPanel } from '../tableProperties';
import { 
    MarkdownUtils, 
    FormatHelpers, 
    ErrorHandlers, 
    SQL_TEMPLATES, 
    ObjectUtils
} from './helper';

/**
 * SCHEMA_INFO_QUERY - Query to get schema information including size, object counts, and privileges
 * fetches - schema name, owner, total size, object counts (tables, views, functions), and privileges
 */
const SCHEMA_INFO_QUERY = `
SELECT
n.nspname as schema_name,
    pg_catalog.pg_get_userbyid(n.nspowner) as owner,
    pg_size_pretty(sum(pg_total_relation_size(quote_ident(pg_tables.schemaname) || '.' || quote_ident(tablename))):: bigint) as total_size,
    count(distinct tablename) as tables_count,
    count(distinct viewname) as views_count,
    count(distinct routines.routine_name) as functions_count,
    array_agg(distinct format(
        E'%s ON %s TO %s',
        p.privilege_type,
        p.table_schema,
        p.grantee
    )) as privileges
FROM pg_catalog.pg_namespace n
LEFT JOIN pg_tables ON pg_tables.schemaname = n.nspname
LEFT JOIN pg_views ON pg_tables.schemaname = n.nspname
LEFT JOIN information_schema.routines ON routine_schema = n.nspname
LEFT JOIN information_schema.table_privileges p ON p.table_schema = n.nspname
WHERE n.nspname = $1
GROUP BY n.nspname, n.nspowner`;

/**
 * cmdCreateSchema - Command to create a new schema in the database
 * @param {DatabaseTreeItem} item - The selected database item in the tree
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdCreateSchema(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateCategoryItem(item);
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const connection = await ConnectionManager.getInstance().getConnection({
            id: connectionConfig.id,
            host: connectionConfig.host,
            port: connectionConfig.port,
            username: connectionConfig.username,
            database: item.databaseName,
            name: connectionConfig.name
        });
        const metadata = createMetadata(connectionConfig, item.databaseName);

        const databaseName = item.label;

        const markdown = MarkdownUtils.header(`➕ Create New Schema in Database: \`${databaseName}\``) +
            MarkdownUtils.infoBox('This notebook provides templates for creating schemas. Modify the templates below and execute to create schemas.') +
            `\n\n#### 📋 Schema Design Guidelines\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '<strong>Naming</strong>', description: 'Use lowercase names (e.g., app_data, analytics, reporting). Avoid reserved names like "public".' },
                { operation: '<strong>Purpose</strong>', description: 'Organize database objects logically. Use schemas to separate applications, environments, or features' },
                { operation: '<strong>Security</strong>', description: 'Control access with GRANT/REVOKE. Use schemas for multi-tenant applications' },
                { operation: '<strong>Search Path</strong>', description: 'Set search_path to include schemas in order of preference' },
                { operation: '<strong>Ownership</strong>', description: 'Assign appropriate owners. Owners can create objects and grant privileges' }
            ]) +
            `\n\n#### 🏷️ Common Schema Patterns\n\n` +
            MarkdownUtils.propertiesTable({
                'Application Schema': 'Separate schema per application (e.g., app1, app2)',
                'Feature Schema': 'Schema per feature/module (e.g., billing, inventory)',
                'Environment Schema': 'Schema per environment (e.g., dev, staging, prod)',
                'Tenant Schema': 'Schema per tenant in multi-tenant applications',
                'Archive Schema': 'Schema for historical/archived data',
                'Reporting Schema': 'Schema for reporting views and materialized views'
            }) +
            MarkdownUtils.successBox('Schemas provide logical organization and security boundaries. Use them to organize large databases and control access.') +
            `\n\n---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Basic Schema (Recommended Start)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create basic schema
CREATE SCHEMA schema_name;

-- Add comment
COMMENT ON SCHEMA schema_name IS 'Description of the schema purpose';

-- Grant basic usage (modify as needed)
GRANT USAGE ON SCHEMA schema_name TO PUBLIC;
-- GRANT CREATE ON SCHEMA schema_name TO role_name;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔐 Schema with Permissions`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create schema with owner
CREATE SCHEMA schema_name
    AUTHORIZATION owner_role;

-- Grant permissions to roles
GRANT USAGE ON SCHEMA schema_name TO app_role;
GRANT CREATE ON SCHEMA schema_name TO app_role;

-- Grant privileges on all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA schema_name TO app_role;

-- Grant privileges on all sequences
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA schema_name TO app_role;

-- Grant execute on all functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA schema_name TO app_role;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Default Privileges Setup`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Set default privileges for future objects
-- This ensures new objects automatically get the right permissions

-- Default privileges on tables
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;

-- Default privileges on sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name
    GRANT SELECT, USAGE ON SEQUENCES TO app_role;

-- Default privileges on functions
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name
    GRANT EXECUTE ON FUNCTIONS TO app_role;

-- Default privileges on types
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_name
    GRANT USAGE ON TYPES TO app_role;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🏢 Multi-Tenant Schema Pattern`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create schema for tenant isolation
CREATE SCHEMA tenant_123;

-- Grant tenant-specific access
GRANT USAGE ON SCHEMA tenant_123 TO tenant_123_role;

-- Grant privileges on all objects
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA tenant_123 TO tenant_123_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA tenant_123 TO tenant_123_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tenant_123 TO tenant_123_role;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA tenant_123
    GRANT ALL ON TABLES TO tenant_123_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tenant_123
    GRANT ALL ON SEQUENCES TO tenant_123_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tenant_123
    GRANT EXECUTE ON FUNCTIONS TO tenant_123_role;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Reporting Schema Pattern`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create schema for reporting/analytics
CREATE SCHEMA reporting;

-- Grant read-only access to reporting role
GRANT USAGE ON SCHEMA reporting TO reporting_role;

-- Grant SELECT on all tables and views
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO reporting_role;

-- Set default privileges for future objects (read-only)
ALTER DEFAULT PRIVILEGES IN SCHEMA reporting
    GRANT SELECT ON TABLES TO reporting_role;

-- Create materialized views in reporting schema
-- CREATE MATERIALIZED VIEW reporting.sales_summary AS ...;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔍 Search Path Configuration`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Set search path for current session
SET search_path TO schema_name, public;

-- Set search path for a role (persistent)
ALTER ROLE role_name SET search_path = schema_name, public;

-- Set search path for a database (affects all connections)
ALTER DATABASE database_name SET search_path = schema_name, public;

-- View current search path
SHOW search_path;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.warningBox('After creating a schema, remember to: 1) Grant appropriate permissions, 2) Set up default privileges for future objects, 3) Configure search_path if needed, 4) Document the schema purpose with comments.'),
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create schema notebook');
    }
}

/**
 * cmdCreateObjectInSchema - Command to create a new object (table, view, function, etc.) in the selected schema
 * @param {DatabaseTreeItem} item - The selected schema item in the tree
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdCreateObjectInSchema(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const connection = await ConnectionManager.getInstance().getConnection({
            id: connectionConfig.id,
            host: connectionConfig.host,
            port: connectionConfig.port,
            username: connectionConfig.username,
            database: item.databaseName,
            name: connectionConfig.name
        });
        const metadata = createMetadata(connectionConfig, item.databaseName);

        const items = [
            { label: 'Table', detail: 'Create a new table in this schema', query: `CREATE TABLE ${item.schema}.table_name(\n    id serial PRIMARY KEY, \n    column_name data_type, \n    created_at timestamptz DEFAULT current_timestamp\n); ` },
            { label: 'View', detail: 'Create a new view in this schema', query: `CREATE VIEW ${item.schema}.view_name AS\nSELECT column1, column2\nFROM some_table\nWHERE condition; ` },
            { label: 'Function', detail: 'Create a new function in this schema', query: `CREATE OR REPLACE FUNCTION ${item.schema}.function_name(\n    param1 data_type, \n    param2 data_type\n) RETURNS return_type AS $$\nBEGIN\n-- Function logic here\n    RETURN result; \nEND; \n$$ LANGUAGE plpgsql; ` },
            { label: 'Materialized View', detail: 'Create a new materialized view in this schema', query: `CREATE MATERIALIZED VIEW ${item.schema}.matview_name AS\nSELECT column1, column2\nFROM source_table\nWHERE condition\nWITH DATA; ` },
            { label: 'Type', detail: 'Create a new composite type in this schema', query: `CREATE TYPE ${item.schema}.type_name AS(\n    field1 data_type, \n    field2 data_type\n); ` },
            { label: 'Foreign Table', detail: 'Create a new foreign table in this schema', query: `CREATE FOREIGN TABLE ${item.schema}.foreign_table_name(\n    column1 data_type, \n    column2 data_type\n) SERVER foreign_server_name\nOPTIONS(schema_name 'remote_schema', table_name 'remote_table'); ` }
        ];

        const selection = await vscode.window.showQuickPick(items, {
            title: 'Create in Schema',
            placeHolder: 'Select what to create'
        });

        if (selection) {
            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`➕ Create New ${selection.label} in Schema: \`${item.schema}\``) +
                    MarkdownUtils.infoBox(`Modify the definition below and execute the cell to create the ${selection.label.toLowerCase()}.`),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Object Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    selection.query,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create notebook');
    }
}

/**
 * cmdAllSchemaOperations - Command to create a notebook with various schema operations
 * @param {DatabaseTreeItem} item - The selected schema item in the tree
 * @param {vscode.ExtensionContext} context - The extension context
 */
export async function cmdSchemaOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connectionConfig = await getConnectionWithPassword(item.connectionId!);
        const connection = await ConnectionManager.getInstance().getConnection({
            id: connectionConfig.id,
            host: connectionConfig.host,
            port: connectionConfig.port,
            username: connectionConfig.username,
            database: item.databaseName,
            name: connectionConfig.name
        });
        let client: Client | undefined;

        try {
            client = connection;

            const schemaInfo = await client.query(SCHEMA_INFO_QUERY, [item.schema]);
            const info = schemaInfo.rows[0];

            const privileges = (info.privileges || []).filter((p: string | null) => p !== null);
            const privilegesText = privileges.length > 0 ? privileges.join(', ') : 'No specific privileges found';

            const metadata = createMetadata(connectionConfig, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`🗂️ Schema Operations: \`${item.schema}\``) +
                    MarkdownUtils.infoBox('This notebook contains operations for managing the schema. Execute the cells below to perform operations.') +
                    `\n\n#### 📊 Schema Information\n\n` +
                    MarkdownUtils.propertiesTable({
                        'Owner': info.owner,
                        'Total Size': info.total_size,
                        'Objects': `${info.tables_count} tables, ${info.views_count} views, ${info.functions_count} functions`,
                        'Privileges': privilegesText
                    }),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📦 Schema Objects`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List all objects in schema with sizes
SELECT 
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        WHEN 's' THEN 'special'
        WHEN 'f' THEN 'foreign table'
        WHEN 'p' THEN 'partitioned table'
END as object_type,
    c.relname as object_name,
    pg_size_pretty(pg_total_relation_size(quote_ident('public') || '.' || quote_ident(c.relname))) as size,
    CASE WHEN c.relkind = 'r' THEN
        (SELECT reltuples:: bigint FROM pg_class WHERE oid = c.oid)
    ELSE NULL END as estimated_row_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND c.relkind in ('r', 'v', 'm', 'S', 'f', 'p')
ORDER BY c.relkind, pg_total_relation_size(c.oid) DESC; `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔐 Schema Privileges`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List schema privileges
SELECT grantee, string_agg(privilege_type, ', ') as privileges
FROM(
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = '${item.schema}'
    UNION
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = '${item.schema}'
    UNION
    SELECT DISTINCT grantee, privilege_type
    FROM information_schema.usage_privileges
    WHERE object_schema = '${item.schema}'
) p
GROUP BY grantee
ORDER BY grantee; `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🛡️ Grant Privileges`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Grant privileges(modify as needed)
GRANT USAGE ON SCHEMA ${item.schema} TO role_name;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${item.schema} TO role_name;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${item.schema} TO role_name;
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA ${item.schema} TO role_name;

--Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA ${item.schema}
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO role_name;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${item.schema}
    GRANT EXECUTE ON FUNCTIONS TO role_name;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${item.schema}
    GRANT SELECT, USAGE ON SEQUENCES TO role_name; `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🧹 Maintenance`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Schema maintenance

--First analyze all tables(can be run within DO block)
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE pg_tables.schemaname = '${item.schema}'
LOOP
        EXECUTE 'ANALYZE VERBOSE ' || quote_ident('${item.schema}') || '.' || quote_ident(t.tablename);
    END LOOP;
END $$;

--Note: VACUUM commands must be run as separate statements
--The following are example VACUUM commands for each table in the schema
SELECT format('VACUUM ANALYZE %I.%I;', schemaname, tablename) as vacuum_command
FROM pg_tables 
WHERE schemaname = '${item.schema}'
ORDER BY tablename;

--To execute VACUUM on a specific table, uncomment and modify:
--VACUUM ANALYZE ${item.schema}.table_name; `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop Schema`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop schema(BE CAREFUL!)
DROP SCHEMA ${item.schema}; --This will fail if schema is not empty

--To force drop schema and all objects:
--DROP SCHEMA ${item.schema} CASCADE; `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager, no need to close
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create schema operations notebook');
    }
}

/**
 * cmdRefreshSchema - Refreshes the schema item in the tree view.
 */
export async function cmdRefreshSchema(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}

export async function cmdShowSchemaProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            // Gather comprehensive schema information
            const [schemaInfo, objectsInfo, sizeInfo, privilegesInfo, dependenciesInfo, extensionsInfo] = await Promise.all([
                // Basic schema info
                client.query(`
                    SELECT 
                        n.nspname as schema_name,
                        pg_catalog.pg_get_userbyid(n.nspowner) as owner,
                        obj_description(n.oid, 'pg_namespace') as comment,
                        n.nspacl as acl
                    FROM pg_catalog.pg_namespace n
                    WHERE n.nspname = $1
                `, [item.schema]),
                
                // Object counts and details
                client.query(`
                    SELECT 
                        COUNT(*) FILTER (WHERE c.relkind = 'r') as table_count,
                        COUNT(*) FILTER (WHERE c.relkind = 'v') as view_count,
                        COUNT(*) FILTER (WHERE c.relkind = 'm') as matview_count,
                        COUNT(*) FILTER (WHERE c.relkind = 'S') as sequence_count,
                        COUNT(*) FILTER (WHERE c.relkind = 'f') as foreign_table_count,
                        COUNT(*) FILTER (WHERE c.relkind = 'p') as partitioned_table_count,
                        (SELECT COUNT(*) FROM pg_proc p WHERE p.pronamespace = n.oid) as function_count,
                        (SELECT COUNT(*) FROM pg_type t WHERE t.typnamespace = n.oid AND t.typtype = 'c') as type_count,
                        (SELECT COUNT(*) FROM pg_trigger t 
                         JOIN pg_class tc ON t.tgrelid = tc.oid 
                         WHERE tc.relnamespace = n.oid AND NOT t.tgisinternal) as trigger_count
                    FROM pg_namespace n
                    LEFT JOIN pg_class c ON c.relnamespace = n.oid
                    WHERE n.nspname = $1
                    GROUP BY n.oid
                `, [item.schema]),
                
                // Size information
                client.query(`
                    SELECT 
                        pg_size_pretty(sum(pg_total_relation_size(c.oid))) as total_size,
                        pg_size_pretty(sum(pg_relation_size(c.oid))) as table_size,
                        pg_size_pretty(sum(pg_indexes_size(c.oid))) as indexes_size,
                        count(distinct c.oid) as relation_count
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1 AND c.relkind IN ('r', 'i', 'm', 'S', 't')
                `, [item.schema]),
                
                // Privileges
                client.query(`
                    SELECT 
                        grantee,
                        string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) as privileges,
                        string_agg(DISTINCT 
                            CASE WHEN is_grantable = 'YES' THEN privilege_type || ' (grantable)' END, 
                            ', ') as grantable_privileges
                    FROM (
                        SELECT DISTINCT grantee, privilege_type, is_grantable
                        FROM information_schema.table_privileges
                        WHERE table_schema = $1
                        UNION
                        SELECT DISTINCT grantee, privilege_type, is_grantable
                        FROM information_schema.routine_privileges
                        WHERE routine_schema = $1
                        UNION
                        SELECT DISTINCT grantee, privilege_type, is_grantable
                        FROM information_schema.usage_privileges
                        WHERE object_schema = $1
                    ) p
                    GROUP BY grantee
                    ORDER BY grantee
                `, [item.schema]),
                
                // Dependencies (objects that depend on this schema)
                client.query(`
                    SELECT 
                        c.relname as object_name,
                        CASE c.relkind
                            WHEN 'r' THEN 'table'
                            WHEN 'v' THEN 'view'
                            WHEN 'm' THEN 'materialized view'
                            WHEN 'S' THEN 'sequence'
                            WHEN 'f' THEN 'foreign table'
                            WHEN 'p' THEN 'partitioned table'
                        END as object_type,
                        pg_size_pretty(pg_total_relation_size(c.oid)) as size
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1 
                    AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')
                    ORDER BY pg_total_relation_size(c.oid) DESC
                    LIMIT 10
                `, [item.schema]),
                
                // Extensions using this schema
                client.query(`
                    SELECT 
                        e.extname as extension_name,
                        e.extversion as version,
                        pg_catalog.pg_get_userbyid(e.extowner) as owner
                    FROM pg_extension e
                    JOIN pg_namespace n ON n.oid = e.extnamespace
                    WHERE n.nspname = $1
                `, [item.schema])
            ]);

            const schema = schemaInfo.rows[0];
            const objects = objectsInfo.rows[0] || {};
            const sizes = sizeInfo.rows[0];
            const privileges = privilegesInfo.rows;
            const topObjects = dependenciesInfo.rows;
            const extensions = extensionsInfo.rows;

            const metadata = createMetadata(connection, item.databaseName);

            // Build privileges HTML
            const privilegeRows = privileges.map(p => {
                return `    <tr>
        <td><strong>${p.grantee}</strong></td>
        <td>${p.privileges || '—'}</td>
        <td style="font-size: 10px;">${p.grantable_privileges || '—'}</td>
    </tr>`;
            }).join('\n');

            // Build top objects HTML
            const objectRows = topObjects.map(obj => {
                return `    <tr>
        <td><strong>${obj.object_name}</strong></td>
        <td>${obj.object_type}</td>
        <td>${obj.size}</td>
    </tr>`;
            }).join('\n');

            // Build extensions HTML
            const extensionRows = extensions.map(ext => {
                return `    <tr>
        <td><strong>${ext.extension_name}</strong></td>
        <td>${ext.version}</td>
        <td>${ext.owner}</td>
    </tr>`;
            }).join('\n');

            // Calculate total object count
            const totalObjects = (parseInt(objects.table_count) || 0) + 
                                (parseInt(objects.view_count) || 0) + 
                                (parseInt(objects.matview_count) || 0) + 
                                (parseInt(objects.sequence_count) || 0) + 
                                (parseInt(objects.foreign_table_count) || 0) + 
                                (parseInt(objects.partitioned_table_count) || 0) + 
                                (parseInt(objects.function_count) || 0) + 
                                (parseInt(objects.type_count) || 0);

            const ownerInfo = `${schema.owner} | <strong>Database:</strong> ${item.databaseName}${schema.comment ? ` | <strong>Comment:</strong> ${schema.comment}` : ''}`;
            const markdown = MarkdownUtils.header(`🗂️ Schema Properties: \`${item.schema}\``) +
                MarkdownUtils.infoBox(`<strong>Owner:</strong> ${ownerInfo}`) +
                `\n\n#### 💾 Size & Statistics\n\n` +
                MarkdownUtils.propertiesTable({
                    'Total Size': sizes.total_size || 'N/A',
                    'Table Size': sizes.table_size || 'N/A',
                    'Index Size': sizes.indexes_size || 'N/A',
                    'Total Objects': totalObjects.toLocaleString()
                }) +
                `\n\n#### 📦 Object Breakdown\n\n` +
                MarkdownUtils.propertiesTable({
                    '📊 Tables': `${objects.table_count || 0}`,
                    '📋 Views': `${objects.view_count || 0}`,
                    '📈 Materialized Views': `${objects.matview_count || 0}`,
                    '🔢 Sequences': `${objects.sequence_count || 0}`,
                    '🔗 Foreign Tables': `${objects.foreign_table_count || 0}`,
                    '📂 Partitioned Tables': `${objects.partitioned_table_count || 0}`,
                    '⚙️ Functions': `${objects.function_count || 0}`,
                    '🏷️ Types': `${objects.type_count || 0}`,
                    '⚡ Triggers': `${objects.trigger_count || 0}`
                });

                (topObjects.length > 0 ? `#### 📊 Largest Objects (Top 10)

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 40%;">Name</th>
        <th style="text-align: left; width: 30%;">Type</th>
        <th style="text-align: left;">Size</th>
    </tr>
${objectRows}
</table>

` : '') +
                (privileges.length > 0 ? `#### 🔐 Privileges & Permissions (${privileges.length} grantees)

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 25%;">Grantee</th>
        <th style="text-align: left; width: 40%;">Privileges</th>
        <th style="text-align: left;">Grantable</th>
    </tr>
${privilegeRows}
</table>

` : '') +
                (extensions.length > 0 ? `#### 🧩 Extensions in Schema

<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 40%;">Extension</th>
        <th style="text-align: left; width: 30%;">Version</th>
        <th style="text-align: left;">Owner</th>
    </tr>
${extensionRows}
</table>

` : '') +
                '---';

            const cells = [
                new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📋 List All Objects`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List all objects in schema with sizes
SELECT 
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        WHEN 's' THEN 'special'
        WHEN 'f' THEN 'foreign table'
        WHEN 'p' THEN 'partitioned table'
    END as object_type,
    c.relname as object_name,
    pg_size_pretty(pg_total_relation_size(quote_ident('${item.schema}') || '.' || quote_ident(c.relname))) as size,
    CASE WHEN c.relkind = 'r' THEN
        (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid)
    ELSE NULL END as estimated_row_count,
    pg_catalog.pg_get_userbyid(c.relowner) as owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '${item.schema}'
    AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')
ORDER BY pg_total_relation_size(c.oid) DESC NULLS LAST;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 CREATE SCHEMA Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Create schema (if recreating)
CREATE SCHEMA IF NOT EXISTS ${item.schema}
    AUTHORIZATION ${schema.owner};

-- Add comment
${schema.comment ? `COMMENT ON SCHEMA ${item.schema} IS '${schema.comment.replace(/'/g, "''")}';` : `-- COMMENT ON SCHEMA ${item.schema} IS 'schema description';`}

-- Grant basic privileges (modify as needed)
GRANT USAGE ON SCHEMA ${item.schema} TO PUBLIC;
-- GRANT CREATE ON SCHEMA ${item.schema} TO role_name;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔐 Schema Privileges`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- View all schema privileges
SELECT 
    nspname as schema_name,
    nspacl as access_control_list,
    pg_catalog.pg_get_userbyid(nspowner) as owner
FROM pg_namespace
WHERE nspname = '${item.schema}';

-- Grant privileges (modify as needed)
-- GRANT USAGE ON SCHEMA ${item.schema} TO role_name;
-- GRANT CREATE ON SCHEMA ${item.schema} TO role_name;
-- GRANT ALL ON SCHEMA ${item.schema} TO role_name;

-- Revoke privileges
-- REVOKE ALL ON SCHEMA ${item.schema} FROM role_name;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔍 Schema Dependencies`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Find all functions in schema
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = '${item.schema}'
ORDER BY p.proname;

-- Find all types in schema
SELECT 
    t.typname as type_name,
    CASE t.typtype
        WHEN 'b' THEN 'base'
        WHEN 'c' THEN 'composite'
        WHEN 'd' THEN 'domain'
        WHEN 'e' THEN 'enum'
        WHEN 'r' THEN 'range'
    END as type_kind
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = '${item.schema}'
    AND t.typtype IN ('c', 'd', 'e', 'r')
ORDER BY t.typname;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📊 Schema Statistics`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Schema-wide statistics
SELECT 
    schemaname,
    COUNT(*) as table_count,
    SUM(n_live_tup) as total_live_rows,
    SUM(n_dead_tup) as total_dead_rows,
    ROUND(100.0 * SUM(n_dead_tup) / NULLIF(SUM(n_live_tup + n_dead_tup), 0), 2) as dead_tuple_percent,
    MAX(last_vacuum) as last_vacuum_any_table,
    MAX(last_autovacuum) as last_autovacuum_any_table,
    MAX(last_analyze) as last_analyze_any_table
FROM pg_stat_user_tables
WHERE schemaname = '${item.schema}'
GROUP BY schemaname;

-- Table activity in schema
SELECT 
    relname as table_name,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes
FROM pg_stat_user_tables
WHERE schemaname = '${item.schema}'
ORDER BY (n_tup_ins + n_tup_upd + n_tup_del) DESC;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🗑️ DROP SCHEMA Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop schema (safe - fails if not empty)
-- DROP SCHEMA ${item.schema};

-- Drop schema with all objects (DANGEROUS!)
-- DROP SCHEMA ${item.schema} CASCADE;

-- Drop only if exists
-- DROP SCHEMA IF EXISTS ${item.schema} CASCADE;`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'show schema properties');
    }
}