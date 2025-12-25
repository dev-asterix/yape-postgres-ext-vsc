import { Client } from 'pg';
import * as vscode from 'vscode';
import { SSHService } from './services/SSHService';

export interface ConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: string;
  // Advanced connection options
  sslmode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  sslCertPath?: string;
  sslKeyPath?: string;
  sslRootCertPath?: string;
  statementTimeout?: number;
  connectTimeout?: number;
  applicationName?: string;
  options?: string;
  ssh?: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    privateKeyPath?: string;
  };
}

export class ConnectionFormPanel {
  public static currentPanel: ConnectionFormPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, private readonly _extensionContext: vscode.ExtensionContext, private readonly _connectionToEdit?: ConnectionInfo) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._initialize();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'testConnection':
            try {
              const config: any = {
                user: message.connection.username || undefined,
                password: message.connection.password || undefined,
                database: message.connection.database || 'postgres'
              };

              if (message.connection.ssh && message.connection.ssh.enabled) {
                const stream = await SSHService.getInstance().createStream(
                  message.connection.ssh,
                  message.connection.host,
                  message.connection.port
                );
                config.stream = stream;
              } else {
                config.host = message.connection.host;
                config.port = message.connection.port;
              }

              // First try with specified database
              const client = new Client(config);
              try {
                await client.connect();
                const result = await client.query('SELECT version()');
                await client.end();
                this._panel.webview.postMessage({
                  type: 'testSuccess',
                  version: result.rows[0].version
                });
              } catch (err: any) {
                if (config.stream) {
                  // If using stream, we can't easily fallback without creating a new stream
                  // simpler to just throw for now or re-create stream
                  throw err;
                }

                // If database doesn't exist, try postgres database
                if (err.code === '3D000' && message.connection.database !== 'postgres') {
                  const fallbackClient = new Client({
                    host: message.connection.host,
                    port: message.connection.port,
                    user: message.connection.username || undefined,
                    password: message.connection.password || undefined,
                    database: 'postgres'
                  });
                  await fallbackClient.connect();
                  const result = await fallbackClient.query('SELECT version()');
                  await fallbackClient.end();
                  this._panel.webview.postMessage({
                    type: 'testSuccess',
                    version: result.rows[0].version + ' (connected to postgres database)'
                  });
                } else {
                  throw err;
                }
              }
            } catch (err: any) {
              this._panel.webview.postMessage({
                type: 'testError',
                error: err.message
              });
            }
            break;

          case 'saveConnection':
            try {
              const config: any = {
                user: message.connection.username || undefined,
                password: message.connection.password || undefined,
                database: 'postgres'
              };

              if (message.connection.ssh && message.connection.ssh.enabled) {
                const stream = await SSHService.getInstance().createStream(
                  message.connection.ssh,
                  message.connection.host,
                  message.connection.port
                );
                config.stream = stream;
              } else {
                config.host = message.connection.host;
                config.port = message.connection.port;
              }

              const client = new Client(config);

              await client.connect();

              // Verify we can query
              await client.query('SELECT 1');
              await client.end();

              const connections = this.getStoredConnections();
              const newConnection: ConnectionInfo = {
                id: this._connectionToEdit ? this._connectionToEdit.id : Date.now().toString(),
                name: message.connection.name,
                host: message.connection.host,
                port: message.connection.port,
                username: message.connection.username || undefined,
                password: message.connection.password || undefined,
                database: message.connection.database,
                // Advanced options
                sslmode: message.connection.sslmode || undefined,
                sslCertPath: message.connection.sslCertPath || undefined,
                sslKeyPath: message.connection.sslKeyPath || undefined,
                sslRootCertPath: message.connection.sslRootCertPath || undefined,
                statementTimeout: message.connection.statementTimeout || undefined,
                connectTimeout: message.connection.connectTimeout || undefined,
                applicationName: message.connection.applicationName || undefined,
                options: message.connection.options || undefined,
                ssh: message.connection.ssh
              };

              if (this._connectionToEdit) {
                const index = connections.findIndex(c => c.id === this._connectionToEdit!.id);
                if (index !== -1) {
                  connections[index] = newConnection;
                } else {
                  connections.push(newConnection);
                }
              } else {
                connections.push(newConnection);
              }

              await this.storeConnections(connections);

              vscode.window.showInformationMessage(`Connection ${this._connectionToEdit ? 'updated' : 'saved'} successfully!`);
              vscode.commands.executeCommand('postgres-explorer.refreshConnections');
              this._panel.dispose();
            } catch (err: any) {
              const errorMessage = err?.message || 'Unknown error occurred';
              vscode.window.showErrorMessage(`Failed to connect: ${errorMessage}`);
            }
            break;
        }
      },
      undefined,
      this._disposables
    );
  }

  public static show(extensionUri: vscode.Uri, extensionContext: vscode.ExtensionContext, connectionToEdit?: ConnectionInfo) {
    if (ConnectionFormPanel.currentPanel) {
      ConnectionFormPanel.currentPanel._panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'connectionForm',
      connectionToEdit ? 'Edit Connection' : 'Add PostgreSQL Connection',
      vscode.ViewColumn.One,
      {
        enableScripts: true
      }
    );

    ConnectionFormPanel.currentPanel = new ConnectionFormPanel(panel, extensionUri, extensionContext, connectionToEdit);
  }

  private async _initialize() {
    // The message handler is already set up in the constructor
    await this._update();
  }

  private async _update() {
    this._panel.webview.html = await this._getHtmlForWebview(this._panel.webview);
  }

  private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    const logoPath = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'postgres-vsc-icon.png'));

    let connectionData = null;
    if (this._connectionToEdit) {
      // Get the password from secret storage
      const password = await this._extensionContext.secrets.get(`postgres-password-${this._connectionToEdit.id}`);
      connectionData = {
        ...this._connectionToEdit,
        password
      };
    }

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${this._connectionToEdit ? 'Edit Connection' : 'Add PostgreSQL Connection'}</title>
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
                    --warning-color: var(--vscode-editorWarning-foreground);
                    --secondary-text: var(--vscode-descriptionForeground);
                    --font-family: var(--vscode-font-family);
                    --shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
                    --shadow-hover: 0 8px 24px rgba(0, 0, 0, 0.08);
                    --card-radius: 12px;
                    --card-border: 1px solid var(--border-color);
                    --input-bg: var(--vscode-input-background);
                    --input-fg: var(--vscode-input-foreground);
                    --input-border: var(--vscode-input-border);
                    --button-bg: var(--vscode-button-background);
                    --button-fg: var(--vscode-button-foreground);
                    --button-hover: var(--vscode-button-hoverBackground);
                    --button-secondary-bg: var(--vscode-button-secondaryBackground);
                    --button-secondary-fg: var(--vscode-button-secondaryForeground);
                    --button-secondary-hover: var(--vscode-button-secondaryHoverBackground);
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
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .container {
                    width: 100%;
                    max-width: 720px;
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .header {
                    text-align: center;
                    margin-bottom: 32px;
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
                }

                .card {
                    background: var(--card-bg);
                    border: var(--card-border);
                    border-radius: var(--card-radius);
                    box-shadow: var(--shadow);
                    padding: 32px;
                    transition: box-shadow 0.3s ease;
                }

                .section-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 24px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid var(--border-color);
                }

                .section-icon {
                    width: 28px;
                    height: 28px;
                    background: linear-gradient(135deg, var(--accent-color), var(--hover-bg));
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                }

                .section-title {
                    font-size: 15px;
                    font-weight: 600;
                    letter-spacing: -0.2px;
                    color: var(--text-color);
                }

                .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 24px;
                    margin-bottom: 32px;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                }

                .form-group.full-width {
                    grid-column: span 2;
                }

                label {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--text-color);
                }

                .required-indicator {
                    color: var(--danger-color);
                    font-size: 16px;
                    line-height: 1;
                }

                .label-hint {
                    display: block;
                    font-size: 12px;
                    color: var(--secondary-text);
                    font-weight: 400;
                    margin-top: 2px;
                }

                input {
                    width: 100%;
                    padding: 10px 14px;
                    background: var(--input-bg);
                    color: var(--input-fg);
                    border: 1.5px solid var(--input-border);
                    border-radius: 6px;
                    font-family: var(--font-family);
                    font-size: 13px;
                    transition: all 0.2s ease;
                }

                input:hover {
                    border-color: var(--accent-color);
                }

                input:focus {
                    outline: none;
                    border-color: var(--accent-color);
                    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
                }

                input::placeholder {
                    color: var(--secondary-text);
                    opacity: 0.6;
                }

                .message {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    margin-bottom: 24px;
                    display: none;
                    animation: slideDown 0.3s ease;
                }

                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .message-icon {
                    font-size: 18px;
                    line-height: 1;
                }

                .message.success {
                    background: rgba(34, 197, 94, 0.1);
                    border: 1.5px solid var(--success-color);
                    color: var(--success-color);
                }

                .message.error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1.5px solid var(--danger-color);
                    color: var(--danger-color);
                }

                .message.info {
                    background: rgba(96, 165, 250, 0.1);
                    border: 1.5px solid var(--accent-color);
                    color: var(--accent-color);
                }

                .actions {
                    display: flex;
                    gap: 12px;
                    padding-top: 24px;
                    border-top: 1px solid var(--border-color);
                }

                button {
                    flex: 1;
                    padding: 11px 20px;
                    border: none;
                    border-radius: 7px;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: var(--font-family);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                button:active {
                    transform: scale(0.98);
                }

                .btn-secondary {
                    background: var(--button-secondary-bg);
                    color: var(--button-secondary-fg);
                }

                .btn-secondary:hover:not(:disabled) {
                    background: var(--button-secondary-hover);
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }

                .btn-primary {
                    background: var(--button-bg);
                    color: var(--button-fg);
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
                }

                .btn-primary:hover:not(:disabled) {
                    background: var(--button-hover);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                }
                
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none !important;
                }

                .btn-icon {
                    font-size: 16px;
                    line-height: 1;
                }
                
                .hidden {
                    display: none !important;
                }

                .info-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: rgba(96, 165, 250, 0.1);
                    border: 1px solid rgba(96, 165, 250, 0.3);
                    border-radius: 6px;
                    font-size: 12px;
                    color: var(--accent-color);
                    margin-bottom: 24px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-icon">
                        <img src="${logoPath}" alt="PostgreSQL">
                    </div>
                    <h1>${this._connectionToEdit ? 'Edit Connection' : 'New Connection'}</h1>
                    <p>Configure your PostgreSQL database connection</p>
                </div>
                
                <div class="card">
                    <form id="connectionForm">
                        <div class="info-badge">
                            <span>💡</span>
                            <span>All fields marked with <span class="required-indicator">*</span> are required</span>
                        </div>

                        <div id="message" class="message"></div>

                        <div class="section-header">
                            <div class="section-icon">🔌</div>
                            <div class="section-title">Connection Details</div>
                        </div>
                        
                        <div class="form-grid">
                            <div class="form-group full-width">
                                <label for="name">
                                    Connection Name
                                    <span class="required-indicator">*</span>
                                </label>
                                <input type="text" id="name" name="name" required placeholder="e.g., Production Database">
                            </div>

                            <div class="form-group">
                                <label for="host">
                                    Host
                                    <span class="required-indicator">*</span>
                                    <span class="label-hint">Server address or IP</span>
                                </label>
                                <input type="text" id="host" name="host" required placeholder="localhost">
                            </div>

                            <div class="form-group">
                                <label for="port">
                                    Port
                                    <span class="required-indicator">*</span>
                                    <span class="label-hint">Default: 5432</span>
                                </label>
                                <input type="number" id="port" name="port" value="5432" required>
                            </div>

                            <div class="form-group full-width">
                                <label for="database">
                                    Database
                                    <span class="label-hint">Leave empty to connect to default database (postgres)</span>
                                </label>
                                <input type="text" id="database" name="database" placeholder="postgres">
                            </div>
                        </div>

                        <div class="section-header">
                            <div class="section-icon">🔐</div>
                            <div class="section-title">Authentication</div>
                        </div>

                        <div class="form-grid">
                            <div class="form-group">
                                <label for="username">
                                    Username
                                    <span class="label-hint">Database user</span>
                                </label>
                                <input type="text" id="username" name="username" placeholder="postgres">
                            </div>

                            <div class="form-group">
                                <label for="password">
                                    Password
                                    <span class="label-hint">Stored securely</span>
                                </label>
                                <input type="password" id="password" name="password" placeholder="••••••••">
                            </div>
                        </div>

                        <div class="actions">
                            <button type="button" id="testConnection" class="btn-secondary">
                                <span class="btn-icon">⚡</span>
                                <span>Test Connection</span>
                            </button>
                            <button type="submit" id="addConnection" class="btn-primary hidden">
                                <span class="btn-icon">✓</span>
                                <span>${this._connectionToEdit ? 'Save Changes' : 'Add Connection'}</span>
                            </button>
                        </div>
                        
                        <!-- SSH Settings (Collapsible) -->
                        <div style="margin-top: 32px; border-top: 1px solid var(--border-color); padding-top: 24px;">
                            <div class="section-header" style="cursor: pointer;" onclick="toggleSSH()">
                                <div class="section-icon">🔒</div>
                                <div class="section-title">SSH Tunnel (Optional)</div>
                                <span id="ssh-arrow" style="margin-left: auto; transition: transform 0.2s;">▼</span>
                            </div>

                            <div id="ssh-section" style="display: none;">
                                <div class="form-group" style="margin-bottom: 24px;">
                                    <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                        <input type="checkbox" id="sshEnabled" name="sshEnabled" style="width: auto;">
                                        <span>Enable SSH Tunnel</span>
                                    </label>
                                </div>

                                <div id="ssh-fields" style="opacity: 0.5; pointer-events: none; transition: opacity 0.2s;">
                                    <div class="form-grid">
                                        <div class="form-group">
                                            <label for="sshHost">SSH Host</label>
                                            <input type="text" id="sshHost" name="sshHost" placeholder="bastion.example.com">
                                        </div>
                                        <div class="form-group">
                                            <label for="sshPort">SSH Port</label>
                                            <input type="number" id="sshPort" name="sshPort" value="22">
                                        </div>
                                    </div>
                                    <div class="form-grid">
                                        <div class="form-group">
                                            <label for="sshUsername">SSH Username</label>
                                            <input type="text" id="sshUsername" name="sshUsername" placeholder="ec2-user">
                                        </div>
                                        <div class="form-group">
                                            <label for="sshKeyPath">Private Key Path</label>
                                            <input type="text" id="sshKeyPath" name="sshKeyPath" placeholder="/home/user/.ssh/id_rsa">
                                        </div>
                                    </div>
                            </div>
                        </div>
                        
                        <!-- Advanced Options (Collapsible) -->
                        <div style="margin-top: 32px; border-top: 1px solid var(--border-color); padding-top: 24px;">
                            <div class="section-header" style="cursor: pointer;" onclick="toggleAdvanced()">
                                <div class="section-icon">⚙️</div>
                                <div class="section-title">Advanced Options</div>
                                <span id="advanced-arrow" style="margin-left: auto; transition: transform 0.2s;">▼</span>
                            </div>

                            <div id="advanced-section" style="display: none;">
                                <div class="form-grid">
                                    <div class="form-group">
                                        <label for="sslmode">
                                            SSL Mode
                                            <span class="label-hint">Connection security level</span>
                                        </label>
                                        <select id="sslmode" name="sslmode" style="width: 100%; padding: 10px 14px; background: var(--input-bg); color: var(--input-fg); border: 1.5px solid var(--input-border); border-radius: 6px; font-family: var(--font-family); font-size: 13px;">
                                            <option value="">Default (prefer)</option>
                                            <option value="disable">Disable - No SSL</option>
                                            <option value="allow">Allow - Try non-SSL first</option>
                                            <option value="prefer">Prefer - Try SSL first</option>
                                            <option value="require">Require - SSL required</option>
                                            <option value="verify-ca">Verify CA - Verify server cert</option>
                                            <option value="verify-full">Verify Full - Verify server + hostname</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label for="applicationName">
                                            Application Name
                                            <span class="label-hint">Shown in pg_stat_activity</span>
                                        </label>
                                        <input type="text" id="applicationName" name="applicationName" placeholder="PgStudio">
                                    </div>
                                </div>

                                <div id="ssl-cert-fields" style="display: none;">
                                    <div class="info-badge" style="margin-bottom: 16px;">
                                        <span>🔐</span>
                                        <span>SSL certificate paths required for verify-ca/verify-full modes</span>
                                    </div>
                                    <div class="form-grid">
                                        <div class="form-group full-width">
                                            <label for="sslRootCertPath">
                                                CA Certificate Path
                                                <span class="label-hint">Root CA certificate for server verification</span>
                                            </label>
                                            <input type="text" id="sslRootCertPath" name="sslRootCertPath" placeholder="/path/to/ca-certificate.crt">
                                        </div>
                                        <div class="form-group">
                                            <label for="sslCertPath">
                                                Client Certificate Path
                                                <span class="label-hint">Optional client certificate</span>
                                            </label>
                                            <input type="text" id="sslCertPath" name="sslCertPath" placeholder="/path/to/client-cert.crt">
                                        </div>
                                        <div class="form-group">
                                            <label for="sslKeyPath">
                                                Client Key Path
                                                <span class="label-hint">Optional client private key</span>
                                            </label>
                                            <input type="text" id="sslKeyPath" name="sslKeyPath" placeholder="/path/to/client-key.key">
                                        </div>
                                    </div>
                                </div>

                                <div class="form-grid">
                                    <div class="form-group">
                                        <label for="connectTimeout">
                                            Connection Timeout
                                            <span class="label-hint">Seconds (default: 5)</span>
                                        </label>
                                        <input type="number" id="connectTimeout" name="connectTimeout" placeholder="5" min="1" max="300">
                                    </div>
                                    <div class="form-group">
                                        <label for="statementTimeout">
                                            Statement Timeout
                                            <span class="label-hint">Milliseconds (0 = no limit)</span>
                                        </label>
                                        <input type="number" id="statementTimeout" name="statementTimeout" placeholder="0" min="0">
                                    </div>
                                </div>

                                <div class="form-group" style="margin-top: 16px;">
                                    <label for="options">
                                        Additional Options
                                        <span class="label-hint">Raw connection parameters (e.g., -c search_path=myschema)</span>
                                    </label>
                                    <input type="text" id="options" name="options" placeholder="-c search_path=public">
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const messageDiv = document.getElementById('message');
                const testBtn = document.getElementById('testConnection');
                const addBtn = document.getElementById('addConnection');
                const form = document.getElementById('connectionForm');
                const inputs = form.querySelectorAll('input');

                // Injected connection data
                const connectionData = ${JSON.stringify(connectionData)};

                if (connectionData) {
                    document.getElementById('name').value = connectionData.name || '';
                    document.getElementById('host').value = connectionData.host || '';
                    document.getElementById('port').value = connectionData.port || 5432;
                    document.getElementById('database').value = connectionData.database || '';
                    document.getElementById('username').value = connectionData.username || '';
                    document.getElementById('password').value = connectionData.password || '';
                    
                    // Populate advanced options
                    if (connectionData.sslmode) {
                        document.getElementById('sslmode').value = connectionData.sslmode;
                    }
                    if (connectionData.sslCertPath) {
                        document.getElementById('sslCertPath').value = connectionData.sslCertPath;
                    }
                    if (connectionData.sslKeyPath) {
                        document.getElementById('sslKeyPath').value = connectionData.sslKeyPath;
                    }
                    if (connectionData.sslRootCertPath) {
                        document.getElementById('sslRootCertPath').value = connectionData.sslRootCertPath;
                    }
                    if (connectionData.statementTimeout) {
                        document.getElementById('statementTimeout').value = connectionData.statementTimeout;
                    }
                    if (connectionData.connectTimeout) {
                        document.getElementById('connectTimeout').value = connectionData.connectTimeout;
                    }
                    if (connectionData.applicationName) {
                        document.getElementById('applicationName').value = connectionData.applicationName;
                    }
                    if (connectionData.options) {
                        document.getElementById('options').value = connectionData.options;
                    }
                    
                    // Show advanced section if any advanced options are set
                    const hasAdvancedOptions = connectionData.sslmode || connectionData.statementTimeout || 
                        connectionData.connectTimeout || connectionData.applicationName || connectionData.options;
                    if (hasAdvancedOptions) {
                        setTimeout(() => {
                            const advSection = document.getElementById('advanced-section');
                            const advArrow = document.getElementById('advanced-arrow');
                            advSection.style.display = 'block';
                            advArrow.style.transform = 'rotate(180deg)';
                            updateSSLCertFields();
                        }, 100);
                    }
                    
                    if (connectionData.ssh) {
                        document.getElementById('sshEnabled').checked = connectionData.ssh.enabled;
                        document.getElementById('sshHost').value = connectionData.ssh.host || '';
                        document.getElementById('sshPort').value = connectionData.ssh.port || 22;
                        document.getElementById('sshUsername').value = connectionData.ssh.username || '';
                        document.getElementById('sshKeyPath').value = connectionData.ssh.privateKeyPath || '';
                        
                        // Trigger SSH UI state update
                        setTimeout(() => {
                             const sshSection = document.getElementById('ssh-section');
                             const arrow = document.getElementById('ssh-arrow');
                             sshSection.style.display = 'block';
                             arrow.style.transform = 'rotate(180deg)';
                             updateSSHState();
                        }, 100);
                    }
                }

                function toggleSSH() {
                    const section = document.getElementById('ssh-section');
                    const arrow = document.getElementById('ssh-arrow');
                    if (section.style.display === 'none') {
                        section.style.display = 'block';
                        arrow.style.transform = 'rotate(180deg)';
                    } else {
                        section.style.display = 'none';
                        arrow.style.transform = 'rotate(0deg)';
                    }
                }

                function updateSSHState() {
                    const enabled = document.getElementById('sshEnabled').checked;
                    const fields = document.getElementById('ssh-fields');
                    const inputs = fields.querySelectorAll('input');
                    
                    if (enabled) {
                        fields.style.opacity = '1';
                        fields.style.pointerEvents = 'auto';
                        inputs.forEach(i => i.required = true);
                        // Key path handles optionality differently usually, but for now required if enabled
                        document.getElementById('sshKeyPath').required = true;
                    } else {
                        fields.style.opacity = '0.5';
                        fields.style.pointerEvents = 'none';
                        inputs.forEach(i => i.required = false);
                    }
                }

                document.getElementById('sshEnabled').addEventListener('change', updateSSHState);

                // Advanced Options toggle
                function toggleAdvanced() {
                    const section = document.getElementById('advanced-section');
                    const arrow = document.getElementById('advanced-arrow');
                    if (section.style.display === 'none') {
                        section.style.display = 'block';
                        arrow.style.transform = 'rotate(180deg)';
                    } else {
                        section.style.display = 'none';
                        arrow.style.transform = 'rotate(0deg)';
                    }
                }

                // SSL mode change handler - show cert fields for verify modes
                function updateSSLCertFields() {
                    const sslmode = document.getElementById('sslmode').value;
                    const certFields = document.getElementById('ssl-cert-fields');
                    if (sslmode === 'verify-ca' || sslmode === 'verify-full') {
                        certFields.style.display = 'block';
                        document.getElementById('sslRootCertPath').required = true;
                    } else {
                        certFields.style.display = 'none';
                        document.getElementById('sslRootCertPath').required = false;
                    }
                }

                document.getElementById('sslmode').addEventListener('change', updateSSLCertFields);

                let isTested = false;

                function showMessage(text, type = 'info') {
                    const icons = {
                        success: '✓',
                        error: '✗',
                        info: 'ℹ'
                    };
                    messageDiv.innerHTML = \`<span class="message-icon">\${icons[type]}</span><span>\${text}</span>\`;
                    messageDiv.className = 'message ' + type;
                    messageDiv.style.display = 'flex';
                }

                function hideMessage() {
                    messageDiv.style.display = 'none';
                }

                function getFormData() {
                    const usernameInput = document.getElementById('username').value.trim();
                    const passwordInput = document.getElementById('password').value;
                    const sshEnabled = document.getElementById('sshEnabled').checked;
                    
                    const data = {
                        name: document.getElementById('name').value,
                        host: document.getElementById('host').value,
                        port: parseInt(document.getElementById('port').value),
                        database: document.getElementById('database').value || 'postgres',
                        username: usernameInput || undefined,
                        password: passwordInput || undefined,
                        // Advanced options
                        sslmode: document.getElementById('sslmode').value || undefined,
                        sslCertPath: document.getElementById('sslCertPath').value || undefined,
                        sslKeyPath: document.getElementById('sslKeyPath').value || undefined,
                        sslRootCertPath: document.getElementById('sslRootCertPath').value || undefined,
                        statementTimeout: document.getElementById('statementTimeout').value ? parseInt(document.getElementById('statementTimeout').value) : undefined,
                        connectTimeout: document.getElementById('connectTimeout').value ? parseInt(document.getElementById('connectTimeout').value) : undefined,
                        applicationName: document.getElementById('applicationName').value || undefined,
                        options: document.getElementById('options').value || undefined
                    };

                    if (sshEnabled) {
                        data.ssh = {
                            enabled: true,
                            host: document.getElementById('sshHost').value,
                            port: parseInt(document.getElementById('sshPort').value),
                            username: document.getElementById('sshUsername').value,
                            privateKeyPath: document.getElementById('sshKeyPath').value
                        };
                    }

                    return data;
                }

                // Reset tested state on any input change
                inputs.forEach(input => {
                    input.addEventListener('input', () => {
                        if (isTested) {
                            isTested = false;
                            addBtn.classList.add('hidden');
                            testBtn.classList.remove('hidden');
                            hideMessage();
                        }
                    });
                });

                testBtn.addEventListener('click', () => {
                    if (!form.checkValidity()) {
                        form.reportValidity();
                        return;
                    }
                    
                    hideMessage();
                    testBtn.disabled = true;
                    testBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Testing...</span>';
                    
                    vscode.postMessage({
                        command: 'testConnection',
                        connection: getFormData()
                    });
                });

                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    if (!isTested) return;
                    
                    hideMessage();
                    addBtn.disabled = true;
                    addBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Saving...</span>';
                    
                    vscode.postMessage({
                        command: 'saveConnection',
                        connection: getFormData()
                    });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    testBtn.disabled = false;
                    testBtn.innerHTML = '<span class="btn-icon">⚡</span><span>Test Connection</span>';
                    addBtn.disabled = false;
                    addBtn.innerHTML = '<span class="btn-icon">✓</span><span>Add Connection</span>';

                    switch (message.type) {
                        case 'testSuccess':
                            showMessage('Connection successful! ' + message.version, 'success');
                            isTested = true;
                            testBtn.classList.add('hidden');
                            addBtn.classList.remove('hidden');
                            break;
                        case 'testError':
                            showMessage('Connection failed: ' + message.error, 'error');
                            isTested = false;
                            addBtn.classList.add('hidden');
                            testBtn.classList.remove('hidden');
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private getStoredConnections(): ConnectionInfo[] {
    const connections = vscode.workspace.getConfiguration().get<ConnectionInfo[]>('postgresExplorer.connections') || [];
    return connections;
  }

  private async storeConnections(connections: ConnectionInfo[]): Promise<void> {
    try {
      // First store the connections without passwords in settings
      const connectionsForSettings = connections.map(({ password, ...connWithoutPassword }) => connWithoutPassword);
      await vscode.workspace.getConfiguration().update('postgresExplorer.connections', connectionsForSettings, vscode.ConfigurationTarget.Global);

      // Then store passwords in SecretStorage
      const secretsStorage = this._extensionContext.secrets;
      for (const conn of connections) {
        if (conn.password) {
          // Removed logging of sensitive connection information for security.
          await secretsStorage.store(`postgres-password-${conn.id}`, conn.password);
        }
      }
    } catch (error) {
      console.error('Failed to store connections:', error);
      // If anything fails, make sure we don't leave passwords in settings
      const existingConnections = vscode.workspace.getConfiguration().get<any[]>('postgresExplorer.connections') || [];
      const sanitizedConnections = existingConnections.map(({ password, ...connWithoutPassword }) => connWithoutPassword);
      await vscode.workspace.getConfiguration().update('postgresExplorer.connections', sanitizedConnections, vscode.ConfigurationTarget.Global);
      throw error;
    }
  }

  private dispose() {
    ConnectionFormPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
