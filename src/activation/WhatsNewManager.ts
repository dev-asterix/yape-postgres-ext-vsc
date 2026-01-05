
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class WhatsNewManager implements vscode.WebviewViewProvider {
  private static readonly viewType = 'postgresExplorer.whatsNew';
  private static readonly globalStateKey = 'postgres-explorer.lastRunVersion';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri
  ) { }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'resources'),
        vscode.Uri.joinPath(this.extensionUri, 'out')
      ]
    };

    const currentVersion = this.context.extension.packageJSON.version;
    webviewView.webview.html = await this.getWebviewContent(webviewView.webview, currentVersion, true);
  }

  public async checkAndShow(manual: boolean = false): Promise<void> {
    const currentVersion = this.context.extension.packageJSON.version;
    const lastRunVersion = this.context.globalState.get<string>(WhatsNewManager.globalStateKey);

    if (manual || currentVersion !== lastRunVersion) {
      this.showWhatsNew(currentVersion);
      await this.context.globalState.update(WhatsNewManager.globalStateKey, currentVersion);
    }
  }

  private async showWhatsNew(version: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    const panel = vscode.window.createWebviewPanel(
      WhatsNewManager.viewType,
      `What's New in PgStudio ${version}`,
      column,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'resources'),
          vscode.Uri.joinPath(this.extensionUri, 'out') // In case we need scripts
        ]
      }
    );

    panel.webview.html = await this.getWebviewContent(panel.webview, version, false);
  }

  private async getWebviewContent(webview: vscode.Webview, version: string, isSidebar: boolean): Promise<string> {
    const changelogContent = await this.getChangelogContent();
    const logoPath = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'postgres-explorer.png'));
    const markedUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'marked.min.js'));

    // Encode content to avoid script injection issues
    const encodedChangelog = Buffer.from(changelogContent).toString('base64');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>What's New in PgStudio</title>
        <script src="${markedUri}"></script>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: ${isSidebar ? '10px' : '20px'};
            line-height: 1.6;
            max-width: ${isSidebar ? '100%' : '800px'};
            margin: 0 auto;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            font-size: ${isSidebar ? '0.9em' : '1em'};
          }
          h1, h2, h3 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 0.3em;
          }
          h1 { font-size: ${isSidebar ? '1.5em' : '2em'}; margin-top: 0; }
          h2 { font-size: ${isSidebar ? '1.2em' : '1.5em'}; margin-top: 1.5em; }
          h3 { font-size: ${isSidebar ? '1.1em' : '1.25em'}; margin-top: 1em; color: var(--vscode-editor-foreground); border-bottom: none; }
          
          .header {
            display: flex;
            align-items: center;
            margin-bottom: ${isSidebar ? '1rem' : '2rem'};
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: ${isSidebar ? '0.5rem' : '1rem'};
            flex-direction: ${isSidebar ? 'column' : 'row'};
            text-align: ${isSidebar ? 'center' : 'left'};
          }
          .logo {
            width: ${isSidebar ? '48px' : '64px'};
            height: ${isSidebar ? '48px' : '64px'};
            margin-right: ${isSidebar ? '0' : '1.5rem'};
            margin-bottom: ${isSidebar ? '0.5rem' : '0'};
          }
          .version-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.9em;
            margin-left: ${isSidebar ? '0.5rem' : '1rem'};
            vertical-align: middle;
          }
          
          /* Markdown Content Styling */
          .content {
            margin-top: 1rem;
          }
          .content a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
          }
          .content a:hover {
            text-decoration: underline;
          }
          .content code {
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textBlockQuote-background);
            padding: 2px 4px;
            border-radius: 3px;
          }
          .content pre {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 1rem;
            overflow-x: auto;
            border-radius: 4px;
          }
          .content pre code {
            background-color: transparent;
            padding: 0;
          }
          .content blockquote {
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            margin: 0;
            padding-left: 1rem;
            color: var(--vscode-descriptionForeground);
          }
          .content ul, .content ol {
            padding-left: ${isSidebar ? '1.2rem' : '2rem'};
          }
          .content li {
            margin-bottom: 0.5rem;
          }

          .footer {
            margin-top: 3rem;
            padding-top: 1rem;
            border-top: 1px solid var(--vscode-widget-border);
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoPath}" alt="PgStudio Logo" class="logo">
          <div>
            <h1>PgStudio <span class="version-badge">v${version}</span></h1>
            ${isSidebar ? '' : '<p>Thanks for using PgStudio! Here are the latest updates.</p>'}
          </div>
        </div>

        <div id="markdown-content" class="content"></div>

        <div class="footer">
          <p>
            <a href="https://github.com/dev-asterix/PgStudio/issues">Report Issue</a> | 
            <a href="https://github.com/dev-asterix/PgStudio">GitHub Repository</a>
          </p>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const rawContent = "${encodedChangelog}";
          
          // Decode base64
          const decodedContent = atob(rawContent);

          // Render Markdown
          document.getElementById('markdown-content').innerHTML = marked.parse(decodedContent);
        </script>
      </body>
      </html>
    `;
  }

  private async getChangelogContent(): Promise<string> {
    const variants = ['CHANGELOG.md', 'changelog.md', 'Changelog.md'];

    for (const variant of variants) {
      try {
        const changelogPath = path.join(this.extensionUri.fsPath, variant);
        return await fs.promises.readFile(changelogPath, 'utf8');
      } catch {
        // Try next variant
      }
    }

    // List what files actually exist in extension root for debugging
    let files: string[] = [];
    try {
      files = await fs.promises.readdir(this.extensionUri.fsPath);
    } catch {
      files = ['(unable to list directory)'];
    }

    return `# Error\nUnable to load CHANGELOG.md\n\nExtension path: \`${this.extensionUri.fsPath}\`\n\nFiles in extension root:\n${files.map(f => `- ${f}`).join('\n')}`;
  }
}
