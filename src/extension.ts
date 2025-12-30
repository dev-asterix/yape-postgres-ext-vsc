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

let chatViewProvider: ChatViewProvider | undefined;

export function getChatViewProvider(): ChatViewProvider | undefined {
  return chatViewProvider;
}

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('PgStudio');
  outputChannel.appendLine('Activating PgStudio extension');

  SecretStorageService.getInstance(context);
  ConnectionManager.getInstance();

  const { databaseTreeProvider, chatViewProviderInstance: chatView } = registerProviders(context, outputChannel);
  chatViewProvider = chatView;

  registerAllCommands(context, databaseTreeProvider, chatView, outputChannel);

  // TODO: Move kernel logic to src/activation/kernels.ts
  const kernel = new PostgresKernel(context, 'postgres-notebook', async (msg: { type: string; command: string; format?: string; content?: string; filename?: string }) => {
    if (msg.type === 'custom' && msg.command === 'export') {
      vscode.commands.executeCommand('postgres-explorer.exportData', {
        format: msg.format,
        content: msg.content,
        filename: msg.filename
      });
    }
  });
  context.subscriptions.push(kernel);

  const queryKernel = new PostgresKernel(context, 'postgres-query');

  const rendererMessaging = vscode.notebooks.createRendererMessaging('postgres-query-renderer');
  rendererMessaging.onDidReceiveMessage(async (event) => {
    const message = event.message;
    const notebook = event.editor.notebook;

    if (message.type === 'explainError') {
      if (chatView) {
        await chatView.handleExplainError(message.error, message.query);
      }
      return;
    }
    if (message.type === 'fixQuery') {
      if (chatView) {
        await chatView.handleFixQuery(message.error, message.query);
      }
      return;
    }
    if (message.type === 'analyzeData') {
      if (chatView) {
        await chatView.handleAnalyzeData(message.data, message.query, message.rowCount);
      }
      return;
    }
    if (message.type === 'optimizeQuery') {
      if (chatView) {
        await chatView.handleOptimizeQuery(message.query, message.executionTime);
      }
      return;
    }
    if (message.type === 'sendToChat') {
      if (chatView) {
        await vscode.commands.executeCommand('postgresExplorer.chatView.focus');
        await chatView.sendToChat(message.data);
      }
      return;
    }

    if (message.type === 'execute_update_background') {
      const { statements } = message;
      try {
        const metadata = notebook.metadata as PostgresMetadata;
        if (!metadata?.connectionId) {
          await ErrorHandlers.handleCommandError(new Error('No connection in notebook metadata'), 'background update');
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
        let successCount = 0;
        let errorCount = 0;
        for (const stmt of statements) {
          try {
            await client.query(stmt);
            successCount++;
          } catch (err: any) {
            errorCount++;
            await ErrorHandlers.handleCommandError(err, 'update statement');
          }
        }

        await client.end();

        if (successCount > 0) {
          vscode.window.showInformationMessage(`Successfully updated ${successCount} row(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
        }
      } catch (err: any) {
        await ErrorHandlers.handleCommandError(err, 'background updates');
      }
    } else if (message.type === 'script_delete') {
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
      }
    }
  });

  const { migrateExistingPasswords } = await import('./services/SecretStorageService');
  await migrateExistingPasswords(context);
}

export function deactivate() {
  outputChannel?.appendLine('Deactivating PgStudio extension');
}
