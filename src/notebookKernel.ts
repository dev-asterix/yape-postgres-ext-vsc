import * as vscode from 'vscode';
import { Client } from 'pg';

interface NotebookMetadata {
    connectionId: string;
    databaseName: string;
    host: string;
    port: number;
    username: string;
    password: string;
}

export class PostgresKernel {
    private readonly id = 'postgres-kernel';
    private readonly label = 'PostgreSQL Kernel';
    private readonly controller: vscode.NotebookController;

    constructor() {
        this.controller = vscode.notebooks.createNotebookController(
            this.id,
            'postgres-notebook',
            this.label
        );

        this.controller.supportedLanguages = ['sql'];
        this.controller.supportsExecutionOrder = true;
        this.controller.description = 'PostgreSQL Query Executor';
        this.controller.executeHandler = this._executeAll.bind(this);
    }

    private async _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): Promise<void> {
        for (const cell of cells) {
            await this._doExecution(cell);
        }
    }

    private async _doExecution(cell: vscode.NotebookCell): Promise<void> {
        const execution = this.controller.createNotebookCellExecution(cell);
        execution.start(Date.now());

        try {
            const metadata = cell.notebook.metadata as NotebookMetadata;
            if (!metadata || !metadata.connectionId || !metadata.host || !metadata.port || !metadata.username || !metadata.password || !metadata.databaseName) {
                throw new Error('No connection metadata found');
            }

            const client = new Client({
                host: metadata.host,
                port: metadata.port,
                user: metadata.username,
                password: String(metadata.password),
                database: metadata.databaseName
            });

            await client.connect();

            const query = cell.document.getText();
            const result = await client.query(query);
            await client.end();

            // Format the results as a markdown table
            const headers = result.fields.map(field => field.name);
            const rows = result.rows;
            
            let html = '';
            if (result.fields.length > 0) {
                html = `
                <style>
                    .result-table {
                        border-collapse: collapse;
                        width: 100%;
                        font-family: var(--vscode-font-family);
                        margin-bottom: 10px;
                    }
                    .result-table th, .result-table td {
                        border: 1px solid var(--vscode-panel-border);
                        padding: 8px;
                        text-align: left;
                    }
                    .result-table th {
                        background: var(--vscode-editor-background);
                        position: sticky;
                        top: 0;
                        cursor: pointer;
                        user-select: none;
                    }
                    .result-table th:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .result-table tr:nth-child(even) {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .table-container {
                        max-height: 400px;
                        overflow: auto;
                        border: 1px solid var(--vscode-panel-border);
                        margin-bottom: 10px;
                    }
                    .sort-icon::after {
                        content: '⇅';
                        margin-left: 5px;
                        font-size: 0.8em;
                    }
                    .sort-asc::after {
                        content: '↑';
                    }
                    .sort-desc::after {
                        content: '↓';
                    }
                    .export-buttons {
                        margin-bottom: 10px;
                        display: flex;
                        gap: 8px;
                    }
                    .export-button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 4px 12px;
                        cursor: pointer;
                        border-radius: 2px;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    .export-button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                </style>
                <div class="export-buttons">
                    <button class="export-button" onclick="exportToCSV()">
                        <span>Export CSV</span>
                    </button>
                    <button class="export-button" onclick="exportToExcel()">
                        <span>Export Excel</span>
                    </button>
                </div>
                <div class="table-container">
                    <table class="result-table">
                        <thead>
                            <tr>
                                ${result.fields.map((f, i) => `<th onclick="sortTable(${i})" class="sort-icon">${f.name}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${result.rows.map(row => 
                                '<tr>' + 
                                result.fields.map(f => `<td>${String(row[f.name] ?? '')}</td>`).join('') +
                                '</tr>'
                            ).join('')}
                        </tbody>
                    </table>
                </div>
                <div>${rows.length} rows</div>
                <script>
                    function sortTable(colIndex) {
                        const table = document.querySelector('.result-table');
                        const headers = table.querySelectorAll('th');
                        const tbody = table.querySelector('tbody');
                        const rows = Array.from(tbody.querySelectorAll('tr'));
                        const header = headers[colIndex];
                        const isAsc = !header.classList.contains('sort-asc');

                        // Reset all headers
                        headers.forEach(h => {
                            h.classList.remove('sort-asc', 'sort-desc');
                            h.classList.add('sort-icon');
                        });

                        // Set current header sort state
                        header.classList.remove('sort-icon');
                        header.classList.add(isAsc ? 'sort-asc' : 'sort-desc');

                        // Sort rows
                        rows.sort((a, b) => {
                            const aVal = a.cells[colIndex].textContent;
                            const bVal = b.cells[colIndex].textContent;
                            return isAsc ? 
                                aVal.localeCompare(bVal, undefined, {numeric: true}) :
                                bVal.localeCompare(aVal, undefined, {numeric: true});
                        });

                        // Reorder rows
                        tbody.append(...rows);
                    }

                    const vscodeApi = acquireVsCodeApi();

                    function exportToCSV() {
                        const table = document.querySelector('.result-table');
                        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
                        const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => 
                            Array.from(row.querySelectorAll('td')).map(cell => {
                                let content = cell.textContent || '';
                                // Escape quotes and wrap in quotes if content contains comma or newline
                                if (content.includes(',') || content.includes('\n') || content.includes('"')) {
                                    content = '"' + content.replace(/"/g, '""') + '"';
                                }
                                return content;
                            })
                        );
                        
                        const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
                        vscodeApi.postMessage({ 
                            type: 'export', 
                            format: 'csv',
                            content: csv,
                            filename: 'query_result.csv'
                        });
                    }

                    function exportToExcel() {
                        const table = document.querySelector('.result-table');
                        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
                        const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => 
                            Array.from(row.querySelectorAll('td')).map(cell => cell.textContent)
                        );
                        
                        let xml = '<?xml version="1.0"?>\n';
                        xml += '<?mso-application progid="Excel.Sheet"?>\n';
                        xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
                        xml += '<Worksheet ss:Name="Query Result">\n';
                        xml += '<Table>\n';
                        
                        // Add headers
                        xml += '<Row>\n';
                        headers.forEach(header => {
                            xml += '<Cell><Data ss:Type="String">' + header + '</Data></Cell>\n';
                        });
                        xml += '</Row>\n';
                        
                        // Add data rows
                        rows.forEach(row => {
                            xml += '<Row>\n';
                            row.forEach(cell => {
                                const value = cell || '';
                                const type = isNaN(value as any) ? 'String' : 'Number';
                                xml += '<Cell><Data ss:Type="' + type + '">' + value + '</Data></Cell>\n';
                            });
                            xml += '</Row>\n';
                        });
                        
                        xml += '</Table>\n</Worksheet>\n</Workbook>';
                        
                        vscodeApi.postMessage({ 
                            type: 'export', 
                            format: 'excel',
                            content: xml,
                            filename: 'query_result.xls'
                        });
                    }
                </script>
                `;
            } else {
                html = '<div>No results</div>';
            }

            const output = new vscode.NotebookCellOutput([
                vscode.NotebookCellOutputItem.text(html, 'text/html')
            ]);

            // Handle export messages
            output.metadata = {
                callbacks: {
                    export: async (message: any) => {
                        const content = message.content;
                        const format = message.format;
                        const filename = message.filename;
                        const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, filename);
                        
                        await vscode.workspace.fs.writeFile(
                            uri,
                            Buffer.from(content)
                        );

                        vscode.window.showInformationMessage(
                            `Exported to ${filename}. File saved in workspace root.`
                        );
                    }
                }
            };

            execution.replaceOutput([output]);
            execution.end(true);

        } catch (err: any) {
            const errorMessage = err?.message || 'Unknown error occurred';
            execution.replaceOutput([
                new vscode.NotebookCellOutput([
                    vscode.NotebookCellOutputItem.error({
                        name: 'Error',
                        message: errorMessage
                    })
                ])
            ]);
            execution.end(false);
        }
    }

    dispose() {
        this.controller.dispose();
    }
}
