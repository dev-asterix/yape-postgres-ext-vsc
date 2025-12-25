import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { createAndShowNotebook, createMetadata, getConnectionWithPassword, validateItem, validateCategoryItem, validateRoleItem } from './connection';
import { ConnectionManager } from '../services/ConnectionManager';
import { ErrorService } from '../services/ErrorService';

// Re-export SQL templates from sql/helper.ts for backward compatibility
export { SQL_TEMPLATES, QueryBuilder, MaintenanceTemplates } from './sql/helper';

export { validateItem, validateCategoryItem, validateRoleItem };

/**
 * Helper to get database connection and metadata
 */
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

/**
 * Fluent Builder for Notebooks
 */
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

/**
 * Markdown formatting utilities
 */
export const MarkdownUtils = {
  /**
   * Create an info box
   */
  infoBox: (message: string, title: string = 'Note'): string =>
    `<div style="font-size: 12px; background-color: rgba(52, 152, 219, 0.1); border-left: 3px solid #3498db; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>ℹ️ ${title}:</strong> ${message}
</div>`,

  /**
   * Create a warning box
   */
  warningBox: (message: string, title: string = 'Warning'): string =>
    `<div style="font-size: 12px; background-color: rgba(231, 76, 60, 0.1); border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>⚠️ ${title}:</strong> ${message}
</div>`,

  /**
   * Create a danger/caution box
   */
  dangerBox: (message: string, title: string = 'DANGER'): string =>
    `<div style="font-size: 12px; background-color: rgba(231, 76, 60, 0.1); border-left: 3px solid #e74c3c; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>🛑 ${title}:</strong> ${message}
</div>`,

  /**
   * Create a success/tip box
   */
  successBox: (message: string, title: string = 'Tip'): string =>
    `<div style="font-size: 12px; background-color: rgba(46, 204, 113, 0.1); border-left: 3px solid #2ecc71; padding: 6px 10px; margin-bottom: 15px; border-radius: 3px; color: var(--vscode-editor-foreground);">
    <strong>💡 ${title}:</strong> ${message}
</div>`,

  /**
   * Create a simple operations table
   */
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

  /**
   * Create a properties table
   */
  propertiesTable: (properties: Record<string, string>): string => {
    const rows = Object.entries(properties).map(([key, value]) =>
      `    <tr><td><strong>${key}</strong></td><td>${value}</td></tr>`
    ).join('\n');

    return `<table style="font-size: 11px; width: 100%; border-collapse: collapse;">
    <tr><th style="text-align: left; width: 30%;">Property</th><th style="text-align: left;">Value</th></tr>
${rows}
</table>`;
  },

  /**
   * Create a header for notebook pages
   */
  header: (title: string, subtitle?: string): string => {
    const sub = subtitle ? `\n\n${subtitle}` : '';
    return `### ${title}${sub}\n\n`;
  }
};

/**
 * Object kind/type utilities
 */
export const ObjectUtils = {
  /**
   * Get icon/label for PostgreSQL object kind
   */
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

  /**
   * Get icon for constraint type
   */
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

  /**
   * Get icon for index type
   */
  getIndexIcon: (isPrimary: boolean, isUnique: boolean): string => {
    if (isPrimary) return '🔑';
    if (isUnique) return '⭐';
    return '🔍';
  }
};

/**
 * Format helpers for displaying data
 */
export const FormatHelpers = {
  /**
   * Format bytes to human readable
   */
  formatBytes: (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },

  /**
   * Format boolean to yes/no with icons
   */
  formatBoolean: (value: boolean, trueText: string = 'Yes', falseText: string = 'No'): string => {
    return value ? `✅ ${trueText}` : `🚫 ${falseText}`;
  },

  /**
   * Escape SQL string literals
   */
  escapeSqlString: (str: string): string => {
    return str.replace(/'/g, "''");
  },

  /**
   * Format array for display
   */
  formatArray: (arr: any[], emptyText: string = '—'): string => {
    return arr && arr.length > 0 ? arr.join(', ') : emptyText;
  },

  /**
   * Format number with commas
   */
  formatNumber: (num: number): string => {
    return num.toLocaleString();
  },

  /**
   * Format percentage
   */
  formatPercentage: (num: number): string => {
    return `${num}%`;
  }
};

/**
 * Validation helpers
 */
export const ValidationHelpers = {
  /**
   * Validate column name
   */
  validateColumnName: (value: string): string | null => {
    if (!value) return 'Column name cannot be empty';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      return 'Invalid column name. Use only letters, numbers, and underscores.';
    }
    return null;
  },

  /**
   * Validate identifier (table, view, function name, etc.)
   */
  validateIdentifier: (value: string, objectType: string = 'object'): string | null => {
    if (!value) return `${objectType} name cannot be empty`;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      return `Invalid ${objectType} name. Use only letters, numbers, and underscores.`;
    }
    return null;
  }
};

/**
 * Common error handling patterns
 */
export const ErrorHandlers = {
  /**
   * Show error with optional action button
   */
  showError: async (message: string, actionLabel?: string, actionCommand?: string): Promise<void> => {
    return ErrorService.getInstance().showError(message, actionLabel, actionCommand);
  },

  /**
   * Standard error handler for command operations
   */
  handleCommandError: async (err: any, operation: string): Promise<void> => {
    return ErrorService.getInstance().handleCommandError(err, operation);
  }
};

/**
 * String cleaning utilities
 */
export const StringUtils = {
  /**
   * Remove markdown code blocks from response
   */
  cleanMarkdownCodeBlocks: (text: string): string => {
    return text
      .replace(/^```sql\n/, '')
      .replace(/^```\n/, '')
      .replace(/\n```$/, '');
  },

  /**
   * Truncate string with ellipsis
   */
  truncate: (text: string, maxLength: number): string => {
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
  }
};
