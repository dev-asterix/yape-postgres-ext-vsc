import * as vscode from 'vscode';
import * as https from 'https';
import { getChatViewProvider } from './extension';

export interface AiSettings {
  provider: string;
  apiKey?: string;
  model?: string;
  endpoint?: string;
}

export class AiSettingsPanel {
  public static currentPanel: AiSettingsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly _extensionContext: vscode.ExtensionContext
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._initialize();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'saveSettings':
            try {
              const settings = message.settings;
              const config = vscode.workspace.getConfiguration('postgresExplorer');

              await config.update('aiProvider', settings.provider, vscode.ConfigurationTarget.Global);
              await config.update('aiModel', settings.model || '', vscode.ConfigurationTarget.Global);
              await config.update('aiEndpoint', settings.endpoint || '', vscode.ConfigurationTarget.Global);

              // Store API key in secret storage
              if (settings.apiKey) {
                await this._extensionContext.secrets.store('postgresExplorer.aiApiKey', settings.apiKey);
              } else {
                await this._extensionContext.secrets.delete('postgresExplorer.aiApiKey');
              }

              this._panel.webview.postMessage({
                type: 'saveSuccess'
              });

              // Notify chat view to refresh model info
              const chatViewProvider = getChatViewProvider();
              if (chatViewProvider) {
                chatViewProvider.refreshModelInfo();
              }

              vscode.window.showInformationMessage('AI settings saved successfully!');
            } catch (err: any) {
              this._panel.webview.postMessage({
                type: 'saveError',
                error: err.message
              });
            }
            break;

          case 'testConnection':
            try {
              const settings = message.settings;
              let testResult = '';

              if (settings.provider === 'vscode-lm') {
                // Test VS Code LM
                let models: vscode.LanguageModelChat[];

                if (settings.model) {
                  // Extract base name if format is "name (family)"
                  const baseName = settings.model.replace(/\s*\(.*\)$/, '').trim();

                  // Try to find the specific configured model
                  const allModels = await vscode.lm.selectChatModels({});
                  const matchingModels = allModels.filter(m =>
                    m.id === baseName ||
                    m.name === baseName ||
                    m.family === baseName ||
                    m.id === settings.model ||
                    m.name === settings.model ||
                    m.family === settings.model
                  );

                  if (matchingModels.length > 0) {
                    models = matchingModels;
                    testResult = `VS Code Language Model available: ${models[0].name || models[0].id}`;
                  } else {
                    testResult = `Configured model "${settings.model}" not found. Available models: ${allModels.map(m => m.name || m.id).join(', ')}`;
                  }
                } else {
                  // No specific model configured, check for any available models
                  models = await vscode.lm.selectChatModels({});
                  if (models.length > 0) {
                    testResult = `VS Code Language Model available. Found ${models.length} model(s): ${models.slice(0, 3).map(m => m.name || m.id).join(', ')}${models.length > 3 ? '...' : ''}`;
                  } else {
                    throw new Error('No VS Code Language Models available. Please install GitHub Copilot or other LM extension.');
                  }
                }
              } else if (settings.provider === 'openai') {
                // Test OpenAI connection
                if (!settings.apiKey) {
                  throw new Error('API Key is required for OpenAI');
                }
                testResult = await this._testOpenAI(settings.apiKey, settings.model || 'gpt-4');
              } else if (settings.provider === 'anthropic') {
                // Test Anthropic connection
                if (!settings.apiKey) {
                  throw new Error('API Key is required for Anthropic');
                }
                testResult = await this._testAnthropic(settings.apiKey, settings.model || 'claude-3-5-sonnet-20241022');
              } else if (settings.provider === 'gemini') {
                // Test Gemini connection
                if (!settings.apiKey) {
                  throw new Error('API Key is required for Gemini');
                }
                testResult = await this._testGemini(settings.apiKey, settings.model || 'gemini-pro');
              } else if (settings.provider === 'custom') {
                // Test custom endpoint
                if (!settings.endpoint) {
                  throw new Error('Endpoint is required for custom provider');
                }
                testResult = 'Custom endpoint configured. Ensure it supports OpenAI-compatible API.';
              }

              this._panel.webview.postMessage({
                type: 'testSuccess',
                result: testResult
              });
            } catch (err: any) {
              this._panel.webview.postMessage({
                type: 'testError',
                error: err.message
              });
            }
            break;

          case 'loadSettings':
            try {
              const config = vscode.workspace.getConfiguration('postgresExplorer');
              const apiKey = await this._extensionContext.secrets.get('postgresExplorer.aiApiKey');

              this._panel.webview.postMessage({
                type: 'settingsLoaded',
                settings: {
                  provider: config.get('aiProvider', 'vscode-lm'),
                  apiKey: apiKey || '',
                  model: config.get('aiModel', ''),
                  endpoint: config.get('aiEndpoint', '')
                }
              });
            } catch (err: any) {
              console.error('Failed to load settings:', err);
            }
            break;

          case 'listModels':
            try {
              const settings = message.settings;
              let models: string[] = [];

              if (settings.provider === 'vscode-lm') {
                const availableModels = await vscode.lm.selectChatModels();
                models = availableModels.map(m => {
                  // Show model name with family info if available
                  const name = m.name || m.id;
                  const family = m.family;
                  return family && family !== name ? `${name} (${family})` : name;
                });
              } else if (settings.provider === 'openai') {
                if (!settings.apiKey) {
                  throw new Error('API Key is required to list models');
                }
                models = await this._listOpenAIModels(settings.apiKey);
              } else if (settings.provider === 'anthropic') {
                // Anthropic doesn't have a public models API, use known models
                models = [
                  'claude-3-5-sonnet-20241022',
                  'claude-3-5-haiku-20241022',
                  'claude-3-opus-20240229',
                  'claude-3-sonnet-20240229',
                  'claude-3-haiku-20240307'
                ];
              } else if (settings.provider === 'gemini') {
                if (!settings.apiKey) {
                  throw new Error('API Key is required to list models');
                }
                models = await this._listGeminiModels(settings.apiKey);
              } else if (settings.provider === 'custom') {
                // Try to list models from custom endpoint using OpenAI-compatible API
                if (settings.endpoint && settings.apiKey) {
                  models = await this._listCustomModels(settings.endpoint, settings.apiKey);
                } else {
                  models = ['custom-model'];
                }
              }

              this._panel.webview.postMessage({
                type: 'modelsListed',
                models: models
              });
            } catch (err: any) {
              this._panel.webview.postMessage({
                type: 'modelsListError',
                error: err.message
              });
            }
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _listOpenAIModels(apiKey: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/models',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      };

      const req = https.request(options, (res: any) => {
        let body = '';
        res.on('data', (chunk: any) => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body);
              // Filter for chat models only (gpt-*)
              const chatModels = data.data
                .filter((m: any) => m.id.startsWith('gpt-'))
                .map((m: any) => m.id)
                .sort()
                .reverse(); // Show newer models first
              resolve(chatModels);
            } catch (e) {
              reject(new Error('Failed to parse models response'));
            }
          } else {
            reject(new Error(`Failed to list models: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err: any) => reject(err));
      req.end();
    });
  }

  private async _listGeminiModels(apiKey: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models?key=${apiKey}`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res: any) => {
        let body = '';
        res.on('data', (chunk: any) => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body);
              // Filter for generateContent capable models
              const models = data.models
                .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
                .map((m: any) => m.name.replace('models/', ''))
                .sort();
              resolve(models);
            } catch (e) {
              reject(new Error('Failed to parse models response'));
            }
          } else {
            reject(new Error(`Failed to list models: ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err: any) => reject(err));
      req.end();
    });
  }

  private async _listCustomModels(endpoint: string, apiKey: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(endpoint);
        // Try OpenAI-compatible /v1/models endpoint
        const modelsPath = url.pathname.replace(/\/chat\/completions$/, '') + '/models';

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: modelsPath,
          method: 'GET',
          headers: apiKey ? {
            'Authorization': `Bearer ${apiKey}`
          } : {}
        };

        const protocol = url.protocol === 'https:' ? https : require('http');
        const req = protocol.request(options, (res: any) => {
          let body = '';
          res.on('data', (chunk: any) => body += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const data = JSON.parse(body);
                const models = data.data?.map((m: any) => m.id) || [];
                resolve(models);
              } catch (e) {
                resolve(['custom-model']); // Fallback
              }
            } else {
              resolve(['custom-model']); // Fallback
            }
          });
        });

        req.on('error', () => resolve(['custom-model'])); // Fallback on error
        req.end();
      } catch (e) {
        resolve(['custom-model']); // Fallback
      }
    });
  }

  private async _testOpenAI(apiKey: string, model: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });

      const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(`OpenAI connection successful! Model: ${model}`);
          } else {
            reject(new Error(`OpenAI API error: ${res.statusCode} - ${body}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.write(data);
      req.end();
    });
  }

  private async _testAnthropic(apiKey: string, model: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });

      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(`Anthropic connection successful! Model: ${model}`);
          } else {
            reject(new Error(`Anthropic API error: ${res.statusCode} - ${body}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.write(data);
      req.end();
    });
  }

  private async _testGemini(apiKey: string, model: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

      const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(`Gemini connection successful! Model: ${model}`);
          } else {
            reject(new Error(`Gemini API error: ${res.statusCode} - ${body}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.write(data);
      req.end();
    });
  }

  public static show(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    const column = vscode.ViewColumn.One;

    if (AiSettingsPanel.currentPanel) {
      AiSettingsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'aiSettings',
      'AI Settings',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    AiSettingsPanel.currentPanel = new AiSettingsPanel(panel, extensionUri, context);
  }


  private async _initialize() {
    this._panel.webview.html = await this._getHtmlContent();
  }

  private async _getHtmlContent(): Promise<string> {
    const nonce = this._getNonce();
    const logoUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'resources', 'postgres-vsc-icon.png')
    );
    const cspSource = this._panel.webview.cspSource;

    try {
      // Load template files
      const templatesDir = vscode.Uri.joinPath(this._extensionUri, 'templates', 'ai-settings');

      const [htmlBuffer, cssBuffer, jsBuffer] = await Promise.all([
        vscode.workspace.fs.readFile(vscode.Uri.joinPath(templatesDir, 'index.html')),
        vscode.workspace.fs.readFile(vscode.Uri.joinPath(templatesDir, 'styles.css')),
        vscode.workspace.fs.readFile(vscode.Uri.joinPath(templatesDir, 'scripts.js'))
      ]);

      let html = new TextDecoder().decode(htmlBuffer);
      const css = new TextDecoder().decode(cssBuffer);
      const js = new TextDecoder().decode(jsBuffer);

      // Build CSP string
      const csp = `default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;

      // Replace placeholders
      html = html.replace('{{CSP}}', csp);
      html = html.replace('{{INLINE_STYLES}}', () => css);
      html = html.replace('{{INLINE_SCRIPTS}}', () => js);
      html = html.replace(/\{\{NONCE\}\}/g, nonce);
      html = html.replace('{{LOGO_URI}}', logoUri.toString());

      return html;
    } catch (error) {
      console.error('Failed to load AI settings templates:', error);
      return `<!DOCTYPE html>
            <html>
            <body>
                <h1>Error loading AI Settings</h1>
                <p>Could not load template files. Please check that the extension is installed correctly.</p>
                <p>Error: ${error instanceof Error ? error.message : String(error)}</p>
            </body>
            </html>`;
    }
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  private dispose() {
    AiSettingsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
