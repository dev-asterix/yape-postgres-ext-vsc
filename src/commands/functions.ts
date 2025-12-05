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
    ObjectUtils
} from './helper';

/**
 * Queries for PostgreSQL database
 */

/**
 * FUNCTION_INFO_QUERY - Query to get function details
 * fetches - function name, arguments, result type, definition, and description
 * from pg_proc and pg_description tables
 * where function name and namespace are provided as parameters
 */
const FUNCTION_INFO_QUERY = `
SELECT p.proname,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type,
    pg_get_functiondef(p.oid) as definition,
    d.description
FROM pg_proc p
LEFT JOIN pg_description d ON p.oid = d.objoid
WHERE p.proname = $1
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

/**
 * FUNCTION_DEF_QUERY - Query to get function definition
 * fetches - function definition from pg_proc table
 * where function name and namespace are provided as parameters
 */
const FUNCTION_DEF_QUERY = `
SELECT pg_get_functiondef(p.oid) as definition
FROM pg_proc p
WHERE p.proname = $1
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

/**
 * FUNCTION_SIGN_QUERY - Query to get function signature to perform function call
 * fetches - function name, arguments, result type, and description
 * from pg_proc and pg_description tables
 * where function name and namespace are provided as parameters
 * This query is used to get the function signature for function call
*/
const FUNCTION_SIGN_QUERY = `
SELECT p.proname,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type,
    d.description
FROM pg_proc p
LEFT JOIN pg_description d ON p.oid = d.objoid
WHERE p.proname = $1
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

/**
 * FUNCTION_ARGS_QUERY - Query to get function arguments
 * fetches - function arguments from pg_proc table
 * where function name and namespace are provided as parameters
 * This query is used to get the function arguments for drop function
 * It is used to get the function arguments for drop function
 */
const FUNCTION_ARGS_QUERY = `
SELECT pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
WHERE p.proname = $1
AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`;

/**
 * This function creates a notebook with common operations for a PostgreSQL function.
 * It retrieves the function's definition, arguments, and description from the database,
 * and generates a notebook with cells for viewing the function definition, calling the function,
 * and dropping the function.
 *
 * @param {DatabaseTreeItem} item - The selected function item from the tree view.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdFunctionOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const functionResult = await client.query(FUNCTION_INFO_QUERY, [item.label, item.schema]);
            if (functionResult.rows.length === 0) {
                throw new Error('Function not found');
            }

            const functionInfo = functionResult.rows[0];
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`⚡ Function Operations: \`${item.schema}.${item.label}\``) +
                    (functionInfo.description ? MarkdownUtils.infoBox(`<strong>Description:</strong> ${functionInfo.description}`) : '') +
                    MarkdownUtils.infoBox('This notebook contains common operations for the PostgreSQL function. Run the cells below to execute the operations.') +
                    `\n\n#### 🎯 Available Operations\n\n` +
                    MarkdownUtils.operationsTable([
                        { operation: '📝 View Definition', description: 'Show the current function code' },
                        { operation: '📞 Call Function', description: 'Template for executing the function' },
                        { operation: '❌ Drop', description: 'Delete the function (Warning: Irreversible)' }
                    ]),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Function Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Current function definition\n${functionInfo.definition} `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📞 Call Function`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Call function\nSELECT ${item.schema}.${item.label} (${functionInfo.arguments ?
                        '\n  -- Replace with actual values:\n  ' + functionInfo.arguments.split(',').join(',\n  ')
                        : ''
                    }); `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop Function`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    SQL_TEMPLATES.DROP.FUNCTION(item.schema!, item.label, functionInfo.arguments || ''),
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create function operations notebook');
    }
}

/**
 * This function creates a notebook for replacing a PostgreSQL function.
 * It retrieves the function's definition from the database and generates a notebook
 * with a cell for editing the function definition.
 *
 * @param {DatabaseTreeItem} item - The selected function item from the tree view.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdEditFunction(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const functionResult = await client.query(FUNCTION_DEF_QUERY, [item.label, item.schema]);
            if (functionResult.rows.length === 0) {
                throw new Error('Function not found');
            }

            const functionInfo = functionResult.rows[0];
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`✏️ Edit Function: \`${item.schema}.${item.label}\``) +
                    MarkdownUtils.infoBox('Modify the function definition below and execute the cell to update the function.'),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📝 Function Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    functionInfo.definition,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create function edit notebook');
    }
}

/**
 * This function creates a notebook for calling a PostgreSQL function.
 * It retrieves the function's arguments and result type from the database
 * and generates a notebook with a cell for calling the function.
 *
 * @param {DatabaseTreeItem} item - The selected function item from the tree view.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdCallFunction(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const functionResult = await client.query(FUNCTION_SIGN_QUERY, [item.label, item.schema]);
            if (functionResult.rows.length === 0) {
                throw new Error('Function not found');
            }

            const functionInfo = functionResult.rows[0];
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`📞 Call Function: \`${item.schema}.${item.label}\``) +
                    (functionInfo.description ? MarkdownUtils.infoBox(`<strong>Description:</strong> ${functionInfo.description}`) : '') +
                    `\n\n` +
                    MarkdownUtils.propertiesTable({
                        'Arguments': functionInfo.arguments ? `<code>${functionInfo.arguments}</code>` : 'None',
                        'Returns': `<code>${functionInfo.result_type}</code>`
                    }) +
                    MarkdownUtils.infoBox('Edit the argument values below and execute the cell to call the function.'),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📞 Execution`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Call function\nSELECT ${item.schema}.${item.label} (${functionInfo.arguments ?
                        '\n  -- Replace with actual values:\n  ' + functionInfo.arguments.split(',').join(',\n  ')
                        : ''
                    }); `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create function call notebook');
    }
}

/**
 * This function creates a notebook for dropping a PostgreSQL function.
 * It generates a notebook with a cell for dropping the function.
 *
 * @param {DatabaseTreeItem} item - The selected function item from the tree view.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdDropFunction(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            const functionResult = await client.query(FUNCTION_ARGS_QUERY, [item.label, item.schema]);
            if (functionResult.rows.length === 0) {
                throw new Error('Function not found');
            }

            const functionInfo = functionResult.rows[0];
            const metadata = createMetadata(connection, item.databaseName);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`❌ Drop Function: \`${item.schema}.${item.label}\``) +
                    MarkdownUtils.dangerBox('This action will permanently delete the function. This operation cannot be undone.'),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop Command`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    SQL_TEMPLATES.DROP.FUNCTION(item.schema!, item.label, functionInfo.arguments || ''),
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create drop function notebook');
    }
}

/**
 * This function shows the properties of a PostgreSQL function in a panel.
 * It retrieves the function's details from the database and displays them in a table.
 * 
 * @param {DatabaseTreeItem} item - The selected function item from the tree view.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdShowFunctionProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
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
            // Gather comprehensive function information
            const [functionInfo, dependenciesInfo] = await Promise.all([
                // Detailed function info
                client.query(`
                    SELECT 
                        p.proname as function_name,
                        n.nspname as schema_name,
                        pg_get_userbyid(p.proowner) as owner,
                        l.lanname as language,
                        pg_get_function_arguments(p.oid) as arguments,
                        pg_get_function_result(p.oid) as return_type,
                        pg_get_functiondef(p.oid) as definition,
                        obj_description(p.oid, 'pg_proc') as comment,
                        CASE p.provolatile
                            WHEN 'i' THEN 'IMMUTABLE'
                            WHEN 's' THEN 'STABLE'
                            WHEN 'v' THEN 'VOLATILE'
                        END as volatility,
                        CASE p.proparallel
                            WHEN 's' THEN 'SAFE'
                            WHEN 'r' THEN 'RESTRICTED'
                            WHEN 'u' THEN 'UNSAFE'
                        END as parallel,
                        p.prosecdef as security_definer,
                        p.proisstrict as strict,
                        p.proretset as returns_set,
                        pg_size_pretty(pg_relation_size(p.oid)) as size
                    FROM pg_proc p
                    JOIN pg_namespace n ON n.oid = p.pronamespace
                    LEFT JOIN pg_language l ON l.oid = p.prolang
                    WHERE n.nspname = $1 AND p.proname = $2
                `, [item.schema, item.label]),
                
                // Get objects that depend on this function
                client.query(`
                    SELECT DISTINCT
                        dependent_ns.nspname as schema,
                        dependent_view.relname as name,
                        dependent_view.relkind as kind
                    FROM pg_depend dep
                    JOIN pg_rewrite rew ON dep.objid = rew.oid
                    JOIN pg_class dependent_view ON rew.ev_class = dependent_view.oid
                    JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
                    WHERE dep.refobjid = (
                        SELECT p.oid FROM pg_proc p
                        JOIN pg_namespace n ON n.oid = p.pronamespace
                        WHERE n.nspname = $1 AND p.proname = $2
                    )
                    ORDER BY schema, name
                `, [item.schema, item.label])
            ]);

            if (functionInfo.rows.length === 0) {
                throw new Error('Function not found');
            }

            const func = functionInfo.rows[0];
            const dependents = dependenciesInfo.rows;
            const metadata = createMetadata(connection, item.databaseName);


            // Parse arguments for display
            const argsList = func.arguments ? func.arguments.split(',').map((arg: string, idx: number) => {
                const trimmed = arg.trim();
                return `    <tr>
        <td>${idx + 1}</td>
        <td><code>${trimmed || '(no arguments)'}</code></td>
    </tr>`;
            }).join('\n') : '    <tr><td colspan="2" style="text-align: center;">No arguments</td></tr>';

            // Build dependencies table HTML
            const dependencyRows = dependents.map(dep => {
                return `    <tr>
        <td>${ObjectUtils.getKindLabel(dep.kind)}</td>
        <td><code>${dep.schema}.${dep.name}</code></td>
    </tr>`;
            }).join('\n');

            const ownerInfo = `${func.owner} | <strong>Language:</strong> ${func.language}${func.comment ? ` | <strong>Comment:</strong> ${func.comment}` : ''}`;
            const markdown = MarkdownUtils.header(`⚡ Function Properties: \`${item.schema}.${item.label}\``) +
                MarkdownUtils.infoBox(`<strong>Owner:</strong> ${ownerInfo}`) +
                `\n\n#### 📊 General Information\n\n` +
                MarkdownUtils.propertiesTable({
                    'Schema': func.schema_name,
                    'Function Name': func.function_name,
                    'Owner': func.owner,
                    'Language': func.language,
                    'Return Type': `<code>${func.return_type}</code>`,
                    'Returns Set': FormatHelpers.formatBoolean(func.returns_set, 'Yes', 'No'),
                    'Volatility': func.volatility,
                    'Parallel Safety': func.parallel,
                    'Security': func.security_definer ? '🔒 SECURITY DEFINER' : '👤 SECURITY INVOKER',
                    'Strict (NULL handling)': func.strict ? '✅ Returns NULL on NULL input' : '🚫 Processes NULL inputs'
                }) +
                `\n\n#### 📥 Arguments${func.arguments ? ' (' + func.arguments.split(',').length + ')' : ' (0)'}\n\n` +
                `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr>
        <th style="text-align: left; width: 10%;">#</th>
        <th style="text-align: left;">Argument</th>
    </tr>
${argsList}
</table>

` +
                (dependents.length > 0 ? `#### 🔄 Dependent Objects (${dependents.length})

${MarkdownUtils.infoBox('Objects that depend on this function:', 'Info')}

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
                    `##### 📝 Function Definition`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    func.definition,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ⚡ Call Function`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Call function\nSELECT ${item.schema}.${item.label}(${func.arguments ? func.arguments.split(',').map((arg: string, idx: number) => {
                        const parts = arg.trim().split(' ');
                        const type = parts[parts.length - 1];
                        if (type.includes('int')) return `${idx + 1}`;
                        if (type.includes('text') || type.includes('char') || type.includes('varchar')) return `'value${idx + 1}'`;
                        if (type.includes('bool')) return 'true';
                        if (type.includes('date')) return `'2024-01-01'`;
                        if (type.includes('timestamp')) return `'2024-01-01 00:00:00'`;
                        return `'value${idx + 1}'`;
                    }).join(', ') : ''});`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🗑️ DROP Function Script`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `${SQL_TEMPLATES.DROP.FUNCTION(item.schema!, item.label, func.arguments || '')}

-- Drop function (with dependencies)
-- DROP FUNCTION IF EXISTS ${item.schema}.${item.label}(${func.arguments || ''}) CASCADE;

-- Drop function (without dependencies - will fail if referenced)
-- DROP FUNCTION IF EXISTS ${item.schema}.${item.label}(${func.arguments || ''}) RESTRICT;`,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📊 Function Statistics`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Get function details and metadata
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type,
    l.lanname as language,
    CASE p.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'
        WHEN 'v' THEN 'VOLATILE'
    END as volatility,
    p.prosecdef as security_definer,
    p.proisstrict as strict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = '${item.schema}' AND p.proname = '${item.label}';`,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Do not close shared client
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'show function properties');
    }
}

/**
 * cmdRefreshFunction - Refreshes the function item in the tree view.
 */
export async function cmdRefreshFunction(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}

/**
 * cmdCreateFunction - Command to create a new function in the database.
 */
export async function cmdCreateFunction(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connection = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connection, item.databaseName);

        const schema = item.schema!;

        const markdown = MarkdownUtils.header(`➕ Create New Function in Schema: \`${schema}\``) +
            MarkdownUtils.infoBox('This notebook provides templates for creating functions. Modify the templates below and execute to create functions.') +
            `\n\n#### 📋 Function Design Guidelines\n\n` +
            MarkdownUtils.operationsTable([
                { operation: '<strong>Naming</strong>', description: 'Use snake_case for function names (e.g., calculate_total, get_user_by_id)' },
                { operation: '<strong>Language</strong>', description: 'Choose appropriate language: SQL, PL/pgSQL, PL/Python, etc.' },
                { operation: '<strong>Volatility</strong>', description: 'Mark as IMMUTABLE, STABLE, or VOLATILE based on behavior' },
                { operation: '<strong>Security</strong>', description: 'Use SECURITY DEFINER carefully - runs with function owner privileges' },
                { operation: '<strong>Performance</strong>', description: 'IMMUTABLE functions can be optimized better by query planner' }
            ]) +
            `\n\n#### 🏷️ Common Function Patterns\n\n` +
            MarkdownUtils.propertiesTable({
                'SQL Function': 'Simple functions written in SQL',
                'PL/pgSQL Function': 'Procedural language with variables and control flow',
                'Aggregate Function': 'Functions that operate on sets of rows',
                'Window Function': 'Functions that operate on window frames',
                'Trigger Function': 'Functions called automatically by triggers',
                'Security Function': 'Functions with SECURITY DEFINER for privilege escalation'
            }) +
            MarkdownUtils.successBox('Use CREATE OR REPLACE to update existing functions. Functions are schema-scoped objects.') +
            `\n\n---`;

        const cells = [
            new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdown, 'markdown'),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📝 Basic SQL Function (Recommended Start)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create simple SQL function
CREATE OR REPLACE FUNCTION ${schema}.function_name(param1 integer, param2 text)
RETURNS text AS $$
    SELECT 'Result: ' || param2 || ' with value ' || param1::text;
$$ LANGUAGE sql IMMUTABLE;

-- Add comment
COMMENT ON FUNCTION ${schema}.function_name(integer, text) IS 'Function description';`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔧 PL/pgSQL Function (With Logic)`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Create PL/pgSQL function with variables and control flow
CREATE OR REPLACE FUNCTION ${schema}.calculate_total(order_id integer)
RETURNS numeric AS $$
DECLARE
    total_amount numeric := 0;
    item_record record;
BEGIN
    FOR item_record IN 
        SELECT price, quantity 
        FROM ${schema}.order_items 
        WHERE order_id = calculate_total.order_id
    LOOP
        total_amount := total_amount + (item_record.price * item_record.quantity);
    END LOOP;
    
    RETURN total_amount;
END;
$$ LANGUAGE plpgsql STABLE;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔄 Function Returning Table`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Function that returns a table (set of rows)
CREATE OR REPLACE FUNCTION ${schema}.get_user_orders(user_id integer)
RETURNS TABLE (
    order_id integer,
    order_date timestamp,
    total_amount numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.created_at,
        o.total_amount
    FROM ${schema}.orders o
    WHERE o.user_id = get_user_orders.user_id
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 🔒 Security Definer Function`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Function that runs with owner's privileges (use carefully!)
CREATE OR REPLACE FUNCTION ${schema}.admin_delete_user(user_id integer)
RETURNS boolean AS $$
BEGIN
    -- This function runs with the privileges of the function owner
    DELETE FROM ${schema}.users WHERE id = user_id;
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to specific roles only
-- GRANT EXECUTE ON FUNCTION ${schema}.admin_delete_user(integer) TO admin_role;`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### ⚡ Trigger Function`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Function for triggers (returns trigger type)
CREATE OR REPLACE FUNCTION ${schema}.update_modified_timestamp()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to use this function
-- CREATE TRIGGER set_updated_at
--     BEFORE UPDATE ON ${schema}.table_name
--     FOR EACH ROW
--     EXECUTE FUNCTION ${schema}.update_modified_timestamp();`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                `##### 📊 Aggregate Function`,
                'markdown'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Code,
                `-- Custom aggregate function
CREATE OR REPLACE FUNCTION ${schema}.sum_state(state numeric, value numeric)
RETURNS numeric AS $$
BEGIN
    RETURN COALESCE(state, 0) + COALESCE(value, 0);
END;
$$ LANGUAGE plpgsql;

CREATE AGGREGATE ${schema}.safe_sum(numeric) (
    SFUNC = ${schema}.sum_state,
    STYPE = numeric,
    INITCOND = 0
);`,
                'sql'
            ),
            new vscode.NotebookCellData(
                vscode.NotebookCellKind.Markup,
                MarkdownUtils.warningBox('After creating a function, remember to: 1) Test with sample inputs, 2) Grant appropriate EXECUTE permissions, 3) Document parameters and return values, 4) Consider performance implications of volatility settings.'),
                'markdown'
            )
        ];

        await createAndShowNotebook(cells, metadata);
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create function notebook');
    }
}