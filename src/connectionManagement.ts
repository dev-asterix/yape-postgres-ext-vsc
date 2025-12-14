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
                    --focus-border: var(--vscode-focusBorder);
                    --accent-color: var(--vscode-textLink-foreground);
                    --hover-bg: var(--vscode-list-hoverBackground);
                    --danger-color: var(--vscode-errorForeground);
                    --success-color: var(--vscode-testing-iconPassed);
                    --secondary-text: var(--vscode-descriptionForeground);
                    --font-family: var(--vscode-font-family);
                    --shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
                    --shadow-hover: 0 8px 24px rgba(0, 0, 0, 0.08);
                    --card-radius: 6px;
                }

                * { margin: 0; padding: 0; box-sizing: border-box; }

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
                    background: var(--hover-bg);
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }

                .header-icon img {
                    width: 32px;
                    height: 32px;
                }

                .header h1 {
                    font-size: 28px;
                    font-weight: 600;
                    margin-bottom: 8px;
                }

                .header p {
                    color: var(--secondary-text);
                    font-size: 14px;
                }

                .btn-primary {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    font-family: var(--font-family);
                    font-size: 13px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    text-decoration: none;
                    margin-top: 20px;
                }

                .btn-primary:hover {
                    background: var(--vscode-button-hoverBackground);
                }

                .connections-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                    gap: 20px;
                }

                .connection-card {
                    background-color: var(--card-bg);
                    border: 1px solid var(--border-color);
                    border-radius: var(--card-radius);
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    position: relative;
                }

                .connection-card:hover {
                    border-color: var(--focus-border);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }

                .card-title {
                    font-size: 16px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .status-badges {
                    display: flex;
                    gap: 6px;
                    font-size: 11px;
                }

                .status-badge {
                    padding: 2px 8px;
                    border-radius: 10px;
                    border: 1px solid var(--border-color);
                    background-color: var(--hover-bg);
                    color: var(--secondary-text);
                }

                .status-badge.live {
                    background-color: var(--success-color);
                    color: #fff;
                    border-color: transparent;
                }
                
                .status-badge.has-auth {
                    color: var(--success-color);
                    border-color: var(--success-color);
                }

                .card-details {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .detail-row {
                    display: flex;
                    font-size: 13px;
                    align-items: center;
                }

                .detail-label {
                    color: var(--secondary-text);
                    width: 80px;
                    flex-shrink: 0;
                }

                .detail-value {
                    font-family: 'Courier New', monospace;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .card-actions {
                    display: flex;
                    gap: 8px;
                    padding-top: 16px;
                    border-top: 1px solid var(--border-color);
                }

                .btn {
                    flex: 1;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: var(--font-family);
                    font-size: 12px;
                    border: 1px solid transparent;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    background: transparent;
                    color: var(--text-color);
                    border: 1px solid var(--border-color);
                }

                .btn:hover {
                    background-color: var(--hover-bg);
                }

                .btn-delete {
                    color: var(--danger-color);
                    border-color: var(--danger-color);
                }
                
                .btn-delete:hover {
                   background-color: var(--danger-color);
                   color: var(--bg-color);
                }

                .test-result-overlay {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-size: 12px;
                    z-index: 100;
                    display: none;
                    animation: slideIn 0.2s ease-out;
                }

                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .success { background-color: var(--success-color); color: white; }
                .error { background-color: var(--danger-color); color: white; }

                /* Delete Confirm Overlay */
                 .delete-confirm-overlay {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85);
                    backdrop-filter: blur(2px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                    z-index: 10;
                    flex-direction: column;
                    gap: 12px;
                    animation: fadeIn 0.2s;
                }

                .delete-confirm-overlay p {
                    color: white;
                    font-weight: 600;
                    margin: 0;
                }
                
                .confirm-buttons { display: flex; gap: 8px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-icon">
                        <img src="${logoPath}" alt="Logo">
                    </div>
                    <h1>Connection Management</h1>
                    <p>Manage your PostgreSQL database connections</p>
                    <button class="btn-primary" onclick="addConnection()">
                        <span>＋</span> Add Connection
                    </button>
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
                
                function editConnection(id) {
                    vscode.postMessage({ command: 'edit', id: id });
                }

                function refreshConnections() {
                    vscode.postMessage({ command: 'refresh' });
                }

                function testConnection(id) {
                    const btn = document.querySelector(\`[data-test-id="\${id}"]\`);
                    const originalText = btn.innerHTML;
                    btn.textContent = 'Testing...';
                    btn.disabled = true;
                    
                    vscode.postMessage({ command: 'test', id: id });
                    
                    // Store original text
                    btn.setAttribute('data-original-text', originalText);
                }
                
                function showDeleteConfirm(id) {
                    const card = document.querySelector(\`[data-card-id="\${id}"]\`);
                    if (card.querySelector('.delete-confirm-overlay')) return;
                    
                    const overlay = document.createElement('div');
                    overlay.className = 'delete-confirm-overlay';
                    overlay.innerHTML = \`
                        <p>Delete this connection?</p>
                        <div class="confirm-buttons">
                            <button class="btn" style="background:grey;color:white;border:none" onclick="this.closest('.delete-confirm-overlay').remove()">Cancel</button>
                            <button class="btn" style="background:red;color:white;border:none" onclick="deleteConnection('\${id}')">Delete</button>
                        </div>
                    \`;
                    card.appendChild(overlay);
                }

                function deleteConnection(id) {
                    vscode.postMessage({ command: 'delete', id: id });
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    if (message.type === 'testSuccess') {
                        const btn = document.querySelector(\`[data-test-id="\${message.id}"]\`);
                        const card = document.querySelector(\`[data-card-id="\${message.id}"]\`);
                        
                        btn.innerHTML = 'Scan ✓';
                        btn.disabled = false;
                        
                        showNotification(card, 'Connection successful!', 'success');
                        
                        setTimeout(() => {
                           const original = btn.getAttribute('data-original-text');
                           if(original) btn.innerHTML = original;
                        }, 3000);

                    } else if (message.type === 'testError') {
                         const btn = document.querySelector(\`[data-test-id="\${message.id}"]\`);
                        const card = document.querySelector(\`[data-card-id="\${message.id}"]\`);
                        
                        btn.innerHTML = 'Error ✕';
                        btn.disabled = false;
                        
                        showNotification(card, message.error, 'error');
                         setTimeout(() => {
                           const original = btn.getAttribute('data-original-text');
                           if(original) btn.innerHTML = original;
                        }, 3000);
                    }
                });
                
                function showNotification(card, text, type) {
                    const existing = card.querySelector('.test-result-overlay');
                    if(existing) existing.remove();
                    
                    const el = document.createElement('div');
                    el.className = \`test-result-overlay \${type}\`;
                    el.textContent = text;
                    card.appendChild(el);
                    el.style.display = 'block';
                    
                    setTimeout(() => {
                        el.style.opacity = '0';
                        setTimeout(() => el.remove(), 300);
                    }, 4000);
                }
            </script>
        </body>
        </html>`;
    }

    private _getConnectionCardHtml(conn: ConnectionInfo & { hasPassword: boolean }): string {
        const connectionString = this._buildConnectionString(conn);
        const authStatus = conn.hasPassword || conn.username
            ? 'Auth ✓'
            : 'No Auth';

        // Escaping helper
        const escape = (s: string | undefined) => this._escapeHtml(s || '');

        return `
            <div class="connection-card" data-card-id="${conn.id}">
                <div class="card-header">
                    <div class="card-title">
                        <span style="font-size:1.2em">🗄️</span>
                        <span>${escape(conn.name)}</span>
                    </div>
                    <div class="status-badges">
                        <span class="status-badge live">Live</span>
                        <span class="status-badge ${conn.hasPassword || conn.username ? 'has-auth' : ''}">${authStatus}</span>
                    </div>
                </div>

                <div class="card-details">
                    <div class="detail-row">
                        <span class="detail-label">Host:</span>
                        <span class="detail-value">${escape(conn.host)}:${conn.port}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Database:</span>
                        <span class="detail-value">${escape(conn.database)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">User:</span>
                        <span class="detail-value">${escape(conn.username)}</span>
                    </div>
                </div>

                <div class="card-actions">
                    <button class="btn" onclick="editConnection('${conn.id}')">
                        ✏️ Edit
                    </button>
                    <button class="btn" data-test-id="${conn.id}" onclick="testConnection('${conn.id}')">
                        ⚡ Test
                    </button>
                    <button class="btn btn-delete" onclick="showDeleteConfirm('${conn.id}')">
                        🗑️ Delete
                    </button>
                </div>
            </div>`;
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
