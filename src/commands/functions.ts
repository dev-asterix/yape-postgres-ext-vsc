import * as vscode from 'vscode';

import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
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
import { FunctionSQL } from './sql';



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
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;


    const functionResult = await client.query(QueryBuilder.functionInfo(item.schema!, item.label));
    if (functionResult.rows.length === 0) {
      throw new Error('Function not found');
    }

    const functionInfo = functionResult.rows[0];

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`⚡ Function Operations: \`${item.schema}.${item.label}\``) +
        (functionInfo.description ? MarkdownUtils.infoBox(`<strong>Description:</strong> ${functionInfo.description}`) : '') +
        MarkdownUtils.infoBox('This notebook contains common operations for the PostgreSQL function. Run the cells below to execute the operations.') +
        `\n\n#### 🎯 Available Operations\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '📝 View Definition', description: 'Show the current function code' },
          { operation: '📞 Call Function', description: 'Template for executing the function' },
          { operation: '❌ Drop', description: 'Delete the function (Warning: Irreversible)' }
        ])
      )
      .addMarkdown('##### 📝 Function Definition')
      .addSql(`-- Current function definition\n${functionInfo.definition} `)
      .addMarkdown('##### 📞 Call Function')
      .addSql(`-- Call function\nSELECT ${item.schema}.${item.label} (${functionInfo.arguments ?
        '\n  -- Replace with actual values:\n  ' + functionInfo.arguments.split(',').join(',\n  ')
        : ''
        }); `)
      .addMarkdown('##### ❌ Drop Function')
      .addSql(SQL_TEMPLATES.DROP.FUNCTION(item.schema!, item.label, functionInfo.arguments || ''))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create function operations notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
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
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;


    const functionResult = await client.query(QueryBuilder.functionDefinition(item.schema!, item.label));
    if (functionResult.rows.length === 0) {
      throw new Error('Function not found');
    }

    const functionInfo = functionResult.rows[0];

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`✏️ Edit Function: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.infoBox('Modify the function definition below and execute the cell to update the function.')
      )
      .addMarkdown('##### 📝 Function Definition')
      .addSql(functionInfo.definition)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create function edit notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
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
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;


    const functionResult = await client.query(QueryBuilder.functionSignature(item.schema!, item.label));
    if (functionResult.rows.length === 0) {
      throw new Error('Function not found');
    }

    const functionInfo = functionResult.rows[0];

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`📞 Call Function: \`${item.schema}.${item.label}\``) +
        (functionInfo.description ? MarkdownUtils.infoBox(`<strong>Description:</strong> ${functionInfo.description}`) : '') +
        `\n\n` +
        MarkdownUtils.propertiesTable({
          'Arguments': functionInfo.arguments ? `<code>${functionInfo.arguments}</code>` : 'None',
          'Returns': `<code>${functionInfo.result_type}</code>`
        }) +
        MarkdownUtils.infoBox('Edit the argument values below and execute the cell to call the function.')
      )
      .addMarkdown('##### 📞 Execution')
      .addSql(`-- Call function\nSELECT ${item.schema}.${item.label} (${functionInfo.arguments ?
        '\n  -- Replace with actual values:\n  ' + functionInfo.arguments.split(',').join(',\n  ')
        : ''
        }); `)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create function call notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
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
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;


    const functionResult = await client.query(QueryBuilder.functionArguments(item.schema!, item.label));
    if (functionResult.rows.length === 0) {
      throw new Error('Function not found');
    }

    const functionInfo = functionResult.rows[0];

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`❌ Drop Function: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.dangerBox('This action will permanently delete the function. This operation cannot be undone.')
      )
      .addMarkdown('##### ❌ Drop Command')
      .addSql(SQL_TEMPLATES.DROP.FUNCTION(item.schema!, item.label, functionInfo.arguments || ''))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create drop function notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
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
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;


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

    // Parse arguments for display
    const argsList = func.arguments ? func.arguments.split(',').map((arg: string, idx: number) => {
      const trimmed = arg.trim();
      return `    <tr>
        <td>${idx + 1}</td>
        <td><code>${trimmed || '(no arguments)'}</code></td>
    </tr>`;
    }).join('\n') : '    <tr><td colspan="2" style="text-align: center;">No arguments</td></tr>';

    // Build dependencies table HTML
    const dependencyRows = dependents.map((dep: any) => {
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

    await new NotebookBuilder(metadata)
      .addMarkdown(markdown)
      .addMarkdown('##### 📝 Function Definition')
      .addSql(func.definition)
      .addMarkdown('##### ⚡ Call Function')
      .addSql(`-- Call function\nSELECT ${item.schema}.${item.label}(${func.arguments ? func.arguments.split(',').map((arg: string, idx: number) => {
        const parts = arg.trim().split(' ');
        const type = parts[parts.length - 1];
        if (type.includes('int')) return `${idx + 1}`;
        if (type.includes('text') || type.includes('char') || type.includes('varchar')) return `'value${idx + 1}'`;
        if (type.includes('bool')) return 'true';
        if (type.includes('date')) return `'2024-01-01'`;
        if (type.includes('timestamp')) return `'2024-01-01 00:00:00'`;
        return `'value${idx + 1}'`;
      }).join(', ') : ''});`)
      .addMarkdown('##### 🗑️ DROP Function Script')
      .addSql(`${SQL_TEMPLATES.DROP.FUNCTION(item.schema!, item.label, func.arguments || '')}\n\n-- Drop function (with dependencies)\n-- DROP FUNCTION IF EXISTS ${item.schema}.${item.label}(${func.arguments || ''}) CASCADE;\n\n-- Drop function (without dependencies - will fail if referenced)\n-- DROP FUNCTION IF EXISTS ${item.schema}.${item.label}(${func.arguments || ''}) RESTRICT;`)
      .addMarkdown('##### 📊 Function Statistics')
      .addSql(FunctionSQL.metadata(item.schema!, item.label))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show function properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
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
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
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

    await new NotebookBuilder(metadata)
      .addMarkdown(markdown)
      .addMarkdown('##### 📝 Basic SQL Function (Recommended Start)')
      .addSql(FunctionSQL.create.sqlFunction(schema))
      .addMarkdown('##### 🔧 PL/pgSQL Function (With Logic)')
      .addSql(FunctionSQL.create.plpgsqlFunction(schema))
      .addMarkdown('##### 🔄 Function Returning Table')
      .addSql(FunctionSQL.create.tableFunction(schema))
      .addMarkdown('##### 🔒 Security Definer Function')
      .addSql(FunctionSQL.create.securityDefiner(schema))
      .addMarkdown('##### ⚡ Trigger Function')
      .addSql(FunctionSQL.create.triggerFunction(schema))
      .addMarkdown('##### 📊 Aggregate Function')
      .addSql(FunctionSQL.create.aggregateFunction(schema))
      .addMarkdown(MarkdownUtils.warningBox('After creating a function, remember to: 1) Test with sample inputs, 2) Grant appropriate EXECUTE permissions, 3) Document parameters and return values, 4) Consider performance implications of volatility settings.'))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create function notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}