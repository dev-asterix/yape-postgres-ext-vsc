/**
 * Template Loader Utility
 * 
 * Loads HTML/CSS/JS templates from files and processes variable substitution.
 * Supports loading templates with embedded CSS and JS from separate files.
 */
import * as vscode from 'vscode';

interface TemplateVariables {
  [key: string]: string;
}

interface TemplateOptions {
  /** Template folder name (e.g., 'chat', 'ai-settings') */
  folder: string;
  /** CSS file to inline (optional) */
  cssFile?: string;
  /** JS file to inline (optional) */
  jsFile?: string;
  /** Variables to substitute in template */
  variables?: TemplateVariables;
}

/**
 * Load a template file and optionally inject CSS/JS
 */
export async function loadTemplate(
  extensionUri: vscode.Uri,
  templateName: string,
  options: TemplateOptions
): Promise<string> {
  const templatesDir = vscode.Uri.joinPath(extensionUri, 'templates', options.folder);

  // Load main HTML template
  const htmlUri = vscode.Uri.joinPath(templatesDir, `${templateName}.html`);
  let html = await readFileContent(htmlUri);

  // Load and inject CSS if specified
  if (options.cssFile) {
    const cssUri = vscode.Uri.joinPath(templatesDir, options.cssFile);
    const css = await readFileContent(cssUri);
    html = html.replace('{{STYLES}}', `<style>\n${css}\n</style>`);
  }

  // Load and inject JS if specified
  if (options.jsFile) {
    const jsUri = vscode.Uri.joinPath(templatesDir, options.jsFile);
    const js = await readFileContent(jsUri);
    html = html.replace('{{SCRIPTS}}', `<script>\n${js}\n</script>`);
  }

  // Replace variables
  if (options.variables) {
    html = substituteVariables(html, options.variables);
  }

  // Clean up any unreplaced placeholders
  html = html.replace(/\{\{STYLES\}\}/g, '');
  html = html.replace(/\{\{SCRIPTS\}\}/g, '');

  return html;
}

/**
 * Load a complete template with all parts (HTML, CSS, JS)
 */
export async function loadCompleteTemplate(
  extensionUri: vscode.Uri,
  folder: string,
  variables?: TemplateVariables
): Promise<string> {
  return loadTemplate(extensionUri, 'index', {
    folder,
    cssFile: 'styles.css',
    jsFile: 'scripts.js',
    variables
  });
}

/**
 * Generate a nonce for Content Security Policy
 */
export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Get webview URI for a resource
 */
export function getWebviewUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  pathSegments: string[]
): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathSegments));
}

/**
 * Read file content as string
 */
async function readFileContent(uri: vscode.Uri): Promise<string> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(content);
  } catch (error) {
    console.warn(`Template file not found: ${uri.fsPath}`);
    return '';
  }
}

/**
 * Substitute {{variable}} placeholders with values
 */
function substituteVariables(template: string, variables: TemplateVariables): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

/**
 * Build standard webview options
 */
export function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [extensionUri]
  };
}

/**
 * Build Content Security Policy for webviews
 */
export function buildCsp(webview: vscode.Webview, nonce: string): string {
  return `default-src 'none'; 
    style-src ${webview.cspSource} 'unsafe-inline'; 
    script-src 'nonce-${nonce}'; 
    img-src ${webview.cspSource} https: data:; 
    font-src ${webview.cspSource};`;
}
