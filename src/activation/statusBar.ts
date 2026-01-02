import * as vscode from 'vscode';
import { PostgresMetadata } from '../common/types';

/**
 * Manages the notebook status bar items that display connection and database info.
 * Shows clickable status items when a PostgreSQL notebook is active.
 */
export class NotebookStatusBar implements vscode.Disposable {
  private readonly connectionItem: vscode.StatusBarItem;
  private readonly databaseItem: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.connectionItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.connectionItem.command = 'postgres-explorer.switchConnection';
    this.connectionItem.tooltip = 'Click to switch PostgreSQL connection';

    this.databaseItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.databaseItem.command = 'postgres-explorer.switchDatabase';
    this.databaseItem.tooltip = 'Click to switch database';

    this.disposables.push(
      this.connectionItem,
      this.databaseItem,
      vscode.window.onDidChangeActiveNotebookEditor(() => this.update()),
      vscode.workspace.onDidChangeNotebookDocument((e) => {
        if (vscode.window.activeNotebookEditor?.notebook === e.notebook) {
          this.update();
        }
      })
    );

    this.update();
  }

  /** Updates the status bar based on the active notebook editor */
  update(): void {
    const editor = vscode.window.activeNotebookEditor;

    if (!this.isPostgresNotebook(editor)) {
      this.hide();
      return;
    }

    const metadata = editor!.notebook.metadata as PostgresMetadata;
    const connection = this.getConnection(metadata?.connectionId);

    if (!metadata?.connectionId) {
      this.showNoConnection();
      return;
    }

    this.showConnection(connection, metadata);
  }

  private isPostgresNotebook(editor: vscode.NotebookEditor | undefined): boolean {
    return !!editor && (
      editor.notebook.notebookType === 'postgres-notebook' ||
      editor.notebook.notebookType === 'postgres-query'
    );
  }

  private getConnection(connectionId: string | undefined): any {
    if (!connectionId) return null;
    const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
    return connections.find(c => c.id === connectionId);
  }

  private hide(): void {
    this.connectionItem.hide();
    this.databaseItem.hide();
  }

  private showNoConnection(): void {
    this.connectionItem.text = '$(plug) Click to Connect';
    this.connectionItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.connectionItem.show();
    this.databaseItem.hide();
  }

  private showConnection(connection: any, metadata: PostgresMetadata): void {
    const connName = connection?.name || connection?.host || 'Unknown';
    const dbName = metadata.databaseName || connection?.database || 'default';

    this.connectionItem.text = `$(server) ${connName}`;
    this.connectionItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    this.connectionItem.show();

    this.databaseItem.text = `$(database) ${dbName}`;
    this.databaseItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    this.databaseItem.show();

    // Update context for when clauses
    vscode.commands.executeCommand('setContext', 'pgstudio.connectionName', connName);
    vscode.commands.executeCommand('setContext', 'pgstudio.databaseName', dbName);
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
