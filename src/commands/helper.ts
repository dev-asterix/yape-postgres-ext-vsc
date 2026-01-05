import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem, validateCategoryItem, validateRoleItem } from './connection';
import { ConnectionManager } from '../services/ConnectionManager';
import { ErrorService } from '../services/ErrorService';

// Re-export SQL templates from sql/helper.ts for backward compatibility
export { SQL_TEMPLATES, QueryBuilder, MaintenanceTemplates } from './sql/helper';

export { validateItem, validateCategoryItem, validateRoleItem };

/** Get database connection and metadata for tree item operations */
export async function getDatabaseConnection(item: DatabaseTreeItem, validateFn: (item: DatabaseTreeItem) => void = validateItem) {
  validateFn(item);
  const connection = await getConnectionWithPassword(item.connectionId!);
  const client = await ConnectionManager.getInstance().getPooledClient({
    id: connection.id,
    host: connection.host,
    port: connection.port,
    username: connection.username,
    database: item.databaseName,
    name: connection.name
  });
  const metadata = createMetadata(connection, item.databaseName);
  return {
    connection,
    client,
    metadata,
    release: () => client.release()
  };
}
/** Fluent builder for notebook cells */
export class NotebookBuilder {
  private cells: vscode.NotebookCellData[] = [];

  constructor(private metadata: any) { }

  addMarkdown(content: string): NotebookBuilder {
    this.cells.push(new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, content, 'markdown'));
    return this;
  }

  addSql(content: string): NotebookBuilder {
    this.cells.push(new vscode.NotebookCellData(vscode.NotebookCellKind.Code, content, 'sql'));
    return this;
  }

  async show(): Promise<void> {
    await createAndShowNotebook(this.cells, this.metadata);
  }
}
/** Markdown formatting utilities */
export const MarkdownUtils = {
  infoBox: (message: string, title = 'Note'): string =>
    `<div style="font-size: 12px; background-color: rgba(52, 152, 219, 0.1); border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>ℹ️ ${title}:</strong> ${message}
</div>`,
  warningBox: (message: string, title = 'Warning'): string =>
    `<div style="font-size: 12px; background-color: rgba(231, 76, 60, 0.1); border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>⚠️ ${title}:</strong> ${message}
</div>`,
  dangerBox: (message: string, title = 'DANGER'): string =>
    `<div style="font-size: 12px; background-color: rgba(231, 76, 60, 0.1); border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>🛑 ${title}:</strong> ${message}
</div>`,
  successBox: (message: string, title = 'Tip'): string =>
    `<div style="font-size: 12px; background-color: rgba(46, 204, 113, 0.1); border-left: 3px solid #2ecc71; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>💡 ${title}:</strong> ${message}
</div>`,
  operationsTable: (operations: Array<{ operation: string, description: string, riskLevel?: string }>): string => {
    const rows = operations.map(op => {
      const risk = op.riskLevel ? `<td>${op.riskLevel}</td>` : '';
      return `    <tr><td><strong>${op.operation}</strong></td><td>${op.description}</td>${risk}</tr>`;
    }).join('\n');

    const headers = operations[0]?.riskLevel
      ? '<tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th><th style="text-align: left;">Risk Level</th></tr>'
      : '<tr><th style="text-align: left;">Operation</th><th style="text-align: left;">Description</th></tr>';

    return `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    ${headers}
${rows}
</table>`;
  },
  propertiesTable: (properties: Record<string, string>): string => {
    const rows = Object.entries(properties).map(([key, value]) =>
      `    <tr><td><strong>${key}</strong></td><td>${value}</td></tr>`
    ).join('\n');

    return `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left; width: 30%;">Property</th><th style="text-align: left;">Value</th></tr>
${rows}
</table>`;
  },
  header: (title: string, subtitle?: string): string => {
    return subtitle ? `### ${title}\n\n${subtitle}\n\n` : `### ${title}\n\n`;
  }
};

/** PostgreSQL object utilities */
export const ObjectUtils = {
  getKindLabel: (kind: string): string => {
    const labels: Record<string, string> = {
      'r': '📊 Table',
      'v': '👁️ View',
      'm': '💾 Materialized View',
      'i': '🔍 Index',
      'S': '🔢 Sequence',
      'f': '🌍 Foreign Table',
      'p': '📂 Partitioned Table',
      's': '⚙️ Special',
      'c': '🔗 Composite Type',
      'e': '🏷️ Enum Type',
      't': '📑 TOAST Table'
    };
    return labels[kind] || kind;
  },
  getConstraintIcon: (type: string): string => {
    const icons: Record<string, string> = {
      'PRIMARY KEY': '🔑',
      'FOREIGN KEY': '🔗',
      'UNIQUE': '⭐',
      'CHECK': '✓',
      'EXCLUSION': '⊗'
    };
    return icons[type] || '📌';
  },
  getIndexIcon: (isPrimary: boolean, isUnique: boolean): string => {
    if (isPrimary) return '🔑';
    if (isUnique) return '⭐';
    return '🔍';
  }
};
/** Format helpers for display */
export const FormatHelpers = {
  formatBytes: (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },
  formatBoolean: (value: boolean, trueText = 'Yes', falseText = 'No'): string =>
    value ? `✅ ${trueText}` : `🚫 ${falseText}`,
  escapeSqlString: (str: string): string => str.replace(/'/g, "''"),
  formatArray: (arr: any[], emptyText = '—'): string =>
    arr?.length ? arr.join(', ') : emptyText,
  formatNumber: (num: number): string => num.toLocaleString(),
  formatPercentage: (num: number): string => `${num}%`
};

/** Validation helpers */
export const ValidationHelpers = {
  validateColumnName: (value: string): string | null => {
    if (!value) return 'Column name cannot be empty';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      return 'Invalid column name. Use only letters, numbers, and underscores.';
    }
    return null;
  },
  validateIdentifier: (value: string, objectType = 'object'): string | null => {
    if (!value) return `${objectType} name cannot be empty`;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      return `Invalid ${objectType} name. Use only letters, numbers, and underscores.`;
    }
    return null;
  }
};
/** Error handling patterns */
export const ErrorHandlers = {
  showError: async (message: string, actionLabel?: string, actionCommand?: string): Promise<void> =>
    ErrorService.getInstance().showError(message, actionLabel, actionCommand),
  handleCommandError: async (err: any, operation: string): Promise<void> =>
    ErrorService.getInstance().handleCommandError(err, operation)
};

/** String cleaning utilities */
export const StringUtils = {
  cleanMarkdownCodeBlocks: (text: string): string =>
    text.replace(/^```sql\n/, '').replace(/^```\n/, '').replace(/\n```$/, ''),
  truncate: (text: string, maxLength: number): string =>
    text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text
};

