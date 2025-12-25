import * as vscode from 'vscode';

export class AiCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
    // Only provide CodeLens for PostgreSQL/SQL notebook cells
    if (document.languageId !== 'postgres' && document.languageId !== 'sql') {
      return [];
    }

    const range = new vscode.Range(0, 0, 0, 0);

    const askAiCommand: vscode.Command = {
      title: '$(sparkle) Ask AI',
      tooltip: 'Ask AI to modify this query',
      command: 'postgres-explorer.aiAssist',
      arguments: []
    };

    const chatCommand: vscode.Command = {
      title: '$(comment-discussion) Chat',
      tooltip: 'Open SQL Assistant chat with this query',
      command: 'postgres-explorer.chatWithQuery',
      arguments: []
    };

    return [
      new vscode.CodeLens(range, askAiCommand),
      new vscode.CodeLens(range, chatCommand)
    ];
  }
}
