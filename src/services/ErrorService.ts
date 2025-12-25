import * as vscode from 'vscode';

export interface IErrorService {
  showError(message: string, actionLabel?: string, actionCommand?: string): Promise<void>;
  handleCommandError(err: any, operation: string): Promise<void>;
}

export class ErrorService implements IErrorService {
  private static instance: ErrorService;

  private constructor() { }

  public static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService();
    }
    return ErrorService.instance;
  }

  /**
   * Show error with optional action button
   */
  public async showError(message: string, actionLabel?: string, actionCommand?: string): Promise<void> {
    if (actionLabel && actionCommand) {
      const selection = await vscode.window.showErrorMessage(message, actionLabel);
      if (selection === actionLabel) {
        await vscode.commands.executeCommand(actionCommand);
      }
    } else {
      vscode.window.showErrorMessage(message);
    }
  }

  /**
   * Standard error handler for command operations
   */
  public async handleCommandError(err: any, operation: string): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Status: Failed to ${operation}`, err);
    vscode.window.showErrorMessage(`Failed to ${operation}: ${message}`);
  }
}
