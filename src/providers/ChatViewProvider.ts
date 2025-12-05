/**
 * Chat View Provider - Main controller for the SQL Chat Assistant
 * 
 * This is the refactored version that uses modular services:
 * - DbObjectService: Handles database object fetching for @ mentions
 * - AiService: Handles AI provider integration
 * - SessionService: Handles chat session storage
 * - webviewHtml: Provides the webview HTML template
 */
import * as vscode from 'vscode';
import { 
    ChatMessage, 
    FileAttachment, 
    DbMention, 
    DbObject,
    DbObjectService,
    AiService,
    SessionService,
    getWebviewHtml
} from './chat';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'postgresExplorer.chatView';

    private _view?: vscode.WebviewView;
    private _messages: ChatMessage[] = [];
    private _isProcessing = false;
    
    // Services
    private _dbObjectService: DbObjectService;
    private _aiService: AiService;
    private _sessionService: SessionService;

    constructor(
        private readonly _extensionUri: vscode.Uri, 
        context: vscode.ExtensionContext
    ) {
        this._dbObjectService = new DbObjectService();
        this._aiService = new AiService();
        this._sessionService = new SessionService(context);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = getWebviewHtml(webviewView.webview);

        // Send initial history
        setTimeout(() => this._sendHistoryToWebview(), 100);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    await this._handleUserMessage(data.message, data.attachments, data.mentions);
                    break;
                case 'clearChat':
                    this._messages = [];
                    this._sessionService.clearCurrentSession();
                    this._updateChatHistory();
                    break;
                case 'newChat':
                    await this._saveCurrentSession();
                    this._messages = [];
                    this._sessionService.clearCurrentSession();
                    this._updateChatHistory();
                    this._sendHistoryToWebview();
                    break;
                case 'pickFile':
                    await this._handleFilePick();
                    break;
                case 'loadSession':
                    await this._loadSession(data.sessionId);
                    break;
                case 'deleteSession':
                    console.log('[ChatView] Received deleteSession request for:', data.sessionId);
                    await this._deleteSession(data.sessionId);
                    break;
                case 'getHistory':
                    this._sendHistoryToWebview();
                    break;
                case 'searchDbObjects':
                    await this._handleSearchDbObjects(data.query);
                    break;
                case 'getDbObjectDetails':
                    await this._handleGetDbObjectDetails(data.object);
                    break;
                case 'getDbObjects':
                    await this._handleGetAllDbObjects();
                    break;
            }
        });
    }

    // ==================== Message Handling ====================

    private async _handleUserMessage(message: string, attachments?: FileAttachment[], mentions?: DbMention[]) {
        if (this._isProcessing) {
            return;
        }

        this._isProcessing = true;
        
        console.log('[ChatView] ========== HANDLING USER MESSAGE ==========');
        console.log('[ChatView] Message:', message);
        console.log('[ChatView] Attachments:', attachments?.length || 0);
        console.log('[ChatView] Mentions:', mentions?.length || 0);
        if (mentions && mentions.length > 0) {
            console.log('[ChatView] Mention details:', JSON.stringify(mentions, null, 2));
        }

        // Build message with attachments
        let fullMessage = message;
        if (attachments && attachments.length > 0) {
            const attachmentTexts = attachments.map(att => 
                `\n\n📎 **Attached File: ${att.name}** (${att.type})\n\`\`\`${att.type}\n${att.content}\n\`\`\``
            ).join('');
            fullMessage = message + attachmentTexts;
        }

        // Process @ mentions - add schema context for AI
        let aiMessage = fullMessage;
        if (mentions && mentions.length > 0) {
            console.log('[ChatView] Processing mentions for schema context...');
            let schemaContext = '\n\n=== DATABASE SCHEMA CONTEXT (Use this information to answer the question) ===\n';
            
            for (const mention of mentions) {
                console.log('[ChatView] Fetching schema for:', mention.schema + '.' + mention.name, 'type:', mention.type, 'connectionId:', mention.connectionId);
                const obj: DbObject = {
                    name: mention.name,
                    type: mention.type,
                    schema: mention.schema,
                    database: mention.database,
                    connectionId: mention.connectionId,
                    connectionName: '',
                    breadcrumb: mention.breadcrumb
                };
                
                try {
                    const schemaInfo = await this._dbObjectService.getObjectSchema(obj);
                    mention.schemaInfo = schemaInfo;
                    schemaContext += `\n### ${mention.type.toUpperCase()}: ${mention.schema}.${mention.name}\n`;
                    schemaContext += schemaInfo;
                    schemaContext += '\n';
                    console.log('[ChatView] Added schema context for:', mention.schema + '.' + mention.name);
                    console.log('[ChatView] Schema info received:', schemaInfo.substring(0, 500) + '...');
                } catch (e) {
                    const errorMsg = e instanceof Error ? e.message : String(e);
                    console.error('[ChatView] Failed to get schema for mention:', mention.name, e);
                    
                    // Notify user about the error
                    this._view?.webview.postMessage({
                        type: 'schemaError',
                        object: `${mention.schema}.${mention.name}`,
                        error: errorMsg
                    });
                    
                    // Still add a note in context so AI knows there was an issue
                    schemaContext += `\n### ${mention.type.toUpperCase()}: ${mention.schema}.${mention.name}\n`;
                    schemaContext += `[Schema could not be retrieved: ${errorMsg}]\n`;
                }
            }
            
            schemaContext += '\n=== END DATABASE SCHEMA CONTEXT ===\n\n';
            
            // Prepend schema context to the message so AI sees it first
            aiMessage = schemaContext + fullMessage;
            console.log('[ChatView] AI message with schema context length:', aiMessage.length);
            console.log('[ChatView] ========== FULL AI MESSAGE ==========');
            console.log(aiMessage);
            console.log('[ChatView] ========== END FULL AI MESSAGE ==========');
        }

        // Add user message to history
        this._messages.push({ role: 'user', content: fullMessage, attachments, mentions });
        this._updateChatHistory();

        // Show typing indicator
        this._setTypingIndicator(true);

        try {
            const config = vscode.workspace.getConfiguration('postgresExplorer');
            const provider = config.get<string>('aiProvider') || 'vscode-lm';
            console.log('[ChatView] Using AI provider:', provider);

            this._aiService.setMessages(this._messages);
            let response: string;

            if (provider === 'vscode-lm') {
                console.log('[ChatView] Calling VS Code LM API...');
                response = await this._aiService.callVsCodeLm(aiMessage);
            } else {
                console.log('[ChatView] Calling direct API:', provider);
                response = await this._aiService.callDirectApi(provider, aiMessage, config);
            }
            
            console.log('[ChatView] AI response received, length:', response.length);
            
            // Sanitize response - remove any HTML-like patterns that shouldn't be there
            // This prevents the model from learning bad patterns from previous responses
            response = this._sanitizeResponse(response);

            this._messages.push({ role: 'assistant', content: response });
            
            await this._saveCurrentSession();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._messages.push({ 
                role: 'assistant', 
                content: `❌ Error: ${errorMessage}\n\nPlease check your AI provider settings in the extension configuration.` 
            });
        } finally {
            this._setTypingIndicator(false);
            this._updateChatHistory();
            this._isProcessing = false;
        }
    }

    // Sanitize AI response to remove any HTML-like artifacts
    private _sanitizeResponse(response: string): string {
        // Remove patterns like: sql-keyword">, sql-string">, sql-function">, sql-number">, function">
        // These are CSS class artifacts that sometimes leak into AI responses
        let cleaned = response;
        
        // Remove CSS class-like patterns followed by ">
        cleaned = cleaned.replace(/\b(sql-keyword|sql-string|sql-function|sql-number|sql-type|sql-comment|sql-operator|sql-special|function)"\s*>/gi, '');
        
        // Remove any remaining HTML-like tags that shouldn't be in markdown
        cleaned = cleaned.replace(/<span[^>]*>/gi, '');
        cleaned = cleaned.replace(/<\/span>/gi, '');
        
        // Log if we found and cleaned anything
        if (cleaned !== response) {
            console.log('[ChatView] Sanitized AI response - removed HTML artifacts');
        }
        
        return cleaned;
    }

    // ==================== Database Objects ====================

    private async _handleSearchDbObjects(query: string): Promise<void> {
        try {
            // First fetch if cache is empty
            if (this._dbObjectService.getCache().length === 0) {
                await this._dbObjectService.fetchDbObjects();
            }
            
            const filtered = this._dbObjectService.searchObjects(query);
            
            this._view?.webview.postMessage({
                type: 'dbObjectsResult',
                objects: filtered
            });
        } catch (error) {
            this._view?.webview.postMessage({
                type: 'dbObjectsResult',
                objects: [],
                error: 'Failed to fetch database objects'
            });
        }
    }

    private async _handleGetDbObjectDetails(object: DbObject): Promise<DbObject> {
        try {
            const details = await this._dbObjectService.getObjectSchema(object);
            const objWithDetails = { ...object, details };
            this._view?.webview.postMessage({
                type: 'dbObjectDetails',
                object: objWithDetails
            });
            return objWithDetails;
        } catch (error) {
            return object;
        }
    }

    private async _handleGetAllDbObjects(): Promise<void> {
        try {
            const objects = await this._dbObjectService.fetchDbObjects();
            this._view?.webview.postMessage({
                type: 'dbObjectsResult',
                objects: objects.slice(0, 50)
            });
        } catch (error) {
            this._view?.webview.postMessage({
                type: 'dbObjectsResult',
                objects: [],
                error: 'No database connections available'
            });
        }
    }

    // ==================== File Handling ====================

    private async _handleFilePick() {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: {
                'SQL Files': ['sql', 'pgsql'],
                'Data Files': ['csv', 'json', 'txt'],
                'All Files': ['*']
            },
            title: 'Select a file to attach'
        });

        if (fileUri && fileUri[0]) {
            try {
                const fileContent = await vscode.workspace.fs.readFile(fileUri[0]);
                const content = new TextDecoder().decode(fileContent);
                const fileName = fileUri[0].path.split('/').pop() || 'file';
                
                const maxSize = 50000;
                const truncatedContent = content.length > maxSize 
                    ? content.substring(0, maxSize) + '\n... (truncated)'
                    : content;

                this._view?.webview.postMessage({
                    type: 'fileAttached',
                    file: {
                        name: fileName,
                        content: truncatedContent,
                        type: this._getFileType(fileName)
                    }
                });
            } catch (error) {
                vscode.window.showErrorMessage('Failed to read file');
            }
        }
    }

    private _getFileType(fileName: string): string {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const typeMap: { [key: string]: string } = {
            'sql': 'sql',
            'pgsql': 'sql',
            'json': 'json',
            'csv': 'csv',
            'txt': 'text'
        };
        return typeMap[ext] || 'text';
    }

    // ==================== Session Management ====================

    private async _saveCurrentSession(): Promise<void> {
        const config = vscode.workspace.getConfiguration('postgresExplorer');
        const provider = config.get<string>('aiProvider') || 'vscode-lm';
        
        await this._sessionService.saveSession(
            this._messages, 
            (msg) => this._aiService.generateTitle(msg, provider)
        );
        this._sendHistoryToWebview();
    }

    private async _loadSession(sessionId: string): Promise<void> {
        const messages = this._sessionService.loadSession(sessionId);
        if (messages) {
            this._messages = messages;
            this._updateChatHistory();
        }
    }

    private async _deleteSession(sessionId: string): Promise<void> {
        console.log('[ChatView] _deleteSession called with:', sessionId);
        const wasCurrentSession = await this._sessionService.deleteSession(sessionId);
        console.log('[ChatView] Session deleted, wasCurrentSession:', wasCurrentSession);
        
        if (wasCurrentSession) {
            this._messages = [];
            this._updateChatHistory();
        }
        
        console.log('[ChatView] Sending updated history to webview...');
        this._sendHistoryToWebview();
    }

    private _sendHistoryToWebview(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateHistory',
                sessions: this._sessionService.getSessionSummaries()
            });
        }
    }

    // ==================== UI Helpers ====================

    private _updateChatHistory(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateMessages',
                messages: this._messages
            });
        }
    }

    private _setTypingIndicator(isTyping: boolean): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'setTyping',
                isTyping
            });
        }
    }
}
