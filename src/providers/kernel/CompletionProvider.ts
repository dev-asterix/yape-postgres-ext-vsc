
import * as vscode from 'vscode';

export class CompletionProvider implements vscode.CompletionItemProvider {

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    const items: vscode.CompletionItem[] = [];

    // Add basic SQL keywords
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'LIMIT', 'ORDER BY', 'GROUP BY', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
      'INNER JOIN', 'OUTER JOIN', 'UPDATE', 'DELETE', 'INSERT INTO', 'VALUES', 'CREATE TABLE',
      'ALTER TABLE', 'DROP TABLE', 'AND', 'OR', 'NOT', 'NULL', 'IS NULL', 'AS', 'ON', 'IN', 'BETWEEN',
      'LIKE', 'ILIKE', 'HAVING', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'TRUE', 'FALSE'
    ];

    for (const kw of keywords) {
      items.push(new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword));
    }

    return items;
  }
}
