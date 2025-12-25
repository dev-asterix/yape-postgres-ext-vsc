import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../providers/DatabaseTreeProvider';
import { getDatabaseConnection, NotebookBuilder, MarkdownUtils, ErrorHandlers } from './helper';

export async function cmdNewNotebook(item: DatabaseTreeItem) {
  try {
    // For schema and table items, validateItem is appropriate
    // For database-level operations, would need validateCategoryItem
    const dbConn = await getDatabaseConnection(item);
    const { metadata } = dbConn;
    if (dbConn.release) dbConn.release();

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`📓 New Notebook: \`${metadata.databaseName}\``) +
        MarkdownUtils.infoBox('Write and execute your SQL queries in the cell below.')
      )
      .addSql(`-- Connected to database: ${metadata.databaseName}
-- Write your SQL query here
SELECT * FROM ${item.schema ? `${item.schema}.${item.label}` : 'your_table'}
LIMIT 100;`)
      .show();

  } catch (err: any) {
    await ErrorHandlers.handleCommandError(err, 'create new notebook');
  }
}