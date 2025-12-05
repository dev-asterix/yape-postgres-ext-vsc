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
 * cmdEnableExtension - Command to create a notebook for enabling a PostgreSQL extension'
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdEnableExtension(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        // Get the connection details (not the pg.Client) for metadata
        const connectionDetails = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionDetails, item.databaseName);

        // Get the pg.Client from ConnectionManager
        const client = await ConnectionManager.getInstance().getConnection({
            id: connectionDetails.id,
            host: connectionDetails.host,
            port: connectionDetails.port,
            username: connectionDetails.username,
            database: item.databaseName,
            name: connectionDetails.name
        });

        try {
            // Extract extension name from label (removes version info)
            const extensionName = item.label.split(' ')[0];

            const markdown = MarkdownUtils.header(`🔌 Enable Extension: \`${extensionName}\``) +
                MarkdownUtils.infoBox('Execute the cell below to enable the PostgreSQL extension. This will install the extension in the current database.') +
                (item.comment ? MarkdownUtils.infoBox(`<strong>Description:</strong> ${item.comment}`) : '');

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    markdown,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔌 Enable Command`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Enable extension\nCREATE EXTENSION IF NOT EXISTS "${extensionName}"; `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager, no need to close explicitly here
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create extension notebook');
    }
}

/**
 * cmdExtensionOperations - Command to create a notebook for common operations on a PostgreSQL extension.
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdExtensionOperations(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connectionDetails = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionDetails, item.databaseName);

        const client = await ConnectionManager.getInstance().getConnection({
            id: connectionDetails.id,
            host: connectionDetails.host,
            port: connectionDetails.port,
            username: connectionDetails.username,
            database: item.databaseName,
            name: connectionDetails.name
        });

        try {
            // Extract extension name from label (removes version info)
            const extensionName = item.label.split(' ')[0];

            const markdown = MarkdownUtils.header(`🔌 Extension Operations: \`${extensionName}\``) +
                MarkdownUtils.infoBox('This notebook contains common operations for managing PostgreSQL extensions. Run the cells below to execute the operations.') +
                (item.comment ? MarkdownUtils.infoBox(`<strong>Description:</strong> ${item.comment}`) : '') +
                `\n\n#### 🎯 Available Operations\n\n` +
                MarkdownUtils.operationsTable([
                    { operation: '<strong>Enable Extension</strong>', description: 'Install the extension' },
                    { operation: '<strong>List Objects</strong>', description: 'Show objects created by this extension' },
                    { operation: '<strong>Drop Extension</strong>', description: 'Remove the extension' }
                ]);

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    markdown,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 🔌 Enable Extension`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Enable extension\nCREATE EXTENSION IF NOT EXISTS "${extensionName}"; `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### 📦 Extension Objects`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- List objects created by extension\nSELECT * FROM pg_catalog.pg_depend d
    JOIN pg_catalog.pg_extension e ON d.refobjid = e.oid
    JOIN pg_catalog.pg_class c ON d.objid = c.oid
    WHERE e.extname = '${extensionName}'
    AND d.deptype = 'e'; `,
                    'sql'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop Extension`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop extension\nDROP EXTENSION IF EXISTS "${extensionName}"; `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create extension operations notebook');
    }
}

/**
 * cmdDropExtension - Command to create a notebook for dropping a PostgreSQL extension.
 * @param {DatabaseTreeItem} item - The selected extension item in the database tree.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
export async function cmdDropExtension(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
    try {
        validateItem(item);
        const connectionDetails = await getConnectionWithPassword(item.connectionId!);
        const metadata = createMetadata(connectionDetails, item.databaseName);

        const client = await ConnectionManager.getInstance().getConnection({
            id: connectionDetails.id,
            host: connectionDetails.host,
            port: connectionDetails.port,
            username: connectionDetails.username,
            database: item.databaseName,
            name: connectionDetails.name
        });

        try {
            // Extract extension name from label (removes version info)
            const extensionName = item.label.split(' ')[0];

            const cells = [
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    MarkdownUtils.header(`❌ Drop Extension: \`${extensionName}\``) +
                    MarkdownUtils.dangerBox('This action will remove the PostgreSQL extension and all its objects. This operation cannot be undone.'),
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Markup,
                    `##### ❌ Drop Command`,
                    'markdown'
                ),
                new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    `-- Drop extension\nDROP EXTENSION IF EXISTS "${extensionName}" CASCADE; `,
                    'sql'
                )
            ];

            await createAndShowNotebook(cells, metadata);
        } finally {
            // Connection is managed by ConnectionManager
        }
    } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'create drop extension notebook');
    }
}

/**
 * cmdRefreshExtension - Refreshes the extension item in the tree view.
 */
export async function cmdRefreshExtension(item: DatabaseTreeItem, context: vscode.ExtensionContext, databaseTreeProvider?: DatabaseTreeProvider) {
    databaseTreeProvider?.refresh(item);
}