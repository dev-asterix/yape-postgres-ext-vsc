import * as vscode from 'vscode';

import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import { CommandBase } from '../common/commands/CommandBase';
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
import { ViewSQL } from './sql';

/**
 * SQL query to get the view definition from PostgreSQL.
 */




/**
 * cmdScriptSelect - Command to generate a SELECT script for a view
 */
export async function cmdScriptSelect(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  await CommandBase.run(context, item, 'create SELECT script', async (conn: any, client: any, metadata: any) => {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`📖 SELECT Script: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.infoBox('Execute the query below to retrieve data from the view.')
      )
      .addSql(`SELECT * FROM ${item.schema}.${item.label} LIMIT 100;`)
      .show();
  });
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
  await CommandBase.run(context, item, 'create view edit notebook', async (conn: any, client: any, metadata: any) => {
    const viewResult = await client.query(QueryBuilder.viewDefinition(item.schema!, item.label));
    if (!viewResult.rows[0]?.definition) {
      throw new Error('View definition not found');
    }

    const createViewStatement = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition} `;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`✏️ Edit View: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.infoBox('Modify the view definition below and execute the cell to update the view.')
      )
      .addMarkdown('##### 📝 View Definition')
      .addSql(createViewStatement)
      .show();
  });
}

/**
 * viewViewDataCmd - Command to view data from a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdViewData(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  await CommandBase.run(context, item, 'create view data notebook', async (conn: any, client: any, metadata: any) => {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`📖 View Data: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.infoBox('Modify the query below to filter or transform the data as needed.')
      )
      .addMarkdown('##### 📖 Query Data')
      .addSql(ViewSQL.viewData(item.schema!, item.label))
      .show();
  });
}

/**
 * viewDropCmd - Command to drop a PostgreSQL view in a notebook.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdDropView(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  await CommandBase.run(context, item, 'create drop view notebook', async (conn: any, client: any, metadata: any) => {
    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`❌ Drop View: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.dangerBox('This action will permanently delete the view. This operation cannot be undone.')
      )
      .addMarkdown('##### ❌ Drop Command')
      .addSql(SQL_TEMPLATES.DROP.VIEW(item.schema!, item.label))
      .show();
  });
}

/**
 * viewOperationsCmd - Command to create a notebook for common operations on a PostgreSQL view.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the notebook is created and displayed.
 */
export async function cmdViewOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  await CommandBase.run(context, item, 'create view operations notebook', async (conn: any, client: any, metadata: any) => {
    const viewResult = await client.query(QueryBuilder.viewDefinition(item.schema!, item.label));
    if (!viewResult.rows[0]?.definition) {
      throw new Error('View definition not found');
    }

    // Get column information
    const columnsResult = await client.query(QueryBuilder.columns(item.schema!, item.label));
    const columns = columnsResult.rows;

    const viewDefinition = `CREATE OR REPLACE VIEW ${item.schema}.${item.label} AS\n${viewResult.rows[0].definition} `;

    await new NotebookBuilder(metadata)
      .addMarkdown(
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
        ])
      )
      .addMarkdown('##### 📋 View Columns')
      .addSql(ViewSQL.columns(item.schema!, item.label))
      .addMarkdown('##### 📝 View Definition')
      .addSql(`-- View definition\n${viewDefinition} `)
      .addMarkdown('##### 📖 Query Data')
      .addSql(`-- Query view data\nSELECT *\nFROM ${item.schema}.${item.label}\nLIMIT 100;`)
      .addMarkdown('##### 🔍 Query with Filters')
      .addSql(ViewSQL.queryWithFilters(item.schema!, item.label))
      .addMarkdown('##### 📊 Query with Aggregation')
      .addSql(ViewSQL.queryWithAggregation(item.schema!, item.label))
      .addMarkdown('##### ✏️ Modify Definition')
      .addSql(ViewSQL.modifyDefinition(item.schema!, item.label))
      .addMarkdown('##### ❌ Drop View')
      .addSql(SQL_TEMPLATES.DROP.VIEW(item.schema!, item.label))
      .show();
  });
}

/**
 * Show properties of a PostgreSQL view.
 * @param {DatabaseTreeItem} item - The selected view item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<void>} - A promise that resolves when the properties are shown.
 */
export async function cmdShowViewProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  await CommandBase.run(context, item, 'view properties', async (conn: any, client: any, metadata: any) => {
    // Gather comprehensive view information
    const [viewInfo, columnInfo, dependenciesInfo, referencedInfo, sizeInfo] = await Promise.all([
      client.query(QueryBuilder.viewInfo(item.schema!, item.label)),
      client.query(QueryBuilder.tableColumns(item.schema!, item.label)),
      client.query(QueryBuilder.objectDependencies(item.schema!, item.label)),
      client.query(QueryBuilder.objectReferences(item.schema!, item.label)),
      client.query(QueryBuilder.viewSize(item.schema!, item.label))
    ]);

    const view = viewInfo.rows[0];
    const columns = columnInfo.rows;
    const dependents = dependenciesInfo.rows;
    const references = referencedInfo.rows;
    const sizes = sizeInfo.rows[0];

    // Get view definition
    const viewDefResult = await client.query(`SELECT pg_get_viewdef($1::regclass, true) as definition`, [`${item.schema}.${item.label}`]);
    const viewDefinition = viewDefResult.rows[0]?.definition || '';

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
        <td>${col.column_default ? `<code>${col.column_default}</code>` : '—'}</td>
        <td>${col.description || '—'}</td>
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

    await new NotebookBuilder(metadata)
      .addMarkdown(markdown)
      .addMarkdown('##### 📝 CREATE VIEW Script')
      .addSql(createViewScript)
      .addMarkdown('##### 🗑️ DROP VIEW Script')
      .addSql(`${SQL_TEMPLATES.DROP.VIEW(item.schema!, item.label)}\n\n-- Drop view (with dependencies)\n-- DROP VIEW IF EXISTS ${item.schema}.${item.label} CASCADE;\n\n-- Drop view (without dependencies - will fail if referenced)\n-- DROP VIEW IF EXISTS ${item.schema}.${item.label} RESTRICT;`)
      .addMarkdown('##### 🔍 Query View Data')
      .addSql(`-- Select all data from view\nSELECT * FROM ${item.schema}.${item.label}\nLIMIT 100;`)
      .addMarkdown('##### 📊 View Definition Details')
      .addSql(ViewSQL.definitionDetails(item.schema!, item.label))
      .show();
  });
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
  await CommandBase.run(context, item, 'create view notebook', async (conn: any, client: any, metadata: any) => {
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

    await new NotebookBuilder(metadata)
      .addMarkdown(markdown)
      .addMarkdown('##### 📝 Basic View (Recommended Start)')
      .addSql(ViewSQL.create.basic(schema))
      .addMarkdown('##### 🔗 Joined View')
      .addSql(ViewSQL.create.joined(schema))
      .addMarkdown('##### 📊 Aggregated View')
      .addSql(ViewSQL.create.aggregated(schema))
      .addMarkdown('##### 🔒 Security View (Row-Level Access)')
      .addSql(ViewSQL.create.security(schema))
      .addMarkdown('##### 🧮 Computed View (Calculated Columns)')
      .addSql(ViewSQL.create.computed(schema))
      .addMarkdown('##### 🔄 Recursive View (CTE)')
      .addSql(ViewSQL.create.recursive(schema))
      .addMarkdown(MarkdownUtils.warningBox('After creating a view, remember to: 1) Test the view with sample queries, 2) Add appropriate indexes on underlying tables if needed, 3) Grant necessary permissions to roles, 4) Consider materialized views for expensive queries.'))
      .show();
  });
}