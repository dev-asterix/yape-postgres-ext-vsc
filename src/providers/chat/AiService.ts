/**
 * AI Provider service for chat functionality
 */
import * as vscode from 'vscode';
import * as https from 'https';
import { ChatMessage } from './types';

export class AiService {
    private _messages: ChatMessage[] = [];

    setMessages(messages: ChatMessage[]): void {
        this._messages = messages;
    }

    buildSystemPrompt(): string {
        return `You are an expert PostgreSQL database assistant. You help users with:
- Writing and optimizing SQL queries
- Understanding database concepts and best practices
- Debugging query issues
- Explaining query execution plans
- Schema design recommendations
- PostgreSQL-specific features and extensions

**IMPORTANT - DATABASE SCHEMA CONTEXT:**
When the user references database objects (tables, views, functions, etc.), I will provide you with the actual schema information in a section marked "=== DATABASE SCHEMA CONTEXT ===". 
- ALWAYS use this provided schema information when answering questions
- The schema context includes real column names, data types, constraints, indexes, and relationships
- Reference the exact column names and types from the provided schema
- Do NOT say you don't have access to the schema when it's provided in the context

**SQL QUALITY CHECKLIST (MANDATORY - Follow before every SQL response):**
Before providing any SQL query, you MUST verify:
1. ✓ All table names exist in the provided schema context or user input
2. ✓ All column names are EXACTLY as shown in the schema (case-sensitive)
3. ✓ All data types are compatible with the operations performed
4. ✓ JOIN conditions use correct column names from both tables
5. ✓ WHERE conditions reference existing columns
6. ✓ GROUP BY includes all non-aggregated columns in SELECT
7. ✓ No syntax errors (matching parentheses, proper comma placement, semicolon at end)
8. ✓ Aliases are used consistently throughout the query
9. ✓ Foreign key relationships are correctly referenced
10. ✓ The query is complete and can be executed as-is

**SQL FORMATTING RULES (MANDATORY):**
When providing SQL code, ALWAYS format it for maximum readability:
1. Use proper indentation (4 spaces) for nested clauses
2. Put each major clause (SELECT, FROM, WHERE, JOIN, GROUP BY, ORDER BY, etc.) on a new line
3. Put each column in SELECT on its own line for queries with more than 3 columns
4. Put each condition in WHERE/AND/OR on its own line
5. Align JOIN conditions properly
6. Use UPPERCASE for SQL keywords
7. Use lowercase for table/column names (unless schema shows otherwise)
8. Add blank lines between CTEs and main query
9. Break long lines at logical points (operators, commas)
10. Always end queries with a semicolon

Example of properly formatted SQL:
\`\`\`sql
SELECT
    u.id,
    u.username,
    u.email,
    COUNT(o.id) AS order_count,
    SUM(o.total_amount) AS total_spent
FROM
    users u
LEFT JOIN
    orders o ON o.user_id = u.id
WHERE
    u.created_at >= '2024-01-01'
    AND u.status = 'active'
GROUP BY
    u.id,
    u.username,
    u.email
HAVING
    COUNT(o.id) > 5
ORDER BY
    total_spent DESC
LIMIT 100;
\`\`\`

**RESPONSE QUALITY:**
- Double-check all SQL for correctness before responding
- If schema context is provided, ONLY use columns that exist in that schema
- If you're unsure about a column name, ask the user to clarify
- Provide complete, executable SQL - never truncate or abbreviate
- If a query is complex, break it down and explain each part
- NEVER include HTML tags, CSS classes, or any markup in SQL code
- SQL strings should use single quotes like 'value', not any special formatting
- Your output is plain markdown only - no HTML

IMPORTANT: At the end of each response, provide 2-4 numbered follow-up questions the user might want to ask next. Format them as:

**Follow-up questions:**
1. [First question]
2. [Second question]
3. [Third question]

Make these questions relevant to the topic discussed and progressively more advanced.`;
    }

    async callVsCodeLm(userMessage: string): Promise<string> {
        const models = await vscode.lm.selectChatModels({ family: 'gpt-4' });
        let model = models[0];

        if (!model) {
            const allModels = await vscode.lm.selectChatModels({});
            model = allModels[0];
        }

        if (!model) {
            throw new Error('No AI models available via VS Code API. Please ensure GitHub Copilot Chat is installed or switch provider.');
        }

        const systemPrompt = this.buildSystemPrompt();
        const messages = [
            vscode.LanguageModelChatMessage.User(systemPrompt),
            ...this._messages.slice(-10).map(msg => 
                msg.role === 'user' 
                    ? vscode.LanguageModelChatMessage.User(this._sanitizeContent(msg.content))
                    : vscode.LanguageModelChatMessage.Assistant(this._sanitizeContent(msg.content))
            ),
            vscode.LanguageModelChatMessage.User(userMessage)
        ];

        // Debug: Log all messages being sent to model
        console.log('[AiService] ========== MESSAGES SENT TO MODEL ==========');
        console.log('[AiService] System prompt length:', systemPrompt.length);
        console.log('[AiService] Conversation history messages:', this._messages.length);
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const role = i === 0 ? 'SYSTEM' : (msg.role === vscode.LanguageModelChatMessageRole.User ? 'USER' : 'ASSISTANT');
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            console.log(`[AiService] Message ${i} (${role}):`, content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        }
        console.log('[AiService] Current user message:', userMessage);
        console.log('[AiService] ========== END MESSAGES ==========');

        const chatRequest = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        let responseText = '';

        for await (const fragment of chatRequest.text) {
            responseText += fragment;
        }

        // Debug: Log raw response from model
        console.log('[AiService] ========== RAW RESPONSE FROM MODEL ==========');
        console.log(responseText);
        console.log('[AiService] ========== END RAW RESPONSE ==========');

        return responseText;
    }

    // Sanitize content to remove any HTML/CSS artifacts before sending to AI
    private _sanitizeContent(content: string): string {
        let cleaned = content;
        // Remove CSS class-like patterns that may have leaked into history
        cleaned = cleaned.replace(/\b(sql-keyword|sql-string|sql-function|sql-number|sql-type|sql-comment|sql-operator|sql-special|function)"\s*>/gi, '');
        cleaned = cleaned.replace(/<span[^>]*>/gi, '');
        cleaned = cleaned.replace(/<\/span>/gi, '');
        return cleaned;
    }

    async callDirectApi(provider: string, userMessage: string, config: vscode.WorkspaceConfiguration): Promise<string> {
        const apiKey = config.get<string>('aiApiKey');
        if (!apiKey) {
            throw new Error(`API Key is required for ${provider} provider. Please configure postgresExplorer.aiApiKey.`);
        }

        let endpoint = '';
        let model = config.get<string>('aiModel');
        let headers: any = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        };
        let body: any = {};

        const systemPrompt = this.buildSystemPrompt();
        
        // Sanitize conversation history to remove any HTML artifacts
        const conversationHistory = this._messages.slice(-10).map(msg => ({
            role: msg.role,
            content: this._sanitizeContent(msg.content)
        }));

        if (provider === 'openai') {
            endpoint = 'https://api.openai.com/v1/chat/completions';
            model = model || 'gpt-4';
            body = {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...conversationHistory,
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7
            };
        } else if (provider === 'anthropic') {
            endpoint = 'https://api.anthropic.com/v1/messages';
            model = model || 'claude-3-opus-20240229';
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
            delete headers['Authorization'];
            body = {
                model: model,
                system: systemPrompt,
                messages: [
                    ...conversationHistory,
                    { role: 'user', content: userMessage }
                ],
                max_tokens: 4096
            };
        } else if (provider === 'gemini') {
            model = model || 'gemini-2.0-flash';
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            headers['X-goog-api-key'] = apiKey;
            delete headers['Authorization'];
            
            const contents = [
                { role: 'user', parts: [{ text: systemPrompt }] },
                ...conversationHistory.map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                })),
                { role: 'user', parts: [{ text: userMessage }] }
            ];
            
            body = { contents };
        } else if (provider === 'custom') {
            endpoint = config.get<string>('aiEndpoint') || '';
            if (!endpoint) {
                throw new Error('Endpoint is required for custom provider');
            }
            model = model || 'gpt-3.5-turbo';
            body = {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...conversationHistory,
                    { role: 'user', content: userMessage }
                ]
            };
        } else {
            throw new Error(`Unsupported provider: ${provider}`);
        }

        return this._makeHttpRequest(endpoint, headers, body, provider);
    }

    private _makeHttpRequest(endpoint: string, headers: any, body: any, provider: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint);
            const requestData = JSON.stringify(body);

            const options: https.RequestOptions = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Length': Buffer.byteLength(requestData)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        
                        if (res.statusCode !== 200) {
                            reject(new Error(response.error?.message || `API request failed with status ${res.statusCode}`));
                            return;
                        }

                        let content = '';
                        if (provider === 'anthropic') {
                            content = response.content?.[0]?.text || '';
                        } else if (provider === 'gemini') {
                            content = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        } else {
                            content = response.choices?.[0]?.message?.content || '';
                        }
                        
                        resolve(content);
                    } catch (e) {
                        reject(new Error('Failed to parse API response'));
                    }
                });
            });

            req.on('error', reject);
            req.write(requestData);
            req.end();
        });
    }

    async generateTitle(firstMessage: string, provider: string): Promise<string> {
        try {
            if (provider === 'vscode-lm') {
                const models = await vscode.lm.selectChatModels({});
                if (models.length > 0) {
                    const prompt = `Generate a very short title (max 5 words) for a chat about: "${firstMessage.substring(0, 100)}". Return only the title, nothing else.`;
                    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
                    const response = await models[0].sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
                    let title = '';
                    for await (const fragment of response.text) {
                        title += fragment;
                    }
                    return title.trim().substring(0, 50);
                }
            }
            
            // Fallback to simple extraction
            const title = firstMessage.substring(0, 40).replace(/\n/g, ' ').trim();
            return title.length === 40 ? title + '...' : title;
        } catch {
            const simple = firstMessage.substring(0, 40).replace(/\n/g, ' ').trim();
            return simple.length === 40 ? simple + '...' : simple;
        }
    }
}
