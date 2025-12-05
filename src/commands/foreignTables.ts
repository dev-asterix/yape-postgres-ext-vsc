import * as vscode from 'vscode';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem } from '../commands/connection';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { ConnectionManager } from '../services/ConnectionManager';
import { 
    MarkdownUtils, 
    FormatHelpers, 
    ErrorHandlers, 
    SQL_TEMPLATES, 
    ObjectUtils
} from './helper';

/**
 * SQL Queries for foreign table operations
 */

/**
 * FOREIGN_TABLE_INFO_QUERY - Query to get foreign table details including columns, server, and options
 */
const FOREIGN_TABLE_INFO_QUERY = `
SELECT 
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default,
    fs.srvname as server_name,
    fto.ftoptions as options
FROM information_schema.columns c
JOIN pg_class pc ON pc.relname = c.table_name
JOIN pg_foreign_table ft ON ft.ftrelid = pc.oid
JOIN pg_foreign_server fs ON fs.oid = ft.ftserver
LEFT JOIN pg_foreign_table_options fto ON fto.ftrelid = ft.ftrelid
WHERE c.table_schema = $1
AND c.table_name = $2
ORDER BY c.ordinal_position`;

/**
 * FOREIGN_TABLE_DEF_QUERY - Query to get foreign table definition for editing
 */
const FOREIGN_TABLE_DEF_QUERY = `
SELECT 
    c.relname as table_name,
    fs.srvname as server_name,
    array_agg(
        format('%I %s%s', 
            a.attname, 
            format_type(a.atttypid, a.atttypmod),
            CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
        ) ORDER BY a.attnum
    ) as columns,
    ftoptions as options
FROM pg_class c
JOIN pg_foreign_table ft ON c.oid = ft.ftrelid
JOIN pg_foreign_server fs ON fs.oid = ft.ftserver
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
LEFT JOIN pg_foreign_table_options fto ON fto.ftrelid = ft.ftrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = $1
AND n.nspname = $2
GROUP BY c.relname, fs.srvname, ftoptions`;

/**
 * cmdAllForeignTableOperations - Command to create a notebook with all foreign table operations
 * @param {DatabaseTreeItem} item - The selected foreign table item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdForeignTableOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const result = await client.query(FOREIGN_TABLE_INFO_QUERY, [item.schema, item.label]);
            if (result.rows.length === 0) {
                throw new Error('Foreign table not found');
            }

            const serverName = result.rows[0].server_name;
            const options = result.rows[0].options || [];
            const columnDefinitions = result.rows.map(row =>
                `    ${row.column_name} ${row.data_type}${row.is_nullable === 'NO' ? ' NOT NULL' : ''}${row.column_default ? ' DEFAULT ' + row.column_default : ''}`
            ).join(',\n');

            const createTableStatement = `CREATE FOREIGN TABLE ${item.schema}.${item.label} (\n${columnDefinitions}\n) SERVER ${serverName}${options.length > 0 ? '\nOPTIONS (' + options.map((opt: any) => `${opt}`).join(', ') + ')' : ''};`;
            const metadata = createMetadata(connection, item.databaseName);

            const markdown = MarkdownUtils.header(`🔗 Foreign Table Operations: \`${item.schema}.${item.label}\``) +
                MarkdownUtils.infoBox('This notebook contains operations for managing the PostgreSQL foreign table. Run the cells below to execute the operations.') +
                `\n\n#### 🎯 Available Operations\n\n` +
                MarkdownUtils.operationsTable([
                    { operation: '<strong>View Definition</strong>', description: 'Show the CREATE FOREIGN TABLE statement' },
                    { operation: '<strong>Query Data</strong>', description: 'Select the first 100 rows' },
                    { operation: '<strong>Edit Table</strong>', description: 'Template for modifying the table (requires recreation)' },
                    { operation: '<strong>Drop Table</strong>', description: 'Delete the table (Warning: Irreversible)' }
                ]);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    markdown,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Table Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Current table definition\n${createTableStatement}`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📖 Query Data`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Query data
SELECT *
FROM ${item.schema}.${item.label}
LIMIT 100;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ✏️ Edit Table`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Edit table (requires dropping and recreating)
DROP FOREIGN TABLE IF EXISTS ${item.schema}.${item.label};

CREATE FOREIGN TABLE ${item.schema}.${item.label} (
    -- Define columns here
    column_name data_type
) SERVER server_name
OPTIONS (
    schema_name 'remote_schema',
    table_name 'remote_table'
);`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop Foreign Table`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop table
DROP FOREIGN TABLE IF EXISTS ${item.schema}.${item.label};`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create foreign table operations notebook');
    }
}

/**
 * cmdEditForeignTable - Command to create a notebook for editing a foreign table
 * @param {DatabaseTreeItem} item - The selected foreign table item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdEditForeignTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const result = await client.query(FOREIGN_TABLE_DEF_QUERY, [item.label, item.schema]);
            if (result.rows.length === 0) {
                throw new Error('Foreign table not found');
            }

            const tableInfo = result.rows[0];
            const createStatement = `CREATE FOREIGN TABLE ${item.schema}.${item.label} (\n${tableInfo.columns.map((col: string) => '    ' + col).join(',\n')}\n) SERVER ${tableInfo.server_name}${tableInfo.options ? '\nOPTIONS (\n    ' + tableInfo.options.map((opt: string) => opt).join(',\n    ') + '\n)' : ''};`;
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`✏️ Edit Foreign Table: \`${item.schema}.${item.label}\``) +
                    MarkdownUtils.infoBox('Modify the foreign table definition below and execute the cells to update it.'),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Table Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop existing foreign table
DROP FOREIGN TABLE IF EXISTS ${item.schema}.${item.label};

-- Create foreign table with new definition
${createStatement}`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create foreign table edit notebook');
    }
}

/**
 * cmdRefreshForeignTable - Refreshes the foreign table item in the tree view.
 */
export async function cmdRefreshForeignTable(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}

/**
 * cmdCreateForeignTable - Command to create a new foreign table in the database.
 */
export async function cmdCreateForeignTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const schemaName = item.schema || 'public';

        const markdown = MarkdownUtils.header(`➕ Create New Foreign Table in Schema: \`${schemaName}\``) +
            MarkdownUtils.infoBox('This notebook provides templates for creating foreign tables. Modify the templates below and execute to create foreign tables.') +
            `\n\n#### 📋 Foreign Table Design Guidelines\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '<strong>Server Setup</strong>', description: 'Foreign tables require a foreign server. Create one using CREATE SERVER before creating the table.' },
                { operation: '<strong>Column Mapping</strong>', description: 'Map local columns to remote columns. Data types should be compatible.' },
                { operation: '<strong>Options</strong>', description: 'Use OPTIONS to specify remote schema, table name, and other connection parameters.' },
                { operation: '<strong>Permissions</strong>', description: 'Ensure user has USAGE privilege on the foreign server and appropriate permissions on the remote database.' },
                { operation: '<strong>Performance</strong>', description: 'Foreign tables can be slower than local tables. Consider materialized views for frequently accessed data.' }
            ]) +
            `\n\n#### 🏷️ Common Foreign Table Patterns\n\n` +
            MarkdownUtils.propertiesTable({
                'Remote PostgreSQL': 'Connect to another PostgreSQL database',
                'Remote MySQL': 'Connect to MySQL/MariaDB database',
                'Remote SQL Server': 'Connect to Microsoft SQL Server',
                'File-based': 'Access CSV or other file-based data sources',
                'Custom FDW': 'Use custom Foreign Data Wrapper extensions'
            }) +
            MarkdownUtils.successBox('Foreign tables provide transparent access to remote data sources. They are read-only by default but can support writes with appropriate FDW support.') +
            `\n\n---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Basic Foreign Table (Recommended Start)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create foreign server first (if not exists)
CREATE SERVER foreign_server_name
FOREIGN DATA WRAPPER postgres_fdw
OPTIONS (
    host 'remote_host',
    port '5432',
    dbname 'remote_database'
);

-- Create user mapping
CREATE USER MAPPING FOR CURRENT_USER
SERVER foreign_server_name
OPTIONS (
    user 'remote_user',
    password 'remote_password'
);

-- Create foreign table
CREATE FOREIGN TABLE ${schemaName}.foreign_table_name (
    id integer,
    name text,
    created_at timestamp
)
SERVER foreign_server_name
OPTIONS (
    schema_name 'remote_schema',
    table_name 'remote_table'
);

-- Add comment
COMMENT ON FOREIGN TABLE ${schemaName}.foreign_table_name IS 'Foreign table description';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔗 PostgreSQL-to-PostgreSQL`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Enable postgres_fdw extension
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- Create foreign server
CREATE SERVER remote_postgres_server
FOREIGN DATA WRAPPER postgres_fdw
OPTIONS (
    host '192.168.1.100',
    port '5432',
    dbname 'remote_db'
);

-- Create user mapping
CREATE USER MAPPING FOR CURRENT_USER
SERVER remote_postgres_server
OPTIONS (
    user 'remote_user',
    password 'remote_password'
);

-- Create foreign table
CREATE FOREIGN TABLE ${schemaName}.remote_table (
    id serial,
    name varchar(100),
    email varchar(255),
    created_at timestamptz DEFAULT now()
)
SERVER remote_postgres_server
OPTIONS (
    schema_name 'public',
    table_name 'users'
);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 File-based Foreign Table (file_fdw)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Enable file_fdw extension
CREATE EXTENSION IF NOT EXISTS file_fdw;

-- Create foreign server
CREATE SERVER file_server
FOREIGN DATA WRAPPER file_fdw;

-- Create foreign table for CSV file
CREATE FOREIGN TABLE ${schemaName}.csv_data (
    id integer,
    name text,
    value numeric,
    date date
)
SERVER file_server
OPTIONS (
    filename '/path/to/data.csv',
    format 'csv',
    header 'true'
);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔍 Query Foreign Table`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Query foreign table (works like regular table)
SELECT * FROM ${schemaName}.foreign_table_name
WHERE condition
LIMIT 100;

-- Join with local tables
SELECT 
    lt.local_column,
    ft.remote_column
FROM local_table lt
JOIN ${schemaName}.foreign_table_name ft ON lt.id = ft.id;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🛠️ Manage Foreign Server`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- List foreign servers
SELECT 
    srvname as server_name,
    srvoptions as options
FROM pg_foreign_server;

-- List user mappings
SELECT 
    um.srvname as server_name,
    um.usename as user_name,
    um.umoptions as options
FROM pg_user_mappings um;

-- Drop user mapping
-- DROP USER MAPPING FOR CURRENT_USER SERVER foreign_server_name;

-- Drop foreign server
-- DROP SERVER foreign_server_name CASCADE;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.warningBox('Foreign tables require proper network connectivity and authentication. Ensure firewall rules allow connections and credentials are correct. Performance may vary based on network latency.'),
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create foreign table notebook');
    }
}