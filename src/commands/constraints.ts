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
import { ConstraintSQL } from './sql';

/**
 * Show constraint properties in a notebook
 */
export async function showConstraintProperties(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { client, metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const constraintName = treeItem.label;

    // Get detailed constraint information
    const result = await client.query(QueryBuilder.constraintDetails(schema, tableName, constraintName));

    if (result.rows.length === 0) {
      vscode.window.showErrorMessage('Constraint not found');
      return;
    }

    const constraint = result.rows[0];

    // Build constraint type icon
    const typeIcon = ObjectUtils.getConstraintIcon(constraint.constraint_type);

    const nb = new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`${typeIcon} Constraint Properties: \`${constraint.constraint_name}\``) +
        MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``) +
        `\n\n#### 📊 Basic Information\n\n` +
        MarkdownUtils.propertiesTable({
          'Constraint Name': `<code>${constraint.constraint_name}</code>`,
          'Type': `<code>${constraint.constraint_type}</code>`,
          'Columns': `<code>${constraint.columns || '—'}</code>`,
          'Deferrable': FormatHelpers.formatBoolean(constraint.is_deferrable === 'YES'),
          'Initially Deferred': FormatHelpers.formatBoolean(constraint.initially_deferred === 'YES')
        })
      );

    if (constraint.constraint_definition) {
      nb.addMarkdown(`#### 🔧 Definition\n\n\`\`\`sql\n${constraint.constraint_definition}\n\`\`\``);
    }

    if (constraint.check_clause) {
      nb.addMarkdown(`#### ✓ Check Clause\n\n\`\`\`sql\n${constraint.check_clause}\n\`\`\``);
    }

    if (constraint.comment) {
      nb.addMarkdown(`#### 💬 Comment\n\n\`\`\`\n${constraint.comment}\n\`\`\``);
    }

    // Get foreign key details if applicable
    if (constraint.constraint_type === 'FOREIGN KEY') {
      const fkResult = await client.query(QueryBuilder.foreignKeyDetails(schema, constraintName));

      if (fkResult.rows.length > 0) {
        let fkMarkdown = `#### 🔗 Foreign Key References\n\n<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left;">Column</th><th style="text-align: left;">References</th><th style="text-align: left;">On Update</th><th style="text-align: left;">On Delete</th></tr>`;

        fkResult.rows.forEach((row: any) => {
          fkMarkdown += `\n    <tr><td><code>${row.column_name}</code></td><td><code>${row.foreign_table_schema}.${row.foreign_table_name}.${row.foreign_column_name}</code></td><td>${row.update_rule}</td><td>${row.delete_rule}</td></tr>`;
        });

        fkMarkdown += '\n</table>';
        nb.addMarkdown(fkMarkdown);
      }
    }

    nb.addMarkdown('##### 📖 Query Constraint Details')
      .addSql(ConstraintSQL.details(schema, constraintName));

    await nb.show();

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'show constraint properties');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Copy constraint name to clipboard
 */
export async function copyConstraintName(treeItem: DatabaseTreeItem): Promise<void> {
  const constraintName = treeItem.label;
  await vscode.env.clipboard.writeText(constraintName);
  vscode.window.showInformationMessage(`Copied: ${constraintName}`);
}

/**
 * Generate DROP CONSTRAINT script
 */
export async function generateDropConstraintScript(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const constraintName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🗑️ DROP CONSTRAINT: \`${constraintName}\``) +
        MarkdownUtils.dangerBox('This will remove the constraint from the table. Data integrity checks enforced by this constraint will no longer apply.') +
        MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``)
      )
      .addSql(SQL_TEMPLATES.DROP.CONSTRAINT(schema, tableName, constraintName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate drop constraint script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate ALTER CONSTRAINT script
 */
export async function generateAlterConstraintScript(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const constraintName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`✏️ ALTER CONSTRAINT: \`${constraintName}\``) +
        MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``) +
        `\n\n#### Available Operations\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '<strong>RENAME</strong>', description: 'Change the name of the constraint' },
          { operation: '<strong>VALIDATE</strong>', description: 'Validate a constraint that was created as NOT VALID' }
        ])
      )
      .addSql(ConstraintSQL.rename(schema, tableName, constraintName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate alter constraint script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Validate constraint
 */
export async function validateConstraint(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const constraintName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`✅ VALIDATE CONSTRAINT: \`${constraintName}\``) +
        MarkdownUtils.infoBox('Validates a constraint that was previously created with `NOT VALID`. This scans the table to ensure all rows satisfy the constraint.') +
        MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``)
      )
      .addSql(ConstraintSQL.validate(schema, tableName, constraintName))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'validate constraint');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Generate ADD CONSTRAINT template script
 */
export async function generateAddConstraintScript(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header('➕ ADD CONSTRAINT Templates') +
        MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``) +
        `\n\n#### Constraint Types\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '<strong>PRIMARY KEY</strong>', description: 'Uniquely identifies each row' },
          { operation: '<strong>FOREIGN KEY</strong>', description: 'Ensures referential integrity' },
          { operation: '<strong>UNIQUE</strong>', description: 'Ensures all values in a column are different' },
          { operation: '<strong>CHECK</strong>', description: 'Ensures that all values in a column satisfy a specific condition' }
        ])
      )
      .addSql(`-- Add Primary Key Constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT "${tableName}_pkey" 
PRIMARY KEY (column_name);

-- Add Foreign Key Constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT "${tableName}_fkey" 
FOREIGN KEY (column_name) 
REFERENCES other_schema.other_table(other_column)
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Add Unique Constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT "${tableName}_unique" 
UNIQUE (column_name);

-- Add Check Constraint
ALTER TABLE "${schema}"."${tableName}"
ADD CONSTRAINT "${tableName}_check" 
CHECK (column_name > 0);`)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'generate add constraint script');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * View constraint dependencies
 */
export async function viewConstraintDependencies(treeItem: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(treeItem);
    const { metadata } = dbConn;
    const schema = treeItem.schema!;
    const tableName = treeItem.tableName!;
    const constraintName = treeItem.label;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🕸️ Constraint Dependencies: \`${constraintName}\``) +
        MarkdownUtils.infoBox(`Table: \`${schema}.${tableName}\``) +
        MarkdownUtils.infoBox('Shows objects that depend on this constraint.')
      )
      .addSql(`-- Find all dependencies for this constraint
SELECT 
    d.deptype as dependency_type,
    c.relname as dependent_object,
    n.nspname as dependent_schema,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized view'
        WHEN 'i' THEN 'index'
        WHEN 'S' THEN 'sequence'
        WHEN 'f' THEN 'foreign table'
        ELSE c.relkind::text
    END as object_type
FROM pg_constraint con
JOIN pg_depend d ON d.refobjid = con.oid
JOIN pg_class c ON c.oid = d.objid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE con.conname = '${constraintName}'
    AND con.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')
ORDER BY dependent_schema, dependent_object;`)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'view constraint dependencies');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

export async function cmdConstraintOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🛡️ Constraint Operations: \`${item.label}\``) +
        MarkdownUtils.infoBox('This notebook provides a dashboard for managing your constraint. Each cell is a ready-to-execute template.') +
        `\n\n#### 🎯 Available Operations\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '🔍 <strong>View Definition</strong>', description: 'Display constraint definition', riskLevel: '✅ Safe' },
          { operation: '✅ <strong>Validate</strong>', description: 'Check existing data against constraint', riskLevel: '✅ Safe' },
          { operation: '✏️ <strong>Rename</strong>', description: 'Change constraint name', riskLevel: '⚠️ Low Risk' },
          { operation: '❌ <strong>Drop</strong>', description: 'Remove constraint permanently', riskLevel: '🔴 Destructive' }
        ]) + `\n` +
        MarkdownUtils.successBox('Use `Ctrl+Enter` to execute individual cells.') +
        `\n---`
      )
      .addMarkdown(`##### 🔍 View Definition`)
      .addSql(ConstraintSQL.definition(item.schema!, item.tableName!, item.label))
      .addMarkdown(`#### ✅ Validate Constraint\n\n` +
        MarkdownUtils.infoBox('Validating a constraint ensures all existing rows satisfy the condition. This is useful for constraints added as NOT VALID.'))
      .addSql(`-- Validate constraint
ALTER TABLE ${item.schema}.${item.tableName}
VALIDATE CONSTRAINT ${item.label};`)
      .addMarkdown(`#### ✏️ Rename Constraint`)
      .addSql(`-- Rename constraint
ALTER TABLE ${item.schema}.${item.tableName}
RENAME CONSTRAINT ${item.label} TO new_constraint_name;`)
      .addMarkdown(`#### ❌ Drop Constraint\n\n` +
        MarkdownUtils.dangerBox('This will remove the constraint. Data integrity checks enforced by this constraint will no longer apply.', 'Caution'))
      .addSql(`-- Drop constraint
ALTER TABLE ${item.schema}.${item.tableName}
DROP CONSTRAINT ${item.label};`)
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create constraint operations notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * Add new constraint to table - generates a comprehensive notebook with guidelines and SQL templates
 */
export async function cmdAddConstraint(item: DatabaseTreeItem): Promise<void> {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    const schema = item.schema!;
    const tableName = item.tableName!;

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`➕ Add New Constraint to \`${schema}.${tableName}\``) +
        MarkdownUtils.infoBox('This notebook provides templates for adding constraints. Constraints enforce data integrity rules.') +
        `\n\n#### 📋 Constraint Types Overview\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '🔑 <strong>PRIMARY KEY</strong>', description: 'Uniquely identifies each row. Only one per table. Cannot be NULL.' },
          { operation: '🔗 <strong>FOREIGN KEY</strong>', description: 'References primary key in another table. Enforces referential integrity.' },
          { operation: '⭐ <strong>UNIQUE</strong>', description: 'Ensures all values in column(s) are distinct. Multiple allowed per table.' },
          { operation: '✓ <strong>CHECK</strong>', description: 'Validates data against a boolean expression. Flexible validation rules.' },
          { operation: '⊗ <strong>EXCLUSION</strong>', description: 'Prevents overlapping values using operators (useful for ranges, schedules).' },
          { operation: '⊕ <strong>NOT NULL</strong>', description: 'Prevents NULL values in a column.' }
        ]) +
        `\n\n#### ⚡ Important Considerations\n\n` +
        MarkdownUtils.warningBox('Adding constraints to large tables may take time and lock the table. Consider using NOT VALID with later VALIDATE.') +
        `\n\n---`
      )
      .addMarkdown(`##### 🔑 Primary Key Constraint`)
      .addSql(ConstraintSQL.add.primaryKey(schema, tableName))
      .addMarkdown(`##### 🔗 Foreign Key Constraint`)
      .addSql(ConstraintSQL.add.foreignKey(schema, tableName))
      .addMarkdown(`##### ⭐ Unique Constraint`)
      .addSql(ConstraintSQL.add.unique(schema, tableName))
      .addMarkdown(`##### ✓ Check Constraint`)
      .addSql(ConstraintSQL.add.check(schema, tableName))
      .addMarkdown(`##### ⊗ Exclusion Constraint (for non-overlapping ranges)`)
      .addSql(ConstraintSQL.add.exclusion(schema, tableName))
      .addMarkdown(`##### ⊕ NOT NULL Constraint`)
      .addSql(ConstraintSQL.add.notNull(schema, tableName))
      .addMarkdown(`##### ⚡ Add Constraint Without Locking (Large Tables)`)
      .addSql(ConstraintSQL.add.notValid(schema, tableName))
      .addMarkdown(MarkdownUtils.successBox('After adding constraints, test with sample data to ensure they work as expected.'))
      .show();
  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'add constraint');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}
