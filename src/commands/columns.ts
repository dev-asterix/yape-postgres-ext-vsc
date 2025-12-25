import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';

import {
  MarkdownUtils,
  FormatHelpers,
  ValidationHelpers,
  ErrorHandlers,
  SQL_TEMPLATES,
  getDatabaseConnection,
  NotebookBuilder,
  QueryBuilder
} from './helper';
import { ColumnSQL } from './sql';

export async function showColumnProperties(item: DatabaseTreeItem) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { client, metadata } = dbConn;
    const schema = item.schema!;
    const tableName = item.tableName!;
    const columnName = item.columnName!;

    const result = await client.query(QueryBuilder.columnDetails(schema, tableName, columnName));

    if (result.rows.length === 0) {
      vscode.window.showErrorMessage('Column not found');
      return;
    }

    const col = result.rows[0];

    const dataTypeDetails = col.character_maximum_length
      ? `${col.data_type}(${col.character_maximum_length})`
      : col.numeric_precision
        ? `${col.data_type}(${col.numeric_precision}${col.numeric_scale ? ',' + col.numeric_scale : ''})`
        : col.data_type;

    const constraints = [];
    if (col.is_primary_key) constraints.push('🔑 PRIMARY KEY');
    if (col.is_foreign_key) constraints.push(`🔗 FOREIGN KEY → ${col.foreign_table_schema}.${col.foreign_table_name}.${col.foreign_column_name}`);
    if (col.is_unique) constraints.push('⭐ UNIQUE');
    if (col.is_nullable === 'NO') constraints.push('🚫 NOT NULL');

    const nb = new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`📋 Column Properties: \`${col.column_name}\``) +
        MarkdownUtils.infoBox(`Table: \`${item.schema}.${tableName}\``) +
        `\n\n#### 📊 Basic Information\n\n` +
        MarkdownUtils.propertiesTable({
          'Column Name': `<code>${col.column_name}</code>`,
          'Data Type': `<code>${dataTypeDetails}</code>`,
          'UDT Name': `<code>${col.udt_name}</code>`,
          'Position': `${col.ordinal_position}`,
          'Nullable': FormatHelpers.formatBoolean(col.is_nullable === 'YES'),
          'Default Value': col.column_default ? `<code>${col.column_default}</code>` : '—'
        })
      );

    if (constraints.length > 0) {
      nb.addMarkdown(`#### 🔒 Constraints\n\n${constraints.map(c => `- ${c}`).join('\n')}`);
    }

    if (col.column_comment) {
      nb.addMarkdown(`#### 💬 Comment\n\n\`\`\`\n${col.column_comment}\n\`\`\``);
    }

    nb.addMarkdown('---')
      .addMarkdown('##### 📖 Query Column')
      .addSql(ColumnSQL.select(item.schema!, tableName, columnName))
      .addMarkdown('##### 📊 Column Statistics')
      .addSql(ColumnSQL.statistics(item.schema!, tableName, columnName));

    await nb.show();

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'get column properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function copyColumnName(item: DatabaseTreeItem) {
  const columnName = item.columnName!;
  await vscode.env.clipboard.writeText(columnName);
  vscode.window.showInformationMessage(`Copied: ${columnName}`);
}

export async function copyColumnNameQuoted(item: DatabaseTreeItem) {
  const columnName = item.columnName!;
  await vscode.env.clipboard.writeText(`"${columnName}"`);
  vscode.window.showInformationMessage(`Copied: "${columnName}"`);
}

export async function generateSelectStatement(item: DatabaseTreeItem) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const columnName = item.columnName!;
    const tableName = item.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`📖 SELECT Statement: \`${columnName}\``) +
        MarkdownUtils.infoBox(`Query specific column from \`${item.schema}.${tableName}\``)
      )
      .addSql(`-- Select ${columnName} column
SELECT ${columnName}
FROM ${item.schema}.${tableName}
LIMIT 100;`)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate SELECT statement');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function generateWhereClause(item: DatabaseTreeItem) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const columnName = item.columnName!;
    const tableName = item.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔍 WHERE Clause Templates: \`${columnName}\``) +
        MarkdownUtils.infoBox(`Common WHERE clause patterns for filtering by \`${columnName}\``)
      )
      .addSql(ColumnSQL.whereTemplates(item.schema!, tableName, columnName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate WHERE clause');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function generateAlterColumnScript(item: DatabaseTreeItem) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const columnName = item.columnName!;
    const tableName = item.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`✏️ ALTER COLUMN Script: \`${columnName}\``) +
        MarkdownUtils.warningBox('Modifying column structure may fail if data doesn\'t match new constraints or type.') +
        `\n\n#### Available Modifications\n\n` +
        MarkdownUtils.operationsTable([
          { operation: 'Change Data Type', description: 'Convert column to different type' },
          { operation: 'Set NOT NULL', description: 'Prevent NULL values' },
          { operation: 'Drop NOT NULL', description: 'Allow NULL values' },
          { operation: 'Set Default', description: 'Add default value for new rows' },
          { operation: 'Drop Default', description: 'Remove default value' }
        ])
      )
      .addSql(ColumnSQL.alter(item.schema!, tableName, columnName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate ALTER COLUMN script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function generateDropColumnScript(item: DatabaseTreeItem) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const columnName = item.columnName!;
    const tableName = item.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🗑️ DROP COLUMN Script: \`${columnName}\``) +
        MarkdownUtils.dangerBox('This will permanently delete the column and ALL its data! This operation cannot be undone.') +
        `\n\n#### Before You Drop\n\n` +
        `1. **Backup your data** - Export table or create a snapshot\n` +
        `2. **Check dependencies** - Views, functions, or triggers may use this column\n` +
        `3. **Test on non-production** - Verify the change works as expected\n\n` +
        `\n\n#### Options\n\n` +
        `- **RESTRICT** (default): Fails if column has dependencies\n` +
        `- **CASCADE**: Automatically drops dependent objects (views, triggers, etc.)`
      )
      .addSql(ColumnSQL.drop(item.schema!, tableName, columnName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate DROP COLUMN script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function generateRenameColumnScript(item: DatabaseTreeItem) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const columnName = item.columnName!;
    const tableName = item.tableName!;

    const newName = await vscode.window.showInputBox({
      prompt: 'Enter new column name',
      value: columnName,
      validateInput: ValidationHelpers.validateColumnName
    });

    if (!newName || newName === columnName) {
      return;
    }

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔄 RENAME COLUMN: \`${columnName}\` → \`${newName}\``) +
        MarkdownUtils.infoBox('Renaming is safe and atomic. Dependent objects (views, functions) will be automatically updated.')
      )
      .addSql(ColumnSQL.rename(item.schema!, tableName, columnName, newName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate RENAME COLUMN script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function addColumnComment(item: DatabaseTreeItem) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const columnName = item.columnName!;
    const tableName = item.tableName!;

    const comment = await vscode.window.showInputBox({
      prompt: `Enter comment for column ${columnName}`,
      placeHolder: 'Column description...'
    });

    if (comment === undefined) {
      return;
    }

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`💬 Add Column Comment: \`${columnName}\``) +
        MarkdownUtils.infoBox('Column comments are stored in PostgreSQL system catalogs and visible in `pg_stats`')
      )
      .addSql(`-- Add/update comment for column ${columnName}
${SQL_TEMPLATES.COMMENT.COLUMN(item.schema!, tableName, columnName, comment)}

-- To remove a comment, use:
-- COMMENT ON COLUMN ${item.schema}.${tableName}.${columnName} IS NULL;`)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate comment script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function generateIndexOnColumn(item: DatabaseTreeItem) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const columnName = item.columnName!;
    const tableName = item.tableName!;

    const indexName = await vscode.window.showInputBox({
      prompt: 'Enter index name',
      value: `idx_${tableName}_${columnName}`,
      validateInput: (value) => ValidationHelpers.validateIdentifier(value, 'index')
    });

    if (!indexName) {
      return;
    }

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔍 CREATE INDEX: \`${indexName}\``) +
        MarkdownUtils.infoBox('Indexes improve query performance but slow down write operations. Choose the right index type for your use case.') +
        `\n\n#### Index Types\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '<strong>B-tree</strong> (default)', description: 'Most queries, equality and range' },
          { operation: '<strong>Hash</strong>', description: 'Simple equality comparisons only' },
          { operation: '<strong>GIN</strong>', description: 'Array, JSONB, full-text search' },
          { operation: '<strong>GiST</strong>', description: 'Geometric data, full-text search' }
        ]) + `\n` +
        MarkdownUtils.successBox('Use `CREATE INDEX CONCURRENTLY` to avoid locking the table during index creation on production databases.')
      )
      .addSql(ColumnSQL.createIndex(item.schema!, tableName, columnName, indexName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate CREATE INDEX script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function viewColumnStatistics(item: DatabaseTreeItem) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const columnName = item.columnName!;
    const tableName = item.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`📊 Column Statistics: \`${columnName}\``) +
        MarkdownUtils.infoBox(`Statistics are collected by \`ANALYZE\` and used by the query planner for optimization. Run \`ANALYZE ${item.schema}.${tableName};\` if statistics are missing.`) +
        `\n\n#### Statistics Explained\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '<strong>n_distinct</strong>', description: 'Estimated number of distinct values (-1 = all unique, 0-1 = fraction, >1 = count)' },
          { operation: '<strong>null_frac</strong>', description: 'Fraction of NULL values (0.0 to 1.0)' },
          { operation: '<strong>avg_width</strong>', description: 'Average storage width in bytes' },
          { operation: '<strong>correlation</strong>', description: 'Statistical correlation between physical row order and logical order (-1 to 1)' }
        ])
      )
      .addSql(ColumnSQL.detailedStatistics(item.schema!, tableName, columnName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'view column statistics');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Add new column to table - generates a comprehensive notebook with guidelines and SQL templates
 */
export async function cmdAddColumn(item: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const schema = item.schema!;
    const tableName = item.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`➕ Add New Column to \`${schema}.${tableName}\``) +
        MarkdownUtils.infoBox('This notebook provides templates for adding new columns. Modify the templates below and execute to add columns.') +
        `\n\n#### 📋 Guidelines for Adding Columns\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '<strong>Naming</strong>', description: 'Use snake_case (e.g., user_name, created_at). Avoid reserved words.' },
          { operation: '<strong>Data Types</strong>', description: 'Choose appropriate types: INTEGER, VARCHAR(n), TEXT, BOOLEAN, TIMESTAMP, JSONB, UUID' },
          { operation: '<strong>Constraints</strong>', description: 'Consider NOT NULL, DEFAULT, CHECK constraints at column level' },
          { operation: '<strong>Performance</strong>', description: 'Adding columns is fast but adding with DEFAULT on large tables may lock' }
        ]) +
        `\n\n#### 🏷️ Common Data Types Reference\n\n` +
        MarkdownUtils.propertiesTable({
          'INTEGER / BIGINT': 'Whole numbers (4/8 bytes)',
          'SERIAL / BIGSERIAL': 'Auto-incrementing integer',
          'VARCHAR(n) / TEXT': 'Variable-length strings',
          'BOOLEAN': 'true/false values',
          'TIMESTAMP / TIMESTAMPTZ': 'Date and time (with/without timezone)',
          'DATE / TIME': 'Date or time only',
          'NUMERIC(p,s)': 'Exact decimal numbers',
          'JSONB': 'Binary JSON (recommended for JSON data)',
          'UUID': 'Universally unique identifier',
          'ARRAY': 'Array of any type (e.g., INTEGER[])',
        }) +
        `\n\n---`
      )
      .addMarkdown('##### 📝 Basic Column (Recommended Start)')
      .addSql(ColumnSQL.add.basic(schema, tableName))
      .addMarkdown('##### 🔒 Column with NOT NULL and DEFAULT')
      .addSql(ColumnSQL.add.withDefault(schema, tableName))
      .addMarkdown('##### ⏰ Timestamp Columns')
      .addSql(ColumnSQL.add.timestamps(schema, tableName))
      .addMarkdown('##### ✅ Column with CHECK Constraint')
      .addSql(ColumnSQL.add.withCheck(schema, tableName))
      .addMarkdown('##### 🔗 Foreign Key Column')
      .addSql(ColumnSQL.add.foreignKey(schema, tableName))
      .addMarkdown('##### 📄 JSON Column')
      .addSql(ColumnSQL.add.jsonb(schema, tableName))
      .addMarkdown('##### 🆔 UUID Column')
      .addSql(ColumnSQL.add.uuid(schema, tableName))
      .addMarkdown(MarkdownUtils.warningBox('After adding columns, consider adding indexes for frequently queried columns and updating application code.'))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'add column');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}
