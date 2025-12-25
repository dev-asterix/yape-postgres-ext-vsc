import * as vscode from 'vscode';
import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';

/**
 * SQL Queries for type operations
 */

/**
 * TYPE_INFO_QUERY - Query to get detailed type information including fields and constraints
 */


// Reuse shared helpers and utilities
import {
  SQL_TEMPLATES,
  MarkdownUtils,
  QueryBuilder,
  FormatHelpers,
  ErrorHandlers,
  StringUtils,
  ValidationHelpers,
  MaintenanceTemplates,
  ObjectUtils,
  getDatabaseConnection,
  NotebookBuilder
} from './helper';
import { TypeSQL } from './sql';

export async function cmdAllOperationsTypes(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const schema = item.schema!;
    const typeName = item.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔧 Type Operations: \`${schema}.${typeName}\``) +
        MarkdownUtils.infoBox('Custom types allow you to define reusable data structures. Composite types group related fields, while enums define a set of allowed values.', 'About PostgreSQL Types') +
        '\n\n#### 📋 Common Operations\n\n' +
        MarkdownUtils.operationsTable([
          { operation: '📝 <strong>View Definition</strong>', description: 'Display the complete CREATE TYPE statement', riskLevel: 'Safe' },
          { operation: '✏️ <strong>Modify Type</strong>', description: 'Alter type properties (limited changes allowed)', riskLevel: 'Safe' },
          { operation: '🔄 <strong>Recreate Type</strong>', description: 'Drop and recreate with modifications (requires CASCADE)', riskLevel: 'Destructive' },
          { operation: '🔍 <strong>Find Usage</strong>', description: 'Search for tables/columns using this type', riskLevel: 'Safe' },
          { operation: '💬 <strong>Add Comment</strong>', description: 'Document the type\'s purpose and usage', riskLevel: 'Safe' },
          { operation: '❌ <strong>Drop Type</strong>', description: 'Remove the type from the database', riskLevel: 'Destructive' }
        ]) + '\n---'
      )
      .addMarkdown('##### 📝 View Type Definition\n\n' + MarkdownUtils.infoBox('Query the system catalog to see the complete type definition.', 'Info'))
      .addSql(TypeSQL.info(schema, typeName))
      .addMarkdown('##### ✏️ Modify Type (Enum)\n\n' + MarkdownUtils.infoBox('Add a new value to an existing enum type.', 'Enum Only'))
      .addSql(TypeSQL.addEnumValue(schema, typeName))
      .addMarkdown('##### ✏️ Modify Type (Composite)\n\n' + MarkdownUtils.infoBox('Add a new attribute to a composite type.', 'Composite Only'))
      .addSql(TypeSQL.addAttribute(schema, typeName))
      .addMarkdown('##### 🔄 Rename Type')
      .addSql(TypeSQL.rename(schema, typeName))
      .addMarkdown('##### 🔍 Find Usage')
      .addSql(TypeSQL.findUsage(schema, typeName))
      .addMarkdown('##### ❌ Drop Type')
      .addSql(TypeSQL.drop(schema, typeName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show type operations');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function cmdEditTypes(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;

    try {
      const typeResult = await client.query(QueryBuilder.typeFields(item.schema!, item.label));
      if (typeResult.rows.length === 0) {
        throw new Error('Type not found');
      }

      const fields = typeResult.rows.map((row: any) => `    ${row.attname} ${row.data_type}`).join(',\n');

      await new NotebookBuilder(metadata)
        .addMarkdown(
          MarkdownUtils.header(`Edit Type: \`${item.schema}.${item.label}\``) +
          MarkdownUtils.infoBox('Modify the type definition below and execute the cells to update it.')
        )
        .addMarkdown('##### 📝 Type Definition')
        .addSql(`-- Drop existing type\nDROP TYPE IF EXISTS ${item.schema}.${item.label} CASCADE;\n\n-- Create type with new definition\nCREATE TYPE ${item.schema}.${item.label} AS (\n${fields}\n);`)
        .show();
    } finally {
      // Do not close shared client
    }
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create type edit notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function cmdViewTypeProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  return cmdShowTypeProperties(item, context);
}

/**
 * View properties of a PostgreSQL type
 */
export async function cmdShowTypeProperties(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;

    // Gather comprehensive type information
    const [typeInfoResult, enumValuesResult, dependenciesResult] = await Promise.all([
      // Basic type info with fields
      client.query(QueryBuilder.typeInfo(item.schema!, item.label)),

      // Enum values if it's an enum type
      client.query(`
                SELECT enumlabel, enumsortorder
                FROM pg_enum
                WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = $1 
                                  AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2))
                ORDER BY enumsortorder
            `, [item.label, item.schema]),

      // Objects using this type
      client.query(`
                SELECT DISTINCT
                    n.nspname as schema,
                    c.relname as table_name,
                    a.attname as column_name,
                    c.relkind as object_kind
                FROM pg_attribute a
                JOIN pg_class c ON c.oid = a.attrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_type t ON t.oid = a.atttypid
                WHERE t.typname = $1
                AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)
                AND a.attnum > 0
                AND NOT a.attisdropped
                ORDER BY n.nspname, c.relname, a.attname
            `, [item.label, item.schema])
    ]);

    if (typeInfoResult.rows.length === 0) {
      throw new Error('Type not found');
    }

    const typeInfo = typeInfoResult.rows[0];
    const fields = typeInfoResult.rows;
    const enumValues = enumValuesResult.rows;
    const dependencies = dependenciesResult.rows;

    const typeIcon = typeInfo.type_type === 'enum' ? '🏷️' : typeInfo.type_type === 'composite' ? '📦' : '🔧';
    const typeCategory = typeInfo.type_type === 'composite' ? '📦 Composite Type' :
      typeInfo.type_type === 'enum' ? '🏷️ Enumeration Type' :
        typeInfo.type_type === 'range' ? '↔️ Range Type' : typeInfo.type_type;

    const nb = new NotebookBuilder(metadata);

    nb.addMarkdown(
      MarkdownUtils.header(`${typeIcon} Type Properties: \`${item.schema}.${item.label}\``) +
      MarkdownUtils.infoBox(`Owner: **${typeInfo.owner}** | Type: **${typeInfo.type_type.toUpperCase()}**`) +
      '\n\n#### 📊 General Information\n\n' +
      MarkdownUtils.propertiesTable({
        'Schema': item.schema!,
        'Name': item.label,
        'Owner': typeInfo.owner,
        'Type Category': typeCategory,
        'Description': typeInfo.description || '—'
      })
    );

    if (typeInfo.type_type === 'composite') {
      const fieldRows = fields.map((field: any) =>
        `| ${field.ordinal_position} | **${field.attname}** | \`${field.data_type}\` |`
      ).join('\n');

      nb.addMarkdown(
        '#### 📦 Composite Type Fields\n\n' +
        '| Position | Name | Type |\n' +
        '| :--- | :--- | :--- |\n' +
        fieldRows
      );
    } else if (typeInfo.type_type === 'enum') {
      const enumRows = enumValues.map((val: any) =>
        `| ${val.enumsortorder} | \`${val.enumlabel}\` |`
      ).join('\n');

      nb.addMarkdown(
        '#### 🏷️ Enum Values\n\n' +
        '| Order | Value |\n' +
        '| :--- | :--- |\n' +
        enumRows
      );
    }

    if (dependencies.length > 0) {
      const depRows = dependencies.map((dep: any) =>
        `| ${ObjectUtils.getKindLabel(dep.object_kind)} | \`${dep.schema}.${dep.table_name}\` | ${dep.column_name} |`
      ).join('\n');

      nb.addMarkdown(
        '#### 🔗 Usage / Dependencies\n\n' +
        '| Object Type | Object Name | Column |\n' +
        '| :--- | :--- | :--- |\n' +
        depRows
      );
    }

    // Add definition SQL
    nb.addMarkdown('##### 📝 Type Definition')
      .addSql(`-- Type Definition
SELECT pg_get_userbyid(t.typowner) as owner, t.typname, t.typtype
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname = '${item.label}' AND n.nspname = '${item.schema}';`);

    await nb.show();

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show type properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function cmdDropType(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`❌ Drop Type: \`${item.schema}.${item.label}\``) +
        MarkdownUtils.dangerBox('This action will permanently delete the type. This operation cannot be undone.')
      )
      .addMarkdown('##### ❌ Drop Command')
      .addSql(`-- Drop type\nDROP TYPE IF EXISTS ${item.schema}.${item.label} CASCADE;`)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create drop type notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdRefreshType - Refreshes the type item in the tree view.
 */
export async function cmdRefreshType(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
  databaseTreeProvider?.refresh(item);
}

/**
 * cmdCreateType - Command to create a new type in the database.
 */
export async function cmdCreateType(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`➕ Create New Type in Schema: \`${item.schema}\``) +
        MarkdownUtils.infoBox('Modify the type definition below and execute the cell to create the type.')
      )
      .addMarkdown('##### 📝 Type Definition')
      .addSql(TypeSQL.create.composite(item.schema!))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create type notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}
