import { Client } from 'pg';
import * as vscode from 'vscode';
import { PostgresMetadata } from './common/types';
import { PostgresKernel } from './providers/NotebookKernel';
import { ConnectionManager } from './services/ConnectionManager';
import { SecretStorageService } from './services/SecretStorageService';
import { ErrorHandlers } from './commands/helper';
import { registerProviders } from './activation/providers';
import { registerAllCommands } from './activation/commands';
import { ChatViewProvider } from './providers/ChatViewProvider';

export let outputChannel: vscode.OutputChannel;

// Store chat view provider reference for access by other components
let globalChatViewProvider: ChatViewProvider | undefined;

// Export for other modules if needed, though dependency injection is preferred
export function getChatViewProvider(): ChatViewProvider | undefined {
  return globalChatViewProvider;
}

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('PgStudio');
  outputChannel.appendLine('postgres-explorer: Activating extension');
  console.log('postgres-explorer: Activating extension');

  // Initialize services
  SecretStorageService.getInstance(context);
  ConnectionManager.getInstance();

  // Register all providers
  const { databaseTreeProvider, chatViewProviderInstance } = registerProviders(context, outputChannel);
  globalChatViewProvider = chatViewProviderInstance;

  // Register all commands
  registerAllCommands(context, databaseTreeProvider, chatViewProviderInstance, outputChannel);

  // NOTE: Kernel and Renderer messaging logic kept here for now as they are closely tied to extension cycle
  // TODO: Move these to src/activation/kernels.ts in next step

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

    if (message.type === 'explainError') {
      if (chatViewProviderInstance) {
        await chatViewProviderInstance.handleExplainError(message.error, message.query);
      }
      return;
    }
    if (message.type === 'fixQuery') {
      if (chatViewProviderInstance) {
        await chatViewProviderInstance.handleFixQuery(message.error, message.query);
      }
      return;
    }
    if (message.type === 'analyzeData') {
      if (chatViewProviderInstance) {
        await chatViewProviderInstance.handleAnalyzeData(message.data, message.query, message.rowCount);
      }
      return;
    }
    if (message.type === 'optimizeQuery') {
      if (chatViewProviderInstance) {
        await chatViewProviderInstance.handleOptimizeQuery(message.query, message.executionTime);
      }
      return;
    }
    if (message.type === 'sendToChat') {
      if (chatViewProviderInstance) {
        // Focus chat view first
        await vscode.commands.executeCommand('postgresExplorer.chatView.focus');
        await chatViewProviderInstance.sendToChat(message.data);
      }
      return;
    }

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

  // Immediately migrate any existing passwords to SecretStorage
  // We use the imported reference instead of require to ensure type safety
  const { migrateExistingPasswords } = await import('./services/SecretStorageService');
  await migrateExistingPasswords(context);
}

export function deactivate() {
  console.log('postgres-explorer: Deactivating extension');
}
