import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../../providers/DatabaseTreeProvider';
import { getDatabaseConnection } from '../../commands/helper';
import { ConnectionManager } from '../../services/ConnectionManager';

export abstract class CommandBase {
  protected context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  protected async execute(item: DatabaseTreeItem, operationName: string, action: (connection: any, client: any, metadata: any) => Promise<void>): Promise<void> {
    await CommandBase.run(this.context, item, operationName, action);
  }

  public static async run(context: vscode.ExtensionContext, item: DatabaseTreeItem, operationName: string, action: (connection: any, client: any, metadata: any) => Promise<void>): Promise<void> {
    let dbConn;
    try {
      dbConn = await getDatabaseConnection(item);
      const { connection, client, metadata } = dbConn;
      try {
        await action(connection, client, metadata);
      } finally {
        if (dbConn && dbConn.release) {
          dbConn.release();
        }
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to ${operationName}: ${err.message}`);
    }
  }
}
