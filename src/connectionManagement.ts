import * as vscode from 'vscode';
import { ConnectionInfo } from './connectionForm';
import { SecretStorageService } from './services/SecretStorageService';

export class ConnectionManagementPanel {
    public static currentPanel: ConnectionManagementPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _extensionContext: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, extensionContext: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._extensionContext = extensionContext;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._initialize();

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'addConnection':
                        // Open the connection form panel
                        vscode.commands.executeCommand('postgres-explorer.addConnection');
                        break;

                    case 'refresh':
                        await this._update();
                        break;

                    case 'delete':
                        try {
                            const config = vscode.workspace.getConfiguration();
                            const connections = config.get<ConnectionInfo[]>('postgresExplorer.connections') || [];

                            const updatedConnections = connections.filter(c => c.id !== message.id);
                            await config.update('postgresExplorer.connections', updatedConnections, vscode.ConfigurationTarget.Global);

                            // Delete password from secret storage
                            try {
                                await SecretStorageService.getInstance().deletePassword(message.id);
                            } catch (err) {
                                console.log(`No password to delete for connection ${message.id}`);
                            }

                            vscode.window.showInformationMessage(`Connection deleted successfully`);
                            vscode.commands.executeCommand('postgres-explorer.refreshConnections');
                            await this._update();
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Failed to delete connection: ${err.message}`);
                        }
                        break;

                    case 'edit':
                        // Open the connection form with pre-filled data
                        {
                            const config = vscode.workspace.getConfiguration();
                            const connections = config.get<ConnectionInfo[]>('postgresExplorer.connections') || [];
                            const connectionToEdit = connections.find(c => c.id === message.id);

                            if (connectionToEdit) {
                                ConnectionManagementPanel.currentPanel?._panel.dispose(); // Close management panel
                                vscode.commands.executeCommand('postgres-explorer.addConnection', connectionToEdit);
                            } else {
                                vscode.window.showErrorMessage(`Connection not found: ${message.id}`);
                            }
                        }
                        break;

                    case 'test':
                        try {
                            const { Client } = require('pg');
                            const config = vscode.workspace.getConfiguration();
                            const connections = config.get<ConnectionInfo[]>('postgresExplorer.connections') || [];
                            const connection = connections.find(c => c.id === message.id);

                            if (!connection) {
                                throw new Error('Connection not found');
                            }

                            const password = await SecretStorageService.getInstance().getPassword(connection.id);

                            const client = new Client({
                                host: connection.host,
                                port: connection.port,
                                user: connection.username || undefined,
                                password: password || undefined,
                                database: connection.database || 'postgres',
                                connectionTimeoutMillis: 5000
                            });

                            await client.connect();
                            const result = await client.query('SELECT version()');
                            await client.end();

                            this._panel.webview.postMessage({
                                type: 'testSuccess',
                                id: message.id,
                                version: result.rows[0].version
                            });
                        } catch (err: any) {
                            this._panel.webview.postMessage({
                                type: 'testError',
                                id: message.id,
                                error: err.message
                            });
                        }
                        break;
                }
            },
            undefined,
            this._disposables
        );
    }

    public static show(extensionUri: vscode.Uri, extensionContext: vscode.ExtensionContext) {
        if (ConnectionManagementPanel.currentPanel) {
            ConnectionManagementPanel.currentPanel._panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'connectionManagement',
            'Manage Connections',
            vscode.ViewColumn.One,
            {
                enableScripts: true
            }
        );

        ConnectionManagementPanel.currentPanel = new ConnectionManagementPanel(panel, extensionUri, extensionContext);
    }

    private async _initialize() {
        await this._update();
    }

    private async _update() {
        this._panel.webview.html = await this._getHtmlForWebview(this._panel.webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const config = vscode.workspace.getConfiguration();
        const connections = config.get<ConnectionInfo[]>('postgresExplorer.connections') || [];
        const logoPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'postgres-vsc-icon.png'));

        // Get passwords for connections (to show if they exist)
        const connectionsWithStatus = await Promise.all(connections.map(async (conn) => {
            const password = await SecretStorageService.getInstance().getPassword(conn.id);
            return {
                ...conn,
                hasPassword: !!password
            };
        }));

        const connectionsHtml = connectionsWithStatus.length > 0
            ? connectionsWithStatus.map(conn => this._getConnectionCardHtml(conn)).join('')
            : `<div class="empty-state">
                    <div class="empty-icon">🔌</div>
                    <h2>No Connections</h2>
                    <p>You haven't added any database connections yet.</p>
                    <button class="btn-primary" onclick="addConnection()">Add Your First Connection</button>
                </div>`;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Manage Connections</title>
            <style>
                :root {
                    --bg-color: var(--vscode-editor-background);
                    --text-color: var(--vscode-editor-foreground);
                    --card-bg: var(--vscode-editor-background);
                    --border-color: var(--vscode-widget-border);
                    --accent-color: var(--vscode-textLink-foreground);
                    --hover-bg: var(--vscode-list-hoverBackground);
                    --danger-color: var(--vscode-errorForeground);
                    --success-color: var(--vscode-testing-iconPassed);
                    --secondary-text: var(--vscode-descriptionForeground);
                    --font-family: var(--vscode-font-family);
                    --shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
                    --shadow-hover: 0 8px 24px rgba(0, 0, 0, 0.08);
                    --card-radius: 12px;
                    --card-border: 1px solid var(--border-color);
                }

                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    background-color: var(--bg-color);
                    color: var(--text-color);
                    font-family: var(--font-family);
                    padding: 32px 24px;
                    line-height: 1.6;
                    min-height: 100vh;
                }

                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .header {
                    text-align: center;
                    margin-bottom: 48px;
                }

                .header-icon {
                    width: 56px;
                    height: 56px;
                    margin: 0 auto 16px;
                    background: linear-gradient(135deg, #336791 0%, #4a7ba7 100%);
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 12px rgba(51, 103, 145, 0.2);
                }

                .header-icon img {
                    width: 32px;
                    height: 32px;
                    filter: brightness(0) invert(1);
                }

                .header h1 {
                    font-size: 28px;
                    font-weight: 600;
                    letter-spacing: -0.5px;
                    margin-bottom: 8px;
                }

                .header p {
                    color: var(--secondary-text);
                    font-size: 14px;
                    margin-bottom: 24px;
                }

                .header-actions {
                    text-align: center;
                }

                .btn-primary {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 11px 24px;
                    border-radius: 7px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
                }

                .btn-primary:hover {
                    background: var(--vscode-button-hoverBackground);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                }

                .btn-primary:active {
                    transform: scale(0.98);
                }

                .btn-icon {
                    font-size: 16px;
                    line-height: 1;
                }

                .connections-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
                    gap: 20px;
                    margin-top: 24px;
                }

                .connection-card {
                    background: var(--card-bg);
                    border: var(--card-border);
                    border-radius: var(--card-radius);
                    padding: 24px;
                    box-shadow: var(--shadow);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                }

                .connection-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: linear-gradient(90deg, var(--accent-color), transparent);
                    opacity: 0.6;
                }

                .connection-card:hover {
                    transform: translateY(-4px);
                    box-shadow: var(--shadow-hover);
                    border-color: var(--accent-color);
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 20px;
                }

                .card-title {
                    font-size: 18px;
                    font-weight: 600;
                    margin-bottom: 6px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .card-icon {
                    font-size: 20px;
                }

                .card-status {
                    display: flex;
                    gap: 6px;
                    align-items: center;
                    flex-wrap: wrap;
                }

                .status-badge {
                    padding: 5px 12px;
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .status-badge.has-auth {
                    background: rgba(34, 197, 94, 0.15);
                    color: var(--success-color);
                    border: 1px solid var(--success-color);
                }

                .live-indicator {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    background: rgba(34, 197, 94, 0.1);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 600;
                    color: #22c55e;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .live-dot {
                    width: 8px;
                    height: 8px;
                    background: #22c55e;
                    border-radius: 50%;
                    animation: pulse 2s ease-in-out infinite;
                    box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
                }

                @keyframes pulse {
                    0%, 100% {
                        opacity: 1;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 0.4;
                        transform: scale(0.8);
                    }
                }

                .status-badge.no-auth {
                    background: rgba(128, 128, 128, 0.15);
                    color: var(--secondary-text);
                    border: 1px solid var(--secondary-text);
                }

                .card-details {
                    margin-bottom: 16px;
                }

                .detail-row {
                    display: flex;
                    margin-bottom: 10px;
                    font-size: 13px;
                    align-items: center;
                    gap: 8px;
                }

                .detail-icon {
                    font-size: 14px;
                    width: 20px;
                    opacity: 0.7;
                }

                .detail-label {
                    color: var(--secondary-text);
                    min-width: 70px;
                    font-weight: 500;
                }

                .detail-value {
                    color: var(--text-color);
                    font-family: 'Courier New', monospace;
                    word-break: break-all;
                    flex: 1;
                }

                .connection-string {
                    background: rgba(96, 165, 250, 0.08);
                    border: 1px solid rgba(96, 165, 250, 0.2);
                    border-radius: 6px;
                    padding: 10px 12px;
                    margin-bottom: 16px;
                    font-family: 'Courier New', monospace;
                    font-size: 11px;
                    word-break: break-all;
                    color: var(--text-color);
                }

                .card-actions {
                    display: flex;
                    gap: 8px;
                    padding-top: 16px;
                    border-top: 1px solid var(--border-color);
                }

                .btn {
                    flex: 1;
                    padding: 9px 16px;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                }

                .btn:active {
                    transform: scale(0.97);
                }

                .btn-test {
                    background: #4875b3;
                    color: #ffffff;
                    box-shadow: 0 2px 6px rgba(72, 117, 179, 0.3);
                }

                .btn-test:hover {
                    background: #5989c7;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 10px rgba(72, 117, 179, 0.4);
                }

                .btn-delete {
                    background: #d16969;
                    color: #ffffff;
                    box-shadow: 0 2px 6px rgba(209, 105, 105, 0.3);
                }

                .btn-delete:hover {
                    background: #e07a7a;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 10px rgba(209, 105, 105, 0.4);
                }

                .empty-state {
                    text-align: center;
                    padding: 80px 20px;
                    animation: fadeIn 0.4s ease;
                }

                .empty-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                    opacity: 0.4;
                }

                .empty-state h2 {
                    font-size: 24px;
                    font-weight: 600;
                    margin-bottom: 12px;
                }

                .empty-state p {
                    color: var(--secondary-text);
                    margin-bottom: 24px;
                    font-size: 14px;
                }

                .test-result {
                    margin-top: 12px;
                    padding: 10px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    display: none;
                    animation: slideDown 0.3s ease;
                }

                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .test-result.success {
                    background: rgba(34, 197, 94, 0.1);
                    color: var(--success-color);
                    border: 1px solid var(--success-color);
                }

                .test-result.error {
                    background: rgba(239, 68, 68, 0.1);
                    color: var(--danger-color);
                    border: 1px solid var(--danger-color);
                }

                .loading {
                    opacity: 0.6;
                    pointer-events: none;
                }

                .delete-confirmation {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(20, 20, 20, 0.98));
                    backdrop-filter: blur(8px);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.2s ease;
                    z-index: 10;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }

                .confirm-content {
                    text-align: center;
                    padding: 24px;
                }

                .confirm-content p {
                    font-size: 15px;
                    margin-bottom: 20px;
                    color: var(--text-color);
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                .confirm-content p::before {
                    content: '⚠️';
                    font-size: 20px;
                }

                .confirm-actions {
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                }

                .btn-confirm-yes,
                .btn-confirm-no {
                    padding: 9px 18px;
                    border: none;
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .btn-confirm-yes {
                    background: #d16969;
                    color: white;
                    box-shadow: 0 2px 8px rgba(209, 105, 105, 0.3);
                }

                .btn-confirm-yes::before {
                    content: '🗑️';
                    font-size: 14px;
                }

                .btn-confirm-yes:hover {
                    background: #e07a7a;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(209, 105, 105, 0.4);
                }

                .btn-confirm-yes:active {
                    transform: scale(0.97);
                }

                .btn-confirm-no {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }

                .btn-confirm-no:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                }

                .btn-confirm-no:active {
                    transform: scale(0.97);
                }

                .card-actions {
                    position: relative;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-icon">
                        <img src="${logoPath}" alt="PostgreSQL">
                    </div>
                    <h1>Connection Management</h1>
                    <p>Manage your PostgreSQL database connections</p>
                    <div class="header-actions">
                        <button class="btn-primary" onclick="addConnection()">
                            <span class="btn-icon">➕</span>
                            <span>Add Connection</span>
                        </button>
                    </div>
                </div>

                <div class="connections-grid">
                    ${connectionsHtml}
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function addConnection() {
                    vscode.postMessage({ command: 'addConnection' });
                }

                function refreshConnections() {
                    vscode.postMessage({ command: 'refresh' });
                }

                function testConnection(id) {
                    const btn = document.querySelector(\`[data-test-id="\${id}"]\`);
                    const result = document.getElementById(\`test-result-\${id}\`);
                    
                    btn.classList.add('loading');
                    btn.textContent = 'Testing...';
                    result.style.display = 'none';
                    
                    vscode.postMessage({ 
                        command: 'test',
                        id: id 
                    });
                }

                // Add event delegation for delete buttons
                document.addEventListener('click', function(event) {
                    const deleteBtn = event.target.closest('.btn-delete');
                    if (deleteBtn) {
                        const id = deleteBtn.getAttribute('data-connection-id');
                        const name = deleteBtn.getAttribute('data-connection-name');
                        
                        if (id) {
                            // Show custom confirmation
                            const card = deleteBtn.closest('.connection-card');
                            const existingConfirm = card.querySelector('.delete-confirmation');
                            
                            if (existingConfirm) {
                                existingConfirm.remove();
                                return;
                            }
                            
                            const confirmDiv = document.createElement('div');
                            confirmDiv.className = 'delete-confirmation';
                            confirmDiv.innerHTML = \`
                                <div class="confirm-content">
                                    <p>Delete "\${name}"?</p>
                                    <div class="confirm-actions">
                                        <button class="btn-confirm-no">Cancel</button>
                                        <button class="btn-confirm-yes">Delete</button>
                                    </div>
                                </div>
                            \`;
                            
                            card.querySelector('.card-actions').appendChild(confirmDiv);
                            
                            confirmDiv.querySelector('.btn-confirm-yes').addEventListener('click', function() {
                                vscode.postMessage({ 
                                    command: 'delete',
                                    id: id 
                                });
                            });
                            
                            confirmDiv.querySelector('.btn-confirm-no').addEventListener('click', function() {
                                confirmDiv.remove();
                            });
                        }
                    }
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    if (message.type === 'testSuccess') {
                        const btn = document.querySelector(\`[data-test-id="\${message.id}"]\`);
                        const result = document.getElementById(\`test-result-\${message.id}\`);
                        
                        btn.classList.remove('loading');
                        btn.textContent = '✓ Test';
                        
                        result.className = 'test-result success';
                        result.textContent = '✓ Connection successful!';
                        result.style.display = 'block';
                        
                        setTimeout(() => {
                            result.style.display = 'none';
                        }, 5000);
                    } else if (message.type === 'testError') {
                        const btn = document.querySelector(\`[data-test-id="\${message.id}"]\`);
                        const result = document.getElementById(\`test-result-\${message.id}\`);
                        
                        btn.classList.remove('loading');
                        btn.textContent = '✗ Test';
                        
                        result.className = 'test-result error';
                        result.textContent = \`✗ \${message.error}\`;
                        result.style.display = 'block';
                    }
                });
            </script>
        </body>
        </html>`;
    }

    private _getConnectionCardHtml(conn: ConnectionInfo & { hasPassword: boolean }): string {
        const connectionString = this._buildConnectionString(conn);
        const authBadge = conn.hasPassword || conn.username
            ? '<span class="status-badge has-auth">✓ Auth</span>'
            : '<span class="status-badge no-auth">No Auth</span>';

        return `
            <div class="connection-card">
                <div class="card-header">
                    <div>
                        <div class="card-title">
                            <span class="card-icon">🗄️</span>
                            <span>${this._escapeHtml(conn.name)}</span>
                        </div>
                    </div>
                    <div class="card-status">
                        <div class="live-indicator">
                            <span class="live-dot"></span>
                            <span>Live</span>
                        </div>
                        ${authBadge}
                    </div>
                </div>

                <div class="card-details">
                    <div class="detail-row">
                        <span class="detail-icon">🌐</span>
                        <span class="detail-label">Host:</span>
                        <span class="detail-value">${this._escapeHtml(conn.host)}:${conn.port}</span>
                    </div>
                    ${conn.database ? `
                    <div class="detail-row">
                        <span class="detail-icon">💾</span>
                        <span class="detail-label">Database:</span>
                        <span class="detail-value">${this._escapeHtml(conn.database)}</span>
                    </div>
                    ` : ''}
                    ${conn.username ? `
                    <div class="detail-row">
                        <span class="detail-icon">👤</span>
                        <span class="detail-label">User:</span>
                        <span class="detail-value">${this._escapeHtml(conn.username)}</span>
                    </div>
                    ` : ''}
                </div>

                <div class="connection-string">
                    ${this._escapeHtml(connectionString)}
                </div>

                <div id="test-result-${conn.id}" class="test-result"></div>

                <div class="card-actions">
                    <button class="btn btn-test" data-test-id="${conn.id}" onclick="testConnection('${conn.id}')">
                        ⚡ Test
                    </button>
                    <button class="btn btn-delete" data-connection-id="${conn.id}" data-connection-name="${this._escapeHtml(conn.name)}">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    }

    private _buildConnectionString(conn: ConnectionInfo): string {
        const auth = conn.username
            ? `${conn.username}${conn.password ? ':****' : ''}@`
            : '';
        const database = conn.database || 'postgres';
        return `postgresql://${auth}${conn.host}:${conn.port}/${database}`;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private dispose() {
        ConnectionManagementPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
