import { Client } from 'pg';
import * as vscode from 'vscode';
import { cmdAiAssist } from './commands/aiAssist';
import { showColumnProperties, copyColumnName, copyColumnNameQuoted, generateSelectStatement, generateWhereClause, generateAlterColumnScript, generateDropColumnScript, generateRenameColumnScript, addColumnComment, generateIndexOnColumn, viewColumnStatistics, cmdAddColumn } from './commands/columns';
import { showConstraintProperties, copyConstraintName, generateDropConstraintScript, generateAlterConstraintScript, validateConstraint, generateAddConstraintScript, viewConstraintDependencies, cmdConstraintOperations, cmdAddConstraint } from './commands/constraints';
import { cmdConnectDatabase, cmdDisconnectConnection, cmdDisconnectDatabase, cmdReconnectConnection } from './commands/connection';
import { showIndexProperties, copyIndexName, generateDropIndexScript, generateReindexScript, generateScriptCreate, analyzeIndexUsage, generateAlterIndexScript, addIndexComment, cmdIndexOperations, cmdAddIndex } from './commands/indexes';
import { cmdAddObjectInDatabase, cmdBackupDatabase, cmdCreateDatabase, cmdDatabaseDashboard, cmdDatabaseOperations, cmdDeleteDatabase, cmdDisconnectDatabase as cmdDisconnectDatabaseLegacy, cmdGenerateCreateScript, cmdMaintenanceDatabase, cmdPsqlTool, cmdQueryTool, cmdRestoreDatabase, cmdScriptAlterDatabase, cmdShowConfiguration } from './commands/database';
import { cmdDropExtension, cmdEnableExtension, cmdExtensionOperations, cmdRefreshExtension } from './commands/extensions';
import { cmdCreateForeignTable, cmdEditForeignTable, cmdForeignTableOperations, cmdRefreshForeignTable } from './commands/foreignTables';
import { cmdForeignDataWrapperOperations, cmdShowForeignDataWrapperProperties, cmdCreateForeignServer, cmdForeignServerOperations, cmdShowForeignServerProperties, cmdDropForeignServer, cmdCreateUserMapping, cmdUserMappingOperations, cmdShowUserMappingProperties, cmdDropUserMapping, cmdRefreshForeignDataWrapper, cmdRefreshForeignServer, cmdRefreshUserMapping } from './commands/foreignDataWrappers';
import { cmdCallFunction, cmdCreateFunction, cmdDropFunction, cmdEditFunction, cmdFunctionOperations, cmdRefreshFunction, cmdShowFunctionProperties } from './commands/functions';
import { cmdCreateMaterializedView, cmdDropMatView, cmdEditMatView, cmdMatViewOperations, cmdRefreshMatView, cmdViewMatViewData, cmdViewMatViewProperties } from './commands/materializedViews';
import { cmdNewNotebook } from './commands/notebook';
import { cmdCreateObjectInSchema, cmdCreateSchema, cmdSchemaOperations, cmdShowSchemaProperties } from './commands/schema';
import { cmdCreateTable, cmdDropTable, cmdEditTable, cmdInsertTable, cmdMaintenanceAnalyze, cmdMaintenanceReindex, cmdMaintenanceVacuum, cmdScriptCreate, cmdScriptDelete, cmdScriptInsert, cmdScriptSelect, cmdScriptUpdate, cmdShowTableProperties, cmdTableOperations, cmdTruncateTable, cmdUpdateTable, cmdViewTableData } from './commands/tables';
import { cmdAllOperationsTypes, cmdCreateType, cmdDropType, cmdEditTypes, cmdRefreshType, cmdShowTypeProperties } from './commands/types';
import { cmdAddRole, cmdAddUser, cmdDropRole, cmdEditRole, cmdGrantRevokeRole, cmdRefreshRole, cmdRoleOperations, cmdShowRoleProperties } from './commands/usersRoles';
import { cmdCreateView, cmdDropView, cmdEditView, cmdRefreshView, cmdScriptCreate as cmdViewScriptCreate, cmdScriptSelect as cmdViewScriptSelect, cmdShowViewProperties, cmdViewData, cmdViewOperations } from './commands/views';
import { PostgresMetadata } from './common/types';
import { AiSettingsPanel } from './aiSettingsPanel';
import { ConnectionFormPanel } from './connectionForm';
import { ConnectionManagementPanel } from './connectionManagement';
import { PostgresNotebookProvider } from './notebookProvider';
import { PostgresNotebookSerializer } from './postgresNotebook';
import { AiCodeLensProvider } from './providers/AiCodeLensProvider';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { DatabaseTreeItem, DatabaseTreeProvider } from './providers/DatabaseTreeProvider';
import { PostgresKernel } from './providers/NotebookKernel';
import { ConnectionManager } from './services/ConnectionManager';
import { SecretStorageService } from './services/SecretStorageService';
import { ErrorHandlers } from './commands/helper';

export let outputChannel: vscode.OutputChannel;

// Store chat view provider reference for access by other components
let chatViewProviderInstance: ChatViewProvider | undefined;

export function getChatViewProvider(): ChatViewProvider | undefined {
    return chatViewProviderInstance;
}

export async function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('PgStudio');
    outputChannel.appendLine('postgres-explorer: Activating extension');
    console.log('postgres-explorer: Activating extension');

    // Initialize services
    SecretStorageService.getInstance(context);
    ConnectionManager.getInstance();

    // Create database tree provider instance
    const databaseTreeProvider = new DatabaseTreeProvider(context);

    // Register tree data provider and create tree view
    const treeView = vscode.window.createTreeView('postgresExplorer', {
        treeDataProvider: databaseTreeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Register the chat view provider
    chatViewProviderInstance = new ChatViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType,
            chatViewProviderInstance,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Register all commands
    const commands = [
        {
            command: 'postgres-explorer.addConnection',
            callback: () => {
                ConnectionFormPanel.show(context.extensionUri, context);
            }
        },
        {
            command: 'postgres-explorer.refreshConnections',
            callback: () => {
                databaseTreeProvider.refresh();
            }
        },
        {
            command: 'postgres-explorer.manageConnections',
            callback: () => {
                ConnectionManagementPanel.show(context.extensionUri, context);
            }
        },
        {
            command: 'postgres-explorer.aiSettings',
            callback: () => {
                AiSettingsPanel.show(context.extensionUri, context);
            }
        },
        {
            command: 'postgres-explorer.connect',
            callback: async (item: any) => await cmdConnectDatabase(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.disconnect',
            callback: async () => {
                databaseTreeProvider.refresh();
                vscode.window.showInformationMessage('Disconnected from PostgreSQL database');
            }
        },
        {
            command: 'postgres-explorer.queryTable',
            callback: async (item: any) => {
                if (!item || !item.schema) {
                    return;
                }

                const query = `SELECT * FROM ${item.schema}.${item.label} LIMIT 100;`;
                const notebook = await vscode.workspace.openNotebookDocument('postgres-notebook', new vscode.NotebookData([
                    new vscode.NotebookCellData(vscode.NotebookCellKind.Code, query, 'sql')
                ]));
                await vscode.window.showNotebookDocument(notebook);
            }
        },
        {
            command: 'postgres-explorer.newNotebook',
            callback: async (item: any) => await cmdNewNotebook(item)
        },
        {
            command: 'postgres-explorer.refresh',
            callback: () => databaseTreeProvider.refresh()
        },
        // Add database commands
        {
            command: 'postgres-explorer.createInDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdAddObjectInDatabase(item, context)
        },
        {
            command: 'postgres-explorer.createDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdCreateDatabase(item, context)
        },
        {
            command: 'postgres-explorer.dropDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdDeleteDatabase(item, context)
        },
        {
            command: 'postgres-explorer.scriptAlterDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdScriptAlterDatabase(item, context)
        },
        {
            command: 'postgres-explorer.databaseOperations',
            callback: async (item: DatabaseTreeItem) => await cmdDatabaseOperations(item, context)
        },
        {
            command: 'postgres-explorer.showDashboard',
            callback: async (item: DatabaseTreeItem) => await cmdDatabaseDashboard(item, context)
        },
        {
            command: 'postgres-explorer.backupDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdBackupDatabase(item, context)
        },
        {
            command: 'postgres-explorer.restoreDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdRestoreDatabase(item, context)
        },
        {
            command: 'postgres-explorer.generateCreateScript',
            callback: async (item: DatabaseTreeItem) => await cmdGenerateCreateScript(item, context)
        },
        {
            command: 'postgres-explorer.disconnectDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdDisconnectDatabaseLegacy(item, context)
        },
        {
            command: 'postgres-explorer.maintenanceDatabase',
            callback: async (item: DatabaseTreeItem) => await cmdMaintenanceDatabase(item, context)
        },
        {
            command: 'postgres-explorer.queryTool',
            callback: async (item: DatabaseTreeItem) => await cmdQueryTool(item, context)
        },
        {
            command: 'postgres-explorer.psqlTool',
            callback: async (item: DatabaseTreeItem) => await cmdPsqlTool(item, context)
        },
        {
            command: 'postgres-explorer.showConfiguration',
            callback: async (item: DatabaseTreeItem) => await cmdShowConfiguration(item, context)
        },
        // Add schema commands
        {
            command: 'postgres-explorer.createSchema',
            callback: async (item: DatabaseTreeItem) => await cmdCreateSchema(item, context)
        },
        {
            command: 'postgres-explorer.createInSchema',
            callback: async (item: DatabaseTreeItem) => await cmdCreateObjectInSchema(item, context)
        },
        {
            command: 'postgres-explorer.schemaOperations',
            callback: async (item: DatabaseTreeItem) => await cmdSchemaOperations(item, context)
        },
        {
            command: 'postgres-explorer.showSchemaProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowSchemaProperties(item, context)
        },
        // Add table commands
        {
            command: 'postgres-explorer.editTable',
            callback: async (item: DatabaseTreeItem) => await cmdEditTable(item, context)
        },
        {
            command: 'postgres-explorer.viewTableData',
            callback: async (item: DatabaseTreeItem) => await cmdViewTableData(item, context)
        },
        {
            command: 'postgres-explorer.dropTable',
            callback: async (item: DatabaseTreeItem) => await cmdDropTable(item, context)
        },
        {
            command: 'postgres-explorer.tableOperations',
            callback: async (item: DatabaseTreeItem) => await cmdTableOperations(item, context)
        },
        {
            command: 'postgres-explorer.truncateTable',
            callback: async (item: DatabaseTreeItem) => await cmdTruncateTable(item, context)
        },
        {
            command: 'postgres-explorer.insertData',
            callback: async (item: DatabaseTreeItem) => await cmdInsertTable(item, context)
        },
        {
            command: 'postgres-explorer.updateData',
            callback: async (item: DatabaseTreeItem) => await cmdUpdateTable(item, context)
        },
        {
            command: 'postgres-explorer.showTableProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowTableProperties(item, context)
        },
        // Add script commands
        {
            command: 'postgres-explorer.scriptSelect',
            callback: async (item: DatabaseTreeItem) => await cmdScriptSelect(item, context)
        },
        {
            command: 'postgres-explorer.scriptInsert',
            callback: async (item: DatabaseTreeItem) => await cmdScriptInsert(item, context)
        },
        {
            command: 'postgres-explorer.scriptUpdate',
            callback: async (item: DatabaseTreeItem) => await cmdScriptUpdate(item, context)
        },
        {
            command: 'postgres-explorer.scriptDelete',
            callback: async (item: DatabaseTreeItem) => await cmdScriptDelete(item, context)
        },
        {
            command: 'postgres-explorer.scriptCreate',
            callback: async (item: DatabaseTreeItem) => await cmdScriptCreate(item, context)
        },
        // Add maintenance commands
        {
            command: 'postgres-explorer.maintenanceVacuum',
            callback: async (item: DatabaseTreeItem) => await cmdMaintenanceVacuum(item, context)
        },
        {
            command: 'postgres-explorer.maintenanceAnalyze',
            callback: async (item: DatabaseTreeItem) => await cmdMaintenanceAnalyze(item, context)
        },
        {
            command: 'postgres-explorer.maintenanceReindex',
            callback: async (item: DatabaseTreeItem) => await cmdMaintenanceReindex(item, context)
        },

        // Add view commands
        {
            command: 'postgres-explorer.refreshView',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshView(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.editViewDefinition',
            callback: async (item: DatabaseTreeItem) => await cmdEditView(item, context)
        },
        {
            command: 'postgres-explorer.viewViewData',
            callback: async (item: DatabaseTreeItem) => await cmdViewData(item, context)
        },
        {
            command: 'postgres-explorer.dropView',
            callback: async (item: DatabaseTreeItem) => await cmdDropView(item, context)
        },
        {
            command: 'postgres-explorer.viewOperations',
            callback: async (item: DatabaseTreeItem) => await cmdViewOperations(item, context)
        },
        {
            command: 'postgres-explorer.showViewProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowViewProperties(item, context)
        },
        {
            command: 'postgres-explorer.viewScriptSelect',
            callback: async (item: DatabaseTreeItem) => await cmdViewScriptSelect(item, context)
        },
        {
            command: 'postgres-explorer.viewScriptCreate',
            callback: async (item: DatabaseTreeItem) => await cmdViewScriptCreate(item, context)
        },
        // Add function commands
        {
            command: 'postgres-explorer.refreshFunction',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshFunction(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.showFunctionProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowFunctionProperties(item, context)
        },
        {
            command: 'postgres-explorer.functionOperations',
            callback: async (item: DatabaseTreeItem) => await cmdFunctionOperations(item, context)
        },
        {
            command: 'postgres-explorer.createReplaceFunction',
            callback: async (item: DatabaseTreeItem) => await cmdEditFunction(item, context)
        },
        {
            command: 'postgres-explorer.callFunction',
            callback: async (item: DatabaseTreeItem) => await cmdCallFunction(item, context)
        },
        {
            command: 'postgres-explorer.dropFunction',
            callback: async (item: DatabaseTreeItem) => await cmdDropFunction(item, context)
        },
        // Add materialized view commands
        {
            command: 'postgres-explorer.refreshMaterializedView',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshMatView(item, context)
        },
        {
            command: 'postgres-explorer.editMatView',
            callback: async (item: DatabaseTreeItem) => await cmdEditMatView(item, context)
        },
        {
            command: 'postgres-explorer.viewMaterializedViewData',
            callback: async (item: DatabaseTreeItem) => await cmdViewMatViewData(item, context)
        },
        {
            command: 'postgres-explorer.showMaterializedViewProperties',
            callback: async (item: DatabaseTreeItem) => await cmdViewMatViewProperties(item, context)
        },
        {
            command: 'postgres-explorer.dropMatView',
            callback: async (item: DatabaseTreeItem) => await cmdDropMatView(item, context)
        },
        {
            command: 'postgres-explorer.materializedViewOperations',
            callback: async (item: DatabaseTreeItem) => await cmdMatViewOperations(item, context)
        },
        // Add type commands
        {
            command: 'postgres-explorer.refreshType',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshType(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.typeOperations',
            callback: async (item: DatabaseTreeItem) => await cmdAllOperationsTypes(item, context)
        },
        {
            command: 'postgres-explorer.editType',
            callback: async (item: DatabaseTreeItem) => await cmdEditTypes(item, context)
        },
        {
            command: 'postgres-explorer.showTypeProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowTypeProperties(item, context)
        },
        {
            command: 'postgres-explorer.dropType',
            callback: async (item: DatabaseTreeItem) => await cmdDropType(item, context)
        },
        // Add foreign table commands
        {
            command: 'postgres-explorer.refreshForeignTable',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshForeignTable(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.foreignTableOperations',
            callback: async (item: DatabaseTreeItem) => await cmdForeignTableOperations(item, context)
        },
        {
            command: 'postgres-explorer.editForeignTable',
            callback: async (item: DatabaseTreeItem) => await cmdEditForeignTable(item, context)
        },
        // Add role/user commands
        {
            command: 'postgres-explorer.refreshRole',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshRole(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.createUser',
            callback: async (item: DatabaseTreeItem) => await cmdAddUser(item, context)
        },
        {
            command: 'postgres-explorer.createRole',
            callback: async (item: DatabaseTreeItem) => await cmdAddRole(item, context)
        },
        {
            command: 'postgres-explorer.editRole',
            callback: async (item: DatabaseTreeItem) => await cmdEditRole(item, context)
        },
        {
            command: 'postgres-explorer.grantRevoke',
            callback: async (item: DatabaseTreeItem) => await cmdGrantRevokeRole(item, context)
        },
        {
            command: 'postgres-explorer.dropRole',
            callback: async (item: DatabaseTreeItem) => await cmdDropRole(item, context)
        },
        {
            command: 'postgres-explorer.roleOperations',
            callback: async (item: DatabaseTreeItem) => await cmdRoleOperations(item, context)
        },
        {
            command: 'postgres-explorer.showRoleProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowRoleProperties(item, context)
        },
        // Add extension commands
        {
            command: 'postgres-explorer.refreshExtension',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshExtension(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.enableExtension',
            callback: async (item: DatabaseTreeItem) => await cmdEnableExtension(item, context)
        },
        {
            command: 'postgres-explorer.extensionOperations',
            callback: async (item: DatabaseTreeItem) => await cmdExtensionOperations(item, context)
        },
        {
            command: 'postgres-explorer.dropExtension',
            callback: async (item: DatabaseTreeItem) => await cmdDropExtension(item, context)
        },
        // Add connection commands
        {
            command: 'postgres-explorer.disconnectConnection',
            callback: async (item: DatabaseTreeItem) => await cmdDisconnectConnection(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.reconnectConnection',
            callback: async (item: DatabaseTreeItem) => await cmdReconnectConnection(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.deleteConnection',
            callback: async (item: DatabaseTreeItem) => await cmdDisconnectDatabase(item, context, databaseTreeProvider)
        },

        {
            command: 'postgres-explorer.createTable',
            callback: async (item: DatabaseTreeItem) => await cmdCreateTable(item, context)
        },
        {
            command: 'postgres-explorer.createView',
            callback: async (item: DatabaseTreeItem) => await cmdCreateView(item, context)
        },
        {
            command: 'postgres-explorer.createFunction',
            callback: async (item: DatabaseTreeItem) => await cmdCreateFunction(item, context)
        },
        {
            command: 'postgres-explorer.createMaterializedView',
            callback: async (item: DatabaseTreeItem) => await cmdCreateMaterializedView(item, context)
        },
        {
            command: 'postgres-explorer.createType',
            callback: async (item: DatabaseTreeItem) => await cmdCreateType(item, context)
        },
        {
            command: 'postgres-explorer.createForeignTable',
            callback: async (item: DatabaseTreeItem) => await cmdCreateForeignTable(item, context)
        },
        // Foreign Data Wrapper commands
        {
            command: 'postgres-explorer.foreignDataWrapperOperations',
            callback: async (item: DatabaseTreeItem) => await cmdForeignDataWrapperOperations(item, context)
        },
        {
            command: 'postgres-explorer.showForeignDataWrapperProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowForeignDataWrapperProperties(item, context)
        },
        {
            command: 'postgres-explorer.refreshForeignDataWrapper',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshForeignDataWrapper(item, context, databaseTreeProvider)
        },
        // Foreign Server commands
        {
            command: 'postgres-explorer.createForeignServer',
            callback: async (item: DatabaseTreeItem) => await cmdCreateForeignServer(item, context)
        },
        {
            command: 'postgres-explorer.foreignServerOperations',
            callback: async (item: DatabaseTreeItem) => await cmdForeignServerOperations(item, context)
        },
        {
            command: 'postgres-explorer.showForeignServerProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowForeignServerProperties(item, context)
        },
        {
            command: 'postgres-explorer.dropForeignServer',
            callback: async (item: DatabaseTreeItem) => await cmdDropForeignServer(item, context)
        },
        {
            command: 'postgres-explorer.refreshForeignServer',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshForeignServer(item, context, databaseTreeProvider)
        },
        // User Mapping commands
        {
            command: 'postgres-explorer.createUserMapping',
            callback: async (item: DatabaseTreeItem) => await cmdCreateUserMapping(item, context)
        },
        {
            command: 'postgres-explorer.userMappingOperations',
            callback: async (item: DatabaseTreeItem) => await cmdUserMappingOperations(item, context)
        },
        {
            command: 'postgres-explorer.showUserMappingProperties',
            callback: async (item: DatabaseTreeItem) => await cmdShowUserMappingProperties(item, context)
        },
        {
            command: 'postgres-explorer.dropUserMapping',
            callback: async (item: DatabaseTreeItem) => await cmdDropUserMapping(item, context)
        },
        {
            command: 'postgres-explorer.refreshUserMapping',
            callback: async (item: DatabaseTreeItem) => await cmdRefreshUserMapping(item, context, databaseTreeProvider)
        },
        {
            command: 'postgres-explorer.createRole',
            callback: async (item: DatabaseTreeItem) => await cmdAddRole(item, context)
        },
        {
            command: 'postgres-explorer.enableExtension',
            callback: async (item: DatabaseTreeItem) => await cmdEnableExtension(item, context)
        },

        {
            command: 'postgres-explorer.aiAssist',
            callback: async (cell: vscode.NotebookCell) => await cmdAiAssist(cell, context, outputChannel)
        },

        // Column commands
        {
            command: 'postgres-explorer.showColumnProperties',
            callback: async (item: DatabaseTreeItem) => await showColumnProperties(item)
        },
        {
            command: 'postgres-explorer.copyColumnName',
            callback: async (item: DatabaseTreeItem) => await copyColumnName(item)
        },
        {
            command: 'postgres-explorer.copyColumnNameQuoted',
            callback: async (item: DatabaseTreeItem) => await copyColumnNameQuoted(item)
        },
        {
            command: 'postgres-explorer.generateSelectStatement',
            callback: async (item: DatabaseTreeItem) => await generateSelectStatement(item)
        },
        {
            command: 'postgres-explorer.generateWhereClause',
            callback: async (item: DatabaseTreeItem) => await generateWhereClause(item)
        },
        {
            command: 'postgres-explorer.generateAlterColumnScript',
            callback: async (item: DatabaseTreeItem) => await generateAlterColumnScript(item)
        },
        {
            command: 'postgres-explorer.generateDropColumnScript',
            callback: async (item: DatabaseTreeItem) => await generateDropColumnScript(item)
        },
        {
            command: 'postgres-explorer.generateRenameColumnScript',
            callback: async (item: DatabaseTreeItem) => await generateRenameColumnScript(item)
        },
        {
            command: 'postgres-explorer.addColumnComment',
            callback: async (item: DatabaseTreeItem) => await addColumnComment(item)
        },
        {
            command: 'postgres-explorer.generateIndexOnColumn',
            callback: async (item: DatabaseTreeItem) => await generateIndexOnColumn(item)
        },
        {
            command: 'postgres-explorer.viewColumnStatistics',
            callback: async (item: DatabaseTreeItem) => await viewColumnStatistics(item)
        },

        // Constraint commands
        {
            command: 'postgres-explorer.showConstraintProperties',
            callback: async (item: DatabaseTreeItem) => await showConstraintProperties(item)
        },
        {
            command: 'postgres-explorer.copyConstraintName',
            callback: async (item: DatabaseTreeItem) => await copyConstraintName(item)
        },
        {
            command: 'postgres-explorer.generateDropConstraintScript',
            callback: async (item: DatabaseTreeItem) => await generateDropConstraintScript(item)
        },
        {
            command: 'postgres-explorer.generateAlterConstraintScript',
            callback: async (item: DatabaseTreeItem) => await generateAlterConstraintScript(item)
        },
        {
            command: 'postgres-explorer.validateConstraint',
            callback: async (item: DatabaseTreeItem) => await validateConstraint(item)
        },
        {
            command: 'postgres-explorer.generateAddConstraintScript',
            callback: async (item: DatabaseTreeItem) => await generateAddConstraintScript(item)
        },
        {
            command: 'postgres-explorer.viewConstraintDependencies',
            callback: async (item: DatabaseTreeItem) => await viewConstraintDependencies(item)
        },
        {
            command: 'postgres-explorer.constraintOperations',
            callback: async (item: DatabaseTreeItem) => await cmdConstraintOperations(item, context)
        },

        // Index commands
        {
            command: 'postgres-explorer.showIndexProperties',
            callback: async (item: DatabaseTreeItem) => await showIndexProperties(item)
        },
        {
            command: 'postgres-explorer.copyIndexName',
            callback: async (item: DatabaseTreeItem) => await copyIndexName(item)
        },
        {
            command: 'postgres-explorer.generateDropIndexScript',
            callback: async (item: DatabaseTreeItem) => await generateDropIndexScript(item)
        },
        {
            command: 'postgres-explorer.generateReindexScript',
            callback: async (item: DatabaseTreeItem) => await generateReindexScript(item)
        },
        {
            command: 'postgres-explorer.generateScriptCreate',
            callback: async (item: DatabaseTreeItem) => await generateScriptCreate(item)
        },
        {
            command: 'postgres-explorer.analyzeIndexUsage',
            callback: async (item: DatabaseTreeItem) => await analyzeIndexUsage(item)
        },
        {
            command: 'postgres-explorer.generateAlterIndexScript',
            callback: async (item: DatabaseTreeItem) => await generateAlterIndexScript(item)
        },
        {
            command: 'postgres-explorer.addIndexComment',
            callback: async (item: DatabaseTreeItem) => await addIndexComment(item)
        },
        {
            command: 'postgres-explorer.indexOperations',
            callback: async (item: DatabaseTreeItem) => await cmdIndexOperations(item, context)
        },
        {
            command: 'postgres-explorer.addColumn',
            callback: async (item: DatabaseTreeItem) => await cmdAddColumn(item)
        },
        {
            command: 'postgres-explorer.addConstraint',
            callback: async (item: DatabaseTreeItem) => await cmdAddConstraint(item)
        },
        {
            command: 'postgres-explorer.addIndex',
            callback: async (item: DatabaseTreeItem) => await cmdAddIndex(item)
        },
    ];

    // Register all commands
    console.log('Starting command registration...');
    outputChannel.appendLine('Starting command registration...');

    commands.forEach(({ command, callback }) => {
        try {
            console.log(`Registering command: ${command}`);
            context.subscriptions.push(
                vscode.commands.registerCommand(command, callback)
            );
        } catch (e) {
            console.error(`Failed to register command ${command}:`, e);
            outputChannel.appendLine(`Failed to register command ${command}: ${e}`);
        }
    });

    outputChannel.appendLine('All commands registered successfully.');

    // Create kernel with message handler
    // Create kernel for postgres-notebook
    const kernel = new PostgresKernel(context, 'postgres-notebook', async (message: { type: string; command: string; format?: string; content?: string; filename?: string }) => {
        console.log('Extension: Received message from kernel:', message);
        if (message.type === 'custom' && message.command === 'export') {
            console.log('Extension: Handling export command');
            vscode.commands.executeCommand('postgres-explorer.exportData', {
                format: message.format,
                content: message.content,
                filename: message.filename
            });
        }
    });
    context.subscriptions.push(kernel);

    // Create kernel for postgres-query (SQL files)
    const queryKernel = new PostgresKernel(context, 'postgres-query');

    // Set up renderer messaging to receive messages from the notebook renderer
    console.log('Extension: Setting up renderer messaging for postgres-query-renderer');
    outputChannel.appendLine('Setting up renderer messaging for postgres-query-renderer');
    const rendererMessaging = vscode.notebooks.createRendererMessaging('postgres-query-renderer');
    rendererMessaging.onDidReceiveMessage(async (event) => {
        console.log('Extension: Received message from renderer:', event.message);
        outputChannel.appendLine('Received message from renderer: ' + JSON.stringify(event.message));
        const message = event.message;
        const notebook = event.editor.notebook;

        if (message.type === 'execute_update_background') {
            console.log('Extension: Processing execute_update_background');
            const { statements } = message;

            try {
                // Get connection from notebook metadata
                const metadata = notebook.metadata as PostgresMetadata;
                if (!metadata?.connectionId) {
                    await ErrorHandlers.handleCommandError(new Error('No connection found in notebook metadata'), 'execute background update');
                    return;
                }

                const password = await SecretStorageService.getInstance().getPassword(metadata.connectionId);

                const client = new Client({
                    host: metadata.host,
                    port: metadata.port,
                    database: metadata.databaseName,
                    user: metadata.username,
                    password: password || metadata.password || undefined,
                });

                await client.connect();
                console.log('Extension: Connected to database for background update');

                // Execute each statement
                let successCount = 0;
                let errorCount = 0;
                for (const stmt of statements) {
                    try {
                        console.log('Extension: Executing:', stmt);
                        await client.query(stmt);
                        successCount++;
                    } catch (err: any) {
                        console.error('Extension: Statement error:', err.message);
                        errorCount++;
                        await ErrorHandlers.handleCommandError(err, 'execute update statement');
                    }
                }

                await client.end();

                if (successCount > 0) {
                    vscode.window.showInformationMessage(`Successfully updated ${successCount} row(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
                }
            } catch (err: any) {
                console.error('Extension: Background update error:', err);
                await ErrorHandlers.handleCommandError(err, 'execute background updates');
            }
        } else if (message.type === 'script_delete') {
            console.log('Extension: Processing script_delete from renderer');
            const { schema, table, primaryKeys, rows, cellIndex } = message;

            try {
                // Construct DELETE query
                let query = '';
                for (const row of rows) {
                    const conditions: string[] = [];

                    for (const pk of primaryKeys) {
                        const val = row[pk];
                        const valStr = typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val;
                        conditions.push(`"${pk}" = ${valStr}`);
                    }
                    query += `DELETE FROM "${schema}"."${table}" WHERE ${conditions.join(' AND ')};\n`;
                }

                // Insert new cell with the query
                const targetIndex = cellIndex + 1;
                const newCell = new vscode.NotebookCellData(
                    vscode.NotebookCellKind.Code,
                    query,
                    'sql'
                );

                const edit = new vscode.NotebookEdit(
                    new vscode.NotebookRange(targetIndex, targetIndex),
                    [newCell]
                );

                const workspaceEdit = new vscode.WorkspaceEdit();
                workspaceEdit.set(notebook.uri, [edit]);
                await vscode.workspace.applyEdit(workspaceEdit);
            } catch (err: any) {
                await ErrorHandlers.handleCommandError(err, 'generate delete script');
                console.error('Extension: Script delete error:', err);
            }
        }
    });
    // Note: rendererMessaging doesn't have dispose method, so we don't add to subscriptions

    // Register notebook providers
    const notebookProvider = new PostgresNotebookProvider();
    context.subscriptions.push(
        vscode.workspace.registerNotebookSerializer('postgres-notebook', notebookProvider),
        vscode.workspace.registerNotebookSerializer('postgres-query', new PostgresNotebookSerializer())
    );

    // Register SQL completion provider
    const { SqlCompletionProvider } = require('./providers/SqlCompletionProvider');
    const sqlCompletionProvider = new SqlCompletionProvider();
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: 'sql' },
            sqlCompletionProvider,
            '.' // Trigger on dot for schema.table suggestions
        ),
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'vscode-notebook-cell', language: 'sql' },
            sqlCompletionProvider,
            '.'
        )
    );

    // Register CodeLens Provider for both 'postgres' and 'sql' languages
    const aiCodeLensProvider = new AiCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'postgres', scheme: 'vscode-notebook-cell' },
            aiCodeLensProvider
        ),
        vscode.languages.registerCodeLensProvider(
            { language: 'sql', scheme: 'vscode-notebook-cell' },
            aiCodeLensProvider
        )
    );
    outputChannel.appendLine('AiCodeLensProvider registered for postgres and sql languages.');

    // Immediately migrate any existing passwords to SecretStorage
    await migrateExistingPasswords(context);
}

export async function deactivate() {
    await ConnectionManager.getInstance().closeAll();
}

async function migrateExistingPasswords(context: vscode.ExtensionContext) {
    try {
        const config = vscode.workspace.getConfiguration();
        const connections = config.get<any[]>('postgresExplorer.connections') || [];

        // First remove passwords from settings to ensure they don't persist
        const sanitizedConnections = connections.map(({ password, ...connWithoutPassword }) => connWithoutPassword);
        await config.update('postgresExplorer.connections', sanitizedConnections, vscode.ConfigurationTarget.Global);

        // Then store passwords in SecretStorage
        for (const conn of connections) {
            if (conn.password) {
                await SecretStorageService.getInstance().setPassword(conn.id, conn.password);
            }
        }

        return true;
    } catch (error) {
        console.error('Failed to migrate passwords:', error);
        return false;
    }
}
