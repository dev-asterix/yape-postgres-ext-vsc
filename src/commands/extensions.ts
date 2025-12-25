import * as vscode from 'vscode';

import { DatabaseTreeItem, DatabaseTreeProvider } from '../providers/DatabaseTreeProvider';
import {
  MarkdownUtils,
  ErrorHandlers,
  getDatabaseConnection,
  NotebookBuilder,
  QueryBuilder,
  validateCategoryItem
} from './helper';
import { ExtensionSQL } from './sql';

/**
 * cmdEnableExtension - Command to create a notebook for enabling a PostgreSQL extension'
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdEnableExtension(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateCategoryItem);
    const { metadata } = dbConn;

    // Extract extension name from label (removes version info)
    const extensionName = item.label.split(' ')[0];

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔌 Enable Extension: \`${extensionName}\``) +
        MarkdownUtils.infoBox('Execute the cell below to enable the PostgreSQL extension. This will install the extension in the current database.') +
        (item.comment ? MarkdownUtils.infoBox(`<strong>Description:</strong> ${item.comment}`) : '')
      )
      .addMarkdown('##### 🔌 Enable Command')
      .addSql(ExtensionSQL.enable(extensionName))
      .show();

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create extension notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdExtensionOperations - Command to create a notebook for common operations on a PostgreSQL extension.
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdExtensionOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateCategoryItem);
    const { metadata } = dbConn;

    // Extract extension name from label (removes version info)
    const extensionName = item.label.split(' ')[0];

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`🔌 Extension Operations: \`${extensionName}\``) +
        MarkdownUtils.infoBox('This notebook contains common operations for managing PostgreSQL extensions. Run the cells below to execute the operations.') +
        (item.comment ? MarkdownUtils.infoBox(`<strong>Description:</strong> ${item.comment}`) : '') +
        `\n\n#### 🎯 Available Operations\n\n` +
        MarkdownUtils.operationsTable([
          { operation: '<strong>Enable Extension</strong>', description: 'Install the extension' },
          { operation: '<strong>List Objects</strong>', description: 'Show objects created by this extension' },
          { operation: '<strong>Drop Extension</strong>', description: 'Remove the extension' }
        ])
      )
      .addMarkdown('##### 🔌 Enable Extension')
      .addSql(ExtensionSQL.enable(extensionName))
      .addMarkdown('##### 📦 Extension Objects')
      .addSql(QueryBuilder.extensionObjects(extensionName))
      .addMarkdown('##### ❌ Drop Extension')
      .addSql(ExtensionSQL.drop(extensionName))
      .show();

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create extension operations notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdDropExtension - Command to create a notebook for dropping a PostgreSQL extension.
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdDropExtension(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let dbConn;
  try {
    dbConn = await getDatabaseConnection(item, validateCategoryItem);
    const { metadata } = dbConn;

    // Extract extension name from label (removes version info)
    const extensionName = item.label.split(' ')[0];

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`❌ Drop Extension: \`${extensionName}\``) +
        MarkdownUtils.dangerBox('This action will remove the PostgreSQL extension and all its objects. This operation cannot be undone.')
      )
      .addMarkdown('##### ❌ Drop Command')
      .addSql(ExtensionSQL.dropCascade(extensionName))
      .show();

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create drop extension notebook');
  } finally {
    if (dbConn && dbConn.release) dbConn.release();
  }
}

/**
 * cmdRefreshExtension - Refreshes the extension item in the tree view.
 */
export async function cmdRefreshExtension(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
  databaseTreeProvider?.refresh(item);
}