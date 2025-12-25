import { Client } from 'pg';
import * as vscode from 'vscode';
import { PostgresMetadata } from '../common/types';
import { ConnectionManager } from '../services/ConnectionManager';
import { SecretStorageService } from '../services/SecretStorageService';
import { HistoryService } from '../services/HistoryService';
import { TelemetryService, SpanNames } from '../services/TelemetryService';

export class PostgresKernel implements vscode.Disposable {
  readonly id = 'postgres-kernel';
  readonly label = 'PostgreSQL';
  readonly supportedLanguages = ['sql'];

  private readonly _controller: vscode.NotebookController;
  private readonly _executionOrder = new WeakMap<vscode.NotebookCell, number>();
  private readonly _messageHandler?: (message: any) => void;

  constructor(private readonly context: vscode.ExtensionContext, viewType: string = 'postgres-notebook', messageHandler?: (message: any) => void) {
    console.log(`PostgresKernel: Initializing for viewType: ${viewType}`);
    this._controller = vscode.notebooks.createNotebookController(
      this.id + '-' + viewType,
      viewType,
      this.label
    );

    this._messageHandler = messageHandler;
    console.log(`PostgresKernel: Message handler registered for ${viewType}:`, !!messageHandler);

    this._controller.supportedLanguages = this.supportedLanguages;
    this._controller.supportsExecutionOrder = true;
    this._controller.executeHandler = this._executeAll.bind(this);

    // Disable automatic timestamp parsing (this was in original, but removed in new snippet, so removing it)
    // const types = require('pg').types;
    // const TIMESTAMPTZ_OID = 1184;
    // const TIMESTAMP_OID = 1114;
    // types.setTypeParser(TIMESTAMPTZ_OID, (val: string) => val);
    // types.setTypeParser(TIMESTAMP_OID, (val: string) => val);

    // this._controller.description = 'PostgreSQL Query Executor'; // Removed as per new snippet

    const getClientFromNotebook = async (document: vscode.TextDocument): Promise<Client | undefined> => {
      const cell = vscode.workspace.notebookDocuments
        .find(notebook => notebook.getCells().some(c => c.document === document))
        ?.getCells()
        .find(c => c.document === document);

      if (!cell) return undefined;

      const metadata = cell.notebook.metadata as PostgresMetadata;
      if (!metadata?.connectionId) return undefined;

      const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
      const connection = connections.find(c => c.id === metadata.connectionId);
      if (!connection) return undefined;

      try {
        return await ConnectionManager.getInstance().getSessionClient({
          id: connection.id,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          database: metadata.databaseName || connection.database,
          name: connection.name
        }, cell.notebook.uri.toString());
      } catch (err) {
        console.error('Error connecting to database:', err);
        return undefined;
      }
    };

    // Create SQL command completions
    const sqlCommands = [
      { label: 'SELECT', description: 'Retrieve data from tables', documentation: 'SELECT [columns] FROM [table] WHERE [condition];' },
      { label: 'INSERT', description: 'Add new records', documentation: 'INSERT INTO [table] (columns) VALUES (values);' },
      { label: 'UPDATE', description: 'Modify existing records', documentation: 'UPDATE [table] SET [column = value] WHERE [condition];' },
      { label: 'DELETE', description: 'Remove records', documentation: 'DELETE FROM [table] WHERE [condition];' },
      { label: 'CREATE TABLE', description: 'Create a new table', documentation: 'CREATE TABLE [name] (column_definitions);' },
      { label: 'ALTER TABLE', description: 'Modify table structure', documentation: 'ALTER TABLE [table] [action];' },
      { label: 'DROP TABLE', description: 'Delete a table', documentation: 'DROP TABLE [table];' },
      { label: 'CREATE INDEX', description: 'Create a new index', documentation: 'CREATE INDEX [name] ON [table] (columns);' },
      { label: 'CREATE VIEW', description: 'Create a view', documentation: 'CREATE VIEW [name] AS SELECT ...;' },
      { label: 'GRANT', description: 'Grant permissions', documentation: 'GRANT [privileges] ON [object] TO [role];' },
      { label: 'REVOKE', description: 'Revoke permissions', documentation: 'REVOKE [privileges] ON [object] FROM [role];' },
      { label: 'BEGIN', description: 'Start a transaction', documentation: 'BEGIN; -- transaction statements -- COMMIT;' },
      { label: 'COMMIT', description: 'Commit a transaction', documentation: 'COMMIT;' },
      { label: 'ROLLBACK', description: 'Rollback a transaction', documentation: 'ROLLBACK;' }
    ];

    // Create SQL keyword completions
    const sqlKeywords = [
      // DML Keywords
      { label: 'SELECT', detail: 'Query data', documentation: 'SELECT [columns] FROM [table] [WHERE condition]' },
      { label: 'FROM', detail: 'Specify source table', documentation: 'FROM table_name [alias]' },
      { label: 'WHERE', detail: 'Filter conditions', documentation: 'WHERE condition' },
      { label: 'GROUP BY', detail: 'Group results', documentation: 'GROUP BY column1, column2' },
      { label: 'HAVING', detail: 'Filter groups', documentation: 'HAVING aggregate_condition' },
      { label: 'ORDER BY', detail: 'Sort results', documentation: 'ORDER BY column1 [ASC|DESC]' },
      { label: 'LIMIT', detail: 'Limit results', documentation: 'LIMIT number' },
      { label: 'OFFSET', detail: 'Skip results', documentation: 'OFFSET number' },
      { label: 'INSERT INTO', detail: 'Add new records', documentation: 'INSERT INTO table (columns) VALUES (values)' },
      { label: 'UPDATE', detail: 'Modify records', documentation: 'UPDATE table SET column = value [WHERE condition]' },
      { label: 'DELETE FROM', detail: 'Remove records', documentation: 'DELETE FROM table [WHERE condition]' },

      // Joins
      { label: 'INNER JOIN', detail: 'Inner join tables', documentation: 'INNER JOIN table ON condition' },
      { label: 'LEFT JOIN', detail: 'Left outer join', documentation: 'LEFT [OUTER] JOIN table ON condition' },
      { label: 'RIGHT JOIN', detail: 'Right outer join', documentation: 'RIGHT [OUTER] JOIN table ON condition' },
      { label: 'FULL JOIN', detail: 'Full outer join', documentation: 'FULL [OUTER] JOIN table ON condition' },
      { label: 'CROSS JOIN', detail: 'Cross join tables', documentation: 'CROSS JOIN table' },

      // DDL Keywords
      { label: 'CREATE TABLE', detail: 'Create new table', documentation: 'CREATE TABLE name (column_definitions)' },
      { label: 'ALTER TABLE', detail: 'Modify table', documentation: 'ALTER TABLE name [action]' },
      { label: 'DROP TABLE', detail: 'Delete table', documentation: 'DROP TABLE [IF EXISTS] name' },
      { label: 'CREATE INDEX', detail: 'Create index', documentation: 'CREATE INDEX name ON table (columns)' },
      { label: 'CREATE VIEW', detail: 'Create view', documentation: 'CREATE VIEW name AS SELECT ...' },

      // Functions
      { label: 'COUNT', detail: 'Count rows', documentation: 'COUNT(*) or COUNT(column)' },
      { label: 'SUM', detail: 'Sum values', documentation: 'SUM(column)' },
      { label: 'AVG', detail: 'Average value', documentation: 'AVG(column)' },
      { label: 'MAX', detail: 'Maximum value', documentation: 'MAX(column)' },
      { label: 'MIN', detail: 'Minimum value', documentation: 'MIN(column)' },

      // Clauses
      { label: 'AS', detail: 'Alias', documentation: 'column AS alias, table AS alias' },
      { label: 'ON', detail: 'Join condition', documentation: 'ON table1.column = table2.column' },
      { label: 'AND', detail: 'Logical AND', documentation: 'condition1 AND condition2' },
      { label: 'OR', detail: 'Logical OR', documentation: 'condition1 OR condition2' },
      { label: 'IN', detail: 'Value in set', documentation: 'column IN (value1, value2, ...)' },
      { label: 'BETWEEN', detail: 'Value in range', documentation: 'column BETWEEN value1 AND value2' },
      { label: 'LIKE', detail: 'Pattern matching', documentation: 'column LIKE pattern' },
      { label: 'IS NULL', detail: 'Null check', documentation: 'column IS NULL' },
      { label: 'IS NOT NULL', detail: 'Not null check', documentation: 'column IS NOT NULL' },

      // Transaction Control
      { label: 'BEGIN', detail: 'Start transaction', documentation: 'BEGIN [TRANSACTION]' },
      { label: 'COMMIT', detail: 'Commit transaction', documentation: 'COMMIT' },
      { label: 'ROLLBACK', detail: 'Rollback transaction', documentation: 'ROLLBACK' }
    ];

    // Register completion provider for SQL
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { scheme: 'vscode-notebook-cell', language: 'sql' },
        {
          async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
            const linePrefix = document.lineAt(position).text.substr(0, position.character).toLowerCase();
            const wordRange = document.getWordRangeAtPosition(position);
            const word = wordRange ? document.getText(wordRange).toLowerCase() : '';

            // Always provide SQL keyword suggestions
            const keywordItems = sqlKeywords.filter(kw =>
              !word || kw.label.toLowerCase().includes(word)
            ).map(kw => {
              const item = new vscode.CompletionItem(kw.label, vscode.CompletionItemKind.Keyword);
              item.detail = kw.detail;
              item.documentation = new vscode.MarkdownString(kw.documentation);
              return item;
            });

            // Check for column suggestions after table alias (e.g. "t.")
            const aliasMatch = linePrefix.match(/(\w+)\.\s*$/);
            if (aliasMatch) {
              // Look for table alias in previous part of the query
              const fullQuery = document.getText();
              const aliasPattern = new RegExp(`(?:FROM|JOIN)\\s+([\\w\\.]+)\\s+(?:AS\\s+)?${aliasMatch[1]}\\b`, 'i');
              const tableMatch = aliasPattern.exec(fullQuery);

              if (tableMatch) {
                const [, tablePath] = tableMatch;
                const [schema = 'public', table] = tablePath.split('.');
                const client = await getClientFromNotebook(document);
                if (!client) return [];

                try {
                  const result = await client.query(
                    `SELECT column_name, data_type, is_nullable 
                                         FROM information_schema.columns 
                                         WHERE table_schema = $1 
                                         AND table_name = $2 
                                         ORDER BY ordinal_position`,
                    [schema, table]
                  );

                  return result.rows.map((row: { column_name: string; data_type: string; is_nullable: string }) => {
                    const completion = new vscode.CompletionItem(row.column_name);
                    completion.kind = vscode.CompletionItemKind.Field;
                    completion.detail = row.data_type;
                    completion.documentation = `Type: ${row.data_type}\nNullable: ${row.is_nullable === 'YES' ? 'Yes' : 'No'}`;
                    return completion;
                  });
                } catch (err) {
                  console.error('Error getting column completions:', err);
                  return [];
                }
                // Do not close client here, it's managed by ConnectionManager
              }
            }

            // Check if we're after a schema reference (schema.)
            const schemaMatch = linePrefix.match(/(\w+)\.\s*$/);
            if (schemaMatch) {
              const client = await getClientFromNotebook(document);
              if (!client) return [];

              try {
                const result = await client.query(
                  `SELECT table_name 
                                     FROM information_schema.tables 
                                     WHERE table_schema = $1 
                                     ORDER BY table_name`,
                  [schemaMatch[1]]
                );
                return result.rows.map((row: { table_name: string }) => {
                  const completion = new vscode.CompletionItem(row.table_name);
                  completion.kind = vscode.CompletionItemKind.Value;
                  return completion;
                });
              } catch (err) {
                console.error('Error getting table completions:', err);
                return [];
              }
            }

            // Provide schema suggestions after 'FROM' or 'JOIN'
            const keywords = /(?:from|join)\s+(\w*)$/i;
            const match = linePrefix.match(keywords);
            if (match) {
              const client = await getClientFromNotebook(document);
              if (!client) return [];

              try {
                const result = await client.query(
                  `SELECT schema_name 
                                     FROM information_schema.schemata 
                                     WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
                                     ORDER BY schema_name`
                );
                return result.rows.map((row: { schema_name: string }) => {
                  const completion = new vscode.CompletionItem(row.schema_name);
                  completion.kind = vscode.CompletionItemKind.Module;
                  completion.insertText = row.schema_name + '.';
                  return completion;
                });
              } catch (err) {
                console.error('Error getting schema completions:', err);
                return [];
              }
            }

            return keywordItems;
          }
        }
      )
    );

    // Register completion provider for SQL
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { scheme: 'vscode-notebook-cell', language: 'sql' },
        {
          async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
            const linePrefix = document.lineAt(position).text.substr(0, position.character);

            // Return SQL command suggestions at start of line or after semicolon
            if (linePrefix.trim() === '' || linePrefix.trim().endsWith(';')) {
              return sqlCommands.map(cmd => {
                const item = new vscode.CompletionItem(cmd.label, vscode.CompletionItemKind.Keyword);
                item.detail = cmd.description;
                item.documentation = new vscode.MarkdownString(cmd.documentation);
                return item;
              });
            }

            return [];
          }
        },
        ' ', ';' // Trigger on space and semicolon
      )
    );
    // Handle messages from renderer (e.g., delete row)
    console.log(`PostgresKernel: Subscribing to onDidReceiveMessage for Controller ID: ${this._controller.id}`);
    (this._controller as any).onDidReceiveMessage(async (event: any) => {
      console.log(`PostgresKernel: Received message on Controller ${this._controller.id}`, event.message);
      if (event.message.type === 'cancel_query') {
        console.log('PostgresKernel: Processing cancel_query message');
        const { backendPid, connectionId, databaseName } = event.message;

        try {
          const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
          const connection = connections.find(c => c.id === connectionId);
          if (!connection) {
            throw new Error('Connection not found');
          }

          let cancelClient;
          try {
            // Create a new connection to cancel the query
            cancelClient = await ConnectionManager.getInstance().getPooledClient({
              id: connection.id,
              host: connection.host,
              port: connection.port,
              username: connection.username,
              database: databaseName || connection.database,
              name: connection.name
            });

            // Cancel the backend process
            await cancelClient.query('SELECT pg_cancel_backend($1)', [backendPid]);
            vscode.window.showInformationMessage(`Query cancelled (PID: ${backendPid})`);
          } finally {
            if (cancelClient) {
              cancelClient.release();
            }
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to cancel query: ${err.message}`);
          console.error('Cancel query error:', err);
        }
      } else if (event.message.type === 'script_delete') {
        console.log('PostgresKernel: Processing script_delete message');
        const { schema, table, primaryKeys, rows, cellIndex } = event.message;
        const notebook = event.editor.notebook;

        try {
          // Construct DELETE query
          let query = '';
          for (const row of rows) {
            const conditions: string[] = [];
            const values: any[] = [];

            for (const pk of primaryKeys) {
              const val = row[pk];
              // Simple quoting for string values, handle numbers/booleans
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

          // Focus the new cell (optional, but good UX)
          // Note: Focusing specific cell via API is limited, but inserting it usually reveals it.

        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to generate delete script: ${err.message}`);
          console.error('Script delete error:', err);
        }
      } else if (event.message.type === 'execute_update') {
        console.log('PostgresKernel: Processing execute_update message');
        const { statements, cellIndex } = event.message;
        const notebook = event.editor.notebook;

        try {
          // Insert new cell with the UPDATE statements
          const query = statements.join('\n');
          const targetIndex = cellIndex + 1;
          const newCell = new vscode.NotebookCellData(
            vscode.NotebookCellKind.Code,
            `-- Update statements generated from cell edits\n${query}`,
            'sql'
          );

          const edit = new vscode.NotebookEdit(
            new vscode.NotebookRange(targetIndex, targetIndex),
            [newCell]
          );

          const workspaceEdit = new vscode.WorkspaceEdit();
          workspaceEdit.set(notebook.uri, [edit]);
          await vscode.workspace.applyEdit(workspaceEdit);

          vscode.window.showInformationMessage(`Generated ${statements.length} UPDATE statement(s). Review and execute the new cell.`);
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to generate update script: ${err.message}`);
          console.error('Script update error:', err);
        }
      } else if (event.message.type === 'execute_update_background') {
        console.log('PostgresKernel: Processing execute_update_background message');
        console.log('PostgresKernel: Statements to execute:', event.message.statements);
        const { statements } = event.message;
        const notebook = event.editor.notebook;

        try {
          // Get connection from notebook metadata
          const metadata = notebook.metadata as PostgresMetadata;
          console.log('PostgresKernel: Notebook metadata:', metadata);
          if (!metadata?.connectionId) {
            throw new Error('No connection found in notebook metadata');
          }

          // Get connection configuration
          const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
          console.log('PostgresKernel: Found connections:', connections.length);
          const savedConnection = connections.find((c: any) => c.id === metadata.connectionId);

          if (!savedConnection) {
            throw new Error(`Connection not found for id: ${metadata.connectionId}`);
          }
          console.log('PostgresKernel: Using connection:', savedConnection.name);

          const client = await ConnectionManager.getInstance().getSessionClient({
            id: savedConnection.id,
            host: savedConnection.host,
            port: savedConnection.port,
            username: savedConnection.username,
            database: metadata.databaseName || savedConnection.database,
            name: savedConnection.name
          }, notebook.uri.toString());

          console.log('PostgresKernel: Using session client for updates');

          // Execute all UPDATE statements
          const combinedQuery = statements.join('\n');
          console.log('PostgresKernel: Executing query:', combinedQuery);
          const result = await client.query(combinedQuery);
          console.log('PostgresKernel: Query result:', result);

          vscode.window.showInformationMessage(`✅ Successfully saved ${statements.length} change(s) to database.`);
        } catch (err: any) {
          console.error('PostgresKernel: Background update error:', err);
          vscode.window.showErrorMessage(`Failed to save changes: ${err.message}`);
        }
      } else if (event.message.type === 'export_request') {
        console.log('PostgresKernel: Processing export_request message');
        const { rows: displayRows, columns, query: originalQuery } = event.message;

        // Ask if user wants to export all data or just displayed data
        const exportChoice = await vscode.window.showQuickPick(
          [
            { label: '$(database) Export All Data', value: 'all', description: 'Re-execute query and export complete result' },
            { label: '$(table) Export Displayed Data', value: 'displayed', description: `Export ${displayRows.length} rows currently shown` }
          ],
          { placeHolder: 'Select data to export' }
        );

        if (!exportChoice) return;

        let rowsToExport = displayRows;

        // If exporting all data and we have the original query, re-execute without limits
        if (exportChoice.value === 'all' && originalQuery) {
          const notebook = event.editor.notebook;
          const metadata = notebook.metadata as PostgresMetadata;

          if (metadata?.connectionId) {
            try {
              vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Fetching all data for export...',
                cancellable: true
              }, async (progress, token) => {
                const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
                const connection = connections.find(c => c.id === metadata.connectionId);

                if (connection) {
                  const password = await SecretStorageService.getInstance().getPassword(connection.id);
                  const client = await ConnectionManager.getInstance().getPooledClient({
                    ...connection,
                    password
                  });

                  try {
                    progress.report({ message: 'Executing query...' });
                    const result = await client.query(originalQuery);
                    rowsToExport = result.rows || [];
                    progress.report({ message: `Fetched ${rowsToExport.length} rows` });
                  } finally {
                    client.release();
                  }
                }
              });
            } catch (err: any) {
              vscode.window.showErrorMessage(`Failed to fetch all data: ${err.message}. Exporting displayed data instead.`);
              rowsToExport = displayRows;
            }
          }
        }

        const selection = await vscode.window.showQuickPick(
          ['Save as CSV', 'Save as JSON', 'Copy to Clipboard'],
          { placeHolder: `Select export format (${rowsToExport.length} rows)` }
        );

        if (!selection) return;

        if (selection === 'Copy to Clipboard') {
          // Convert to CSV for clipboard
          const header = columns.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(',');
          const body = rowsToExport.map((row: any) => {
            return columns.map((col: string) => {
              const val = row[col];
              if (val === null || val === undefined) return '';
              const str = String(val);
              if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            }).join(',');
          }).join('\n');
          const csv = `${header}\n${body}`;

          await vscode.env.clipboard.writeText(csv);
          vscode.window.showInformationMessage(`${rowsToExport.length} rows copied to clipboard (CSV format).`);
        } else if (selection === 'Save as CSV') {
          const header = columns.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(',');
          const body = rowsToExport.map((row: any) => {
            return columns.map((col: string) => {
              const val = row[col];
              if (val === null || val === undefined) return '';
              const str = String(val);
              if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            }).join(',');
          }).join('\n');
          const csv = `${header}\n${body}`;

          const uri = await vscode.window.showSaveDialog({
            filters: { 'CSV': ['csv'] },
            saveLabel: 'Export CSV'
          });

          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, 'utf8'));
            vscode.window.showInformationMessage(`${rowsToExport.length} rows exported to CSV successfully.`);
          }
        } else if (selection === 'Save as JSON') {
          const json = JSON.stringify(rowsToExport, null, 2);
          const uri = await vscode.window.showSaveDialog({
            filters: { 'JSON': ['json'] },
            saveLabel: 'Export JSON'
          });

          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
            vscode.window.showInformationMessage(`${rowsToExport.length} rows exported to JSON successfully.`);
          }
        }
      }
      if (event.message.type === 'delete_row') {
        const { schema, table, primaryKeys, row } = event.message;
        const notebook = event.editor.notebook;
        const metadata = notebook.metadata as PostgresMetadata;

        if (!metadata?.connectionId) {
          vscode.window.showErrorMessage('No connection found for this notebook.');
          return;
        }

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

          // Construct DELETE query
          const conditions: string[] = [];
          const values: any[] = [];
          let paramIndex = 1;

          for (const pk of primaryKeys) {
            conditions.push(`"${pk}" = $${paramIndex}`);
            values.push(row[pk]);
            paramIndex++;
          }

          const query = `DELETE FROM "${schema}"."${table}" WHERE ${conditions.join(' AND ')}`;
          await client.query(query, values);
          vscode.window.showInformationMessage('Row deleted successfully.');
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to delete row: ${err.message}`);
          console.error('Delete row error:', err);
        }
      } else if (event.message.type === 'sendToChat') {
        console.log('PostgresKernel: Processing sendToChat message');
        const { data } = event.message;

        // Focus chat view and send the message
        await vscode.commands.executeCommand('postgresExplorer.chatView.focus');
        await vscode.commands.executeCommand('postgres-explorer.sendToChat', data);
      }
    });
  }

  private async _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): Promise<void> {
    for (const cell of cells) {
      await this._doExecution(cell);
    }
  }

  /**
   * Split SQL text into individual statements, respecting semicolons but ignoring them inside:
   * - String literals (single quotes)
   * - Dollar-quoted strings ($$...$$, $tag$...$tag$)
   * - Comments (-- and /* *\/)
   */
  private splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let currentStatement = '';
    let i = 0;
    let inSingleQuote = false;
    let inDollarQuote = false;
    let dollarQuoteTag = '';
    let inBlockComment = false;

    while (i < sql.length) {
      const char = sql[i];
      const nextChar = i + 1 < sql.length ? sql[i + 1] : '';
      const peek = sql.substring(i, i + 10);

      // Handle block comments /* ... */
      if (!inSingleQuote && !inDollarQuote && char === '/' && nextChar === '*') {
        inBlockComment = true;
        currentStatement += char + nextChar;
        i += 2;
        continue;
      }

      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        currentStatement += char + nextChar;
        i += 2;
        continue;
      }

      // Handle line comments -- ...
      if (!inSingleQuote && !inDollarQuote && !inBlockComment && char === '-' && nextChar === '-') {
        // Add rest of line to current statement
        const lineEnd = sql.indexOf('\n', i);
        if (lineEnd === -1) {
          currentStatement += sql.substring(i);
          break;
        }
        currentStatement += sql.substring(i, lineEnd + 1);
        i = lineEnd + 1;
        continue;
      }

      // Handle dollar-quoted strings
      if (!inSingleQuote && !inBlockComment) {
        const dollarMatch = peek.match(/^(\$[a-zA-Z0-9_]*\$)/);
        if (dollarMatch) {
          const tag = dollarMatch[1];
          if (!inDollarQuote) {
            inDollarQuote = true;
            dollarQuoteTag = tag;
            currentStatement += tag;
            i += tag.length;
            continue;
          } else if (tag === dollarQuoteTag) {
            inDollarQuote = false;
            dollarQuoteTag = '';
            currentStatement += tag;
            i += tag.length;
            continue;
          }
        }
      }

      // Handle single-quoted strings
      if (!inDollarQuote && !inBlockComment && char === "'") {
        if (inSingleQuote && nextChar === "'") {
          // Escaped quote ''
          currentStatement += "''";
          i += 2;
          continue;
        }
        inSingleQuote = !inSingleQuote;
      }

      // Handle semicolon as statement separator
      if (!inSingleQuote && !inDollarQuote && !inBlockComment && char === ';') {
        currentStatement += char;
        const trimmed = currentStatement.trim();
        if (trimmed) {
          statements.push(trimmed);
        }
        currentStatement = '';
        i++;
        continue;
      }

      currentStatement += char;
      i++;
    }

    // Add remaining statement if any
    const trimmed = currentStatement.trim();
    if (trimmed) {
      statements.push(trimmed);
    }

    return statements.filter(s => s.length > 0);
  }

  private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
    console.log(`PostgresKernel: Starting cell execution. Controller ID: ${this._controller.id}`);
    const execution = this._controller.createNotebookCellExecution(cell);
    const startTime = Date.now();
    execution.start(startTime);
    execution.clearOutput();

    try {
      const metadata = cell.notebook.metadata as PostgresMetadata;
      if (!metadata || !metadata.connectionId) {
        throw new Error('No connection metadata found');
      }

      // Get connection info and password from SecretStorage
      const connections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
      const connection = connections.find(c => c.id === metadata.connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      const client = await ConnectionManager.getInstance().getSessionClient({
        id: connection.id,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        database: metadata.databaseName || connection.database,
        name: connection.name
      }, cell.notebook.uri.toString());

      console.log('PostgresKernel: Connected to database');

      // Get PostgreSQL backend PID for query cancellation
      let backendPid: number | null = null;
      try {
        const pidResult = await client.query('SELECT pg_backend_pid()');
        backendPid = pidResult.rows[0]?.pg_backend_pid || null;
        console.log('PostgresKernel: Backend PID:', backendPid);
      } catch (err) {
        console.warn('Failed to get backend PID:', err);
      }

      // Capture PostgreSQL NOTICE messages
      const notices: string[] = [];
      const noticeListener = (msg: any) => {
        const message = msg.message || msg.toString();
        notices.push(message);
      };
      client.on('notice', noticeListener);

      const queryText = cell.document.getText();
      const statements = this.splitSqlStatements(queryText);

      console.log('PostgresKernel: Executing', statements.length, 'statement(s)');

      // Execute each statement and collect outputs
      const outputs: vscode.NotebookCellOutput[] = [];
      let totalExecutionTime = 0;

      for (let stmtIndex = 0; stmtIndex < statements.length; stmtIndex++) {
        const query = statements[stmtIndex];
        const stmtStartTime = Date.now();

        console.log(`PostgresKernel: Executing statement ${stmtIndex + 1}/${statements.length}:`, query.substring(0, 100));

        let result;
        try {
          // Start telemetry span for query execution
          const telemetry = TelemetryService.getInstance();
          const spanId = telemetry.startSpan(SpanNames.QUERY_EXECUTE, {
            statementIndex: stmtIndex + 1,
            statementCount: statements.length
          });

          result = await client.query(query);
          const stmtEndTime = Date.now();
          const executionTime = (stmtEndTime - stmtStartTime) / 1000;
          totalExecutionTime += executionTime;

          // End telemetry span with result info
          telemetry.endSpan(spanId, {
            rowCount: result.rowCount || 0,
            durationMs: stmtEndTime - stmtStartTime
          });

          const MAX_ROWS = 10000;
          let rows = result.rows || [];
          let truncated = false;

          if (rows.length > MAX_ROWS) {
            rows = rows.slice(0, MAX_ROWS);
            truncated = true;
            notices.push(`Warning: Result truncated to ${MAX_ROWS} rows for performance.`);
          }

          console.log(`PostgresKernel: Statement ${stmtIndex + 1} result:`, {
            hasFields: !!result.fields,
            fieldsLength: result.fields?.length,
            rowsLength: rows.length,
            truncated,
            command: result.command
          });

          let tableInfo: { schema: string; table: string; primaryKeys: string[]; uniqueKeys: string[] } | undefined;

          // Try to get table metadata for SELECT queries to enable deletion
          if (result.command === 'SELECT' && result.fields && result.fields.length > 0) {
            const tableId = result.fields[0].tableID;
            // Check if all fields come from the same table and tableId is valid
            const allSameTable = result.fields.every((f: any) => f.tableID === tableId);

            if (tableId && tableId > 0 && allSameTable) {
              try {
                // Get table name and schema
                const tableRes = await client.query(
                  `SELECT n.nspname, c.relname 
                                     FROM pg_class c 
                                     JOIN pg_namespace n ON n.oid = c.relnamespace 
                                     WHERE c.oid = $1`,
                  [tableId]
                );

                if (tableRes.rows.length > 0) {
                  const { nspname, relname } = tableRes.rows[0];

                  // Get primary keys
                  const pkRes = await client.query(
                    `SELECT a.attname 
                                         FROM pg_index i 
                                         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) 
                                         WHERE i.indrelid = $1 AND i.indisprimary`,
                    [tableId]
                  );

                  const primaryKeys = pkRes.rows.map((r: any) => r.attname);

                  // Get unique keys (columns with unique constraints, excluding primary keys)
                  const ukRes = await client.query(
                    `SELECT DISTINCT a.attname 
                                         FROM pg_index i 
                                         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) 
                                         WHERE i.indrelid = $1 AND i.indisunique AND NOT i.indisprimary`,
                    [tableId]
                  );

                  const uniqueKeys = ukRes.rows.map((r: any) => r.attname);

                  if (primaryKeys.length > 0 || uniqueKeys.length > 0) {
                    tableInfo = {
                      schema: nspname,
                      table: relname,
                      primaryKeys: primaryKeys,
                      uniqueKeys: uniqueKeys
                    };
                  }
                }
              } catch (err) {
                console.warn('Failed to fetch table metadata:', err);
              }
            }
          }

          // Get column type names from pg_type
          let columnTypes: { [key: string]: string } = {};
          if (result.fields && result.fields.length > 0) {
            try {
              const typeOids = result.fields.map((f: any) => f.dataTypeID);
              const uniqueOids = [...new Set(typeOids)];
              const typeRes = await client.query(
                `SELECT oid, typname FROM pg_type WHERE oid = ANY($1::oid[])`,
                [uniqueOids]
              );
              const typeMap = new Map(typeRes.rows.map((r: any) => [r.oid, r.typname]));
              result.fields.forEach((f: any) => {
                columnTypes[f.name] = typeMap.get(f.dataTypeID) || 'unknown';
              });
            } catch (err) {
              console.warn('Failed to fetch column type names:', err);
            }
          }

          outputs.push(new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.json({
              columns: result.fields?.map((f: any) => f.name) || [],
              rows: rows,
              rowCount: result.rowCount,
              command: result.command,
              query: query,
              notices: notices,
              executionTime: executionTime,
              tableInfo: tableInfo,
              success: true,
              truncated: truncated,
              columnTypes: result.fields?.reduce((acc: any, field: any) => {
                // Helper function to format type names (e.g., _int4 to int4[])
                const formatType = (dataTypeID: number) => {
                  const typeName = columnTypes[field.name]; // Use the already fetched type name
                  if (typeName.startsWith('_') && typeName.length > 1) {
                    return typeName.substring(1) + '[]';
                  }
                  return typeName;
                };
                acc[field.name] = formatType(field.dataTypeID);
                return acc;
              }, {})
            }, 'application/x-postgres-result'), // Use custom mime type for renderer
            vscode.NotebookCellOutputItem.json(rows, 'application/json') // Standard JSON fallback
          ]));

          // Track query history
          HistoryService.getInstance().addQuery({
            query: cell.document.getText(),
            status: 'success',
            duration: executionTime,
            rowCount: result.rowCount ?? undefined
          });



          console.log(`PostgresKernel: Generated output for statement ${stmtIndex + 1}, outputs count: ${outputs.length}`);

          // Clear notices for next statement
          notices.length = 0;
        } catch (err: any) {
          const stmtEndTime = Date.now();
          const executionTime = (stmtEndTime - stmtStartTime) / 1000;
          totalExecutionTime += executionTime;

          console.error(`PostgresKernel: Statement ${stmtIndex + 1} error:`, err.message);

          // Track query history
          HistoryService.getInstance().addQuery({
            query: cell.document.getText(),
            status: 'error',
            duration: Date.now() - stmtStartTime,
            errorMessage: err.message
          });

          const cellOutput = new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.json({
              success: false,
              error: err.message,
              canExplain: true,
              query: cell.document.getText()
            }, 'application/x-postgres-result')
          ]);
          outputs.push(cellOutput);

          // Continue with remaining statements even if one fails
          notices.length = 0;
        }
      }

      // Remove notice listener
      client.off('notice', noticeListener);

      // Combine all outputs
      console.log(`PostgresKernel: Combining ${outputs.length} output(s)`);

      if (outputs.length > 0) {
        execution.replaceOutput(outputs);
        execution.end(true);
        console.log('PostgresKernel: Cell execution completed successfully');
      } else {
        throw new Error('No statements to execute');
      }
    } catch (err: any) {
      console.error('PostgresKernel: Cell execution failed:', err);
      const output = new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.error(err)
      ]);
      execution.replaceOutput([output]);
      execution.end(false);
    }
  }

  dispose() {
    this._controller.dispose();
  }
}
