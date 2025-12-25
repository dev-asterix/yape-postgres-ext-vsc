import * as vscode from 'vscode';

export interface QueryHistoryItem {
  timestamp: number;
  query: string;
  status: 'success' | 'error';
  duration?: number;
  rowCount?: number;
  errorMessage?: string;
}

export class HistoryService {
  private static _instance: HistoryService;
  private _history: QueryHistoryItem[] = [];
  private readonly MAX_HISTORY = 10;
  private readonly MAX_QUERY_LENGTH = 1000;

  private constructor() { }

  public static getInstance(): HistoryService {
    if (!HistoryService._instance) {
      HistoryService._instance = new HistoryService();
    }
    return HistoryService._instance;
  }

  public addQuery(item: Omit<QueryHistoryItem, 'timestamp'>): void {
    const query = item.query.length > this.MAX_QUERY_LENGTH
      ? item.query.substring(0, this.MAX_QUERY_LENGTH) + '... (truncated)'
      : item.query;

    this._history.unshift({
      ...item,
      query,
      timestamp: Date.now()
    });

    if (this._history.length > this.MAX_HISTORY) {
      this._history.pop();
    }
  }

  public getHistory(): QueryHistoryItem[] {
    return [...this._history];
  }

  public clearHistory(): void {
    this._history = [];
  }

  public getRecentContext(): string {
    if (this._history.length === 0) return '';

    return `\n\n=== RECENT QUERY HISTORY (Last ${this._history.length}) ===\n` +
      this._history.map((h, i) =>
        `${i + 1}. [${h.status.toUpperCase()}] ${h.query} (${h.duration || 0}ms${h.rowCount !== undefined ? `, ${h.rowCount} rows` : ''})${h.errorMessage ? `\n   Error: ${h.errorMessage}` : ''}`
      ).join('\n') +
      '\n=== END HISTORY ===\n';
  }
}
