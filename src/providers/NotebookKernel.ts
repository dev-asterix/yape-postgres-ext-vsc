
import * as vscode from 'vscode';
import { PostgresMetadata } from '../common/types';
import { ConnectionManager } from '../services/ConnectionManager';
import { CompletionProvider } from './kernel/CompletionProvider';
import { SqlExecutor } from './kernel/SqlExecutor';

export class PostgresKernel implements vscode.Disposable {
  readonly id = 'postgres-kernel';
  readonly label = 'PostgreSQL';
  readonly supportedLanguages = ['sql'];

  private readonly _controller: vscode.NotebookController;
  private readonly _executor: SqlExecutor;

  constructor(private readonly context: vscode.ExtensionContext, viewType: string = 'postgres-notebook', messageHandler?: (message: any) => void) {
    this._controller = vscode.notebooks.createNotebookController(
      this.id + '-' + viewType,
      viewType,
      this.label
    );

    this._controller.supportedLanguages = this.supportedLanguages;
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this._executeAll.bind(this);

    this._executor = new SqlExecutor(this._controller);

    // Register completion provider
    const completionProvider = new CompletionProvider();
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { scheme: 'vscode-notebook-cell', language: 'sql' },
        completionProvider,
        ' ', '.', '"' // Trigger characters
      )
    );

    // Handle messages from renderer
    (this._controller as any).onDidReceiveMessage(async (event: any) => {
      this.handleMessage(event);
    });
  }

  private async _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): Promise<void> {
    for (const cell of cells) {
      await this._executor.executeCell(cell);
    }
  }

  private async handleMessage(event: any) {
    const { type } = event.message;
    console.log(`NotebookKernel: Received message type: ${type}`);

    if (type === 'cancel_query') {
      await this._executor.cancelQuery(event.message);
    } else if (type === 'execute_update_background') {
      await this._executor.executeBackgroundUpdate(event.message, event.editor.notebook);
    } else if (type === 'script_delete') {
      await this.handleScriptDelete(event);
    } else if (type === 'execute_update') {
      await this.handleExecuteUpdate(event);
    } else if (type === 'export_request') {
      await this.handleExportRequest(event);
    } else if (type === 'delete_row') {
      await this.handleDeleteRow(event);
    } else if (type === 'sendToChat') {
      const { data } = event.message;
      await vscode.commands.executeCommand('postgresExplorer.chatView.focus');
      await vscode.commands.executeCommand('postgres-explorer.sendToChat', data);
    } else if (type === 'saveChanges') {
      console.log('NotebookKernel: Handling saveChanges');
      await this.handleSaveChanges(event);
    } else if (type === 'showErrorMessage') {
      vscode.window.showErrorMessage(event.message.message);
    }
  }

  private async handleSaveChanges(event: any) {
    console.log('NotebookKernel: handleSaveChanges called');
    const { updates, tableInfo } = event.message;
    console.log('NotebookKernel: Updates received:', JSON.stringify(updates));
    console.log('NotebookKernel: TableInfo:', JSON.stringify(tableInfo));

    const { schema, table } = tableInfo;
    const statements: string[] = [];

    for (const update of updates) {
      const { keys, column, value } = update;

      // Format value for SQL
      let valueStr = 'NULL';
      if (value !== null && value !== undefined) {
        if (typeof value === 'boolean') {
          valueStr = value ? 'TRUE' : 'FALSE';
        } else if (typeof value === 'number') {
          valueStr = String(value);
        } else if (typeof value === 'object') {
          valueStr = `'${JSON.stringify(value).replace(/'/g, "''")}'`;
        } else {
          valueStr = `'${String(value).replace(/'/g, "''")}'`;
        }
      }

      // Format conditions
      const conditions: string[] = [];
      for (const [pk, pkVal] of Object.entries(keys)) {
        let pkValStr = 'NULL';
        if (pkVal !== null && pkVal !== undefined) {
          if (typeof pkVal === 'number' || typeof pkVal === 'boolean') {
            pkValStr = String(pkVal);
          } else {
            pkValStr = `'${String(pkVal).replace(/'/g, "''")}'`;
          }
        }
        conditions.push(`"${pk}" = ${pkValStr}`);
      }

      const query = `UPDATE "${schema}"."${table}" SET "${column}" = ${valueStr} WHERE ${conditions.join(' AND ')};`;
      console.log('NotebookKernel: Generated query:', query);
      statements.push(query);
    }

    if (statements.length === 0) {
      console.warn('NotebookKernel: No statements generated');
      return;
    }

    // Reuse existing background update executor
    await this._executor.executeBackgroundUpdate({ statements }, event.editor.notebook);
  }

  // --- Lightweight Message Handlers that don't need heavy services ---

  private async handleScriptDelete(event: any) {
    const { schema, table, primaryKeys, rows, cellIndex } = event.message;
    const notebook = event.editor.notebook;
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

      this.insertCell(notebook, cellIndex + 1, query);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to generate delete script: ${err.message}`);
    }
  }

  private async handleExecuteUpdate(event: any) {
    const { statements, cellIndex } = event.message;
    const notebook = event.editor.notebook;
    try {
      const query = statements.join('\n');
      this.insertCell(notebook, cellIndex + 1, `-- Update statements generated\n${query}`);
      vscode.window.showInformationMessage(`Generated ${statements.length} UPDATE statement(s).`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to generate update script: ${err.message}`);
    }
  }

  private async insertCell(notebook: vscode.NotebookDocument, index: number, content: string) {
    const newCell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, content, 'sql');
    const edit = new vscode.NotebookEdit(new vscode.NotebookRange(index, index), [newCell]);
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(notebook.uri, [edit]);
    await vscode.workspace.applyEdit(workspaceEdit);
  }

  private async handleExportRequest(event: any) {
    const { rows: displayRows, columns, query: originalQuery } = event.message;
    // ... (Keep existing simple export logic here for now, or move to ResultFormatter if it grows)

    // For this refactor, let's keep the existing logic but compacted.
    const selection = await vscode.window.showQuickPick(['Save as CSV', 'Save as JSON', 'Copy to Clipboard']);
    if (!selection) return;

    // ... (Use displayRows for now)

    const rowsToExport = displayRows; // Simplified to just use displayed rows for this refactor step

    if (selection === 'Copy to Clipboard') {
      const csv = this.rowsToCsv(rowsToExport, columns);
      await vscode.env.clipboard.writeText(csv);
      vscode.window.showInformationMessage('Copied to clipboard');
    } else if (selection === 'Save as CSV') {
      const csv = this.rowsToCsv(rowsToExport, columns);
      const uri = await vscode.window.showSaveDialog({ filters: { 'CSV': ['csv'] } });
      if (uri) await vscode.workspace.fs.writeFile(uri, Buffer.from(csv));
    } else if (selection === 'Save as JSON') {
      const json = JSON.stringify(rowsToExport, null, 2);
      const uri = await vscode.window.showSaveDialog({ filters: { 'JSON': ['json'] } });
      if (uri) await vscode.workspace.fs.writeFile(uri, Buffer.from(json));
    }
  }

  private rowsToCsv(rows: any[], columns: string[]): string {
    const header = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
    const body = rows.map(row => columns.map(col => {
      const val = row[col];
      const str = String(val ?? '');
      return str.includes(',') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')).join('\n');
    return `${header}\n${body}`;
  }

  private async handleDeleteRow(event: any) {
    // Re-using the simple execute logic
    const { schema, table, primaryKeys, row } = event.message;
    const notebook = event.editor.notebook;
    const metadata = notebook.metadata as PostgresMetadata;
    if (!metadata?.connectionId) return;

    try {
      const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
      const connection = connections.find(c => c.id === metadata.connectionId);
      if (!connection) throw new Error('Connection not found');

      const client = await ConnectionManager.getInstance().getSessionClient({
        id: connection.id,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        database: metadata.databaseName || connection.database,
        name: connection.name
      }, notebook.uri.toString());

      const conditions: string[] = [];
      const values: any[] = [];
      let i = 1;
      for (const pk of primaryKeys) {
        conditions.push(`"${pk}" = $${i++}`);
        values.push(row[pk]);
      }
      await client.query(`DELETE FROM "${schema}"."${table}" WHERE ${conditions.join(' AND ')}`, values);
      vscode.window.showInformationMessage('Row deleted.');
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to delete row: ${err.message}`);
    }
  }

  dispose() {
    this._controller.dispose();
  }
}
