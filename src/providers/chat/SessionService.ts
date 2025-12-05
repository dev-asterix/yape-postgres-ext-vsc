/**
 * Session storage service for chat history
 */
import * as vscode from 'vscode';
import { ChatSession, ChatSessionSummary, ChatMessage } from './types';

export class SessionService {
    private _context: vscode.ExtensionContext;
    private _currentSessionId: string | null = null;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    getChatSessions(): ChatSession[] {
        return this._context.globalState.get<ChatSession[]>('chatSessions', []);
    }

    async saveChatSessions(sessions: ChatSession[]): Promise<void> {
        await this._context.globalState.update('chatSessions', sessions);
    }

    generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getCurrentSessionId(): string | null {
        return this._currentSessionId;
    }

    setCurrentSessionId(id: string | null): void {
        this._currentSessionId = id;
    }

    async saveSession(messages: ChatMessage[], generateTitle: (msg: string) => Promise<string>): Promise<void> {
        if (messages.length === 0) return;

        const sessions = this.getChatSessions();
        const now = Date.now();

        if (this._currentSessionId) {
            const index = sessions.findIndex(s => s.id === this._currentSessionId);
            if (index !== -1) {
                sessions[index].messages = [...messages];
                sessions[index].updatedAt = now;
            }
        } else {
            this._currentSessionId = this.generateSessionId();
            const firstUserMessage = messages.find(m => m.role === 'user')?.content || 'New Chat';
            const title = await generateTitle(firstUserMessage);
            
            sessions.unshift({
                id: this._currentSessionId,
                title,
                messages: [...messages],
                createdAt: now,
                updatedAt: now
            });
        }

        // Keep only last 50 sessions
        const trimmedSessions = sessions.slice(0, 50);
        await this.saveChatSessions(trimmedSessions);
    }

    loadSession(sessionId: string): ChatMessage[] | null {
        const sessions = this.getChatSessions();
        const session = sessions.find(s => s.id === sessionId);
        
        if (session) {
            this._currentSessionId = session.id;
            return [...session.messages];
        }
        return null;
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        const sessions = this.getChatSessions();
        const filtered = sessions.filter(s => s.id !== sessionId);
        await this.saveChatSessions(filtered);
        
        const wasCurrentSession = this._currentSessionId === sessionId;
        if (wasCurrentSession) {
            this._currentSessionId = null;
        }
        
        return wasCurrentSession;
    }

    getSessionSummaries(): ChatSessionSummary[] {
        const sessions = this.getChatSessions();
        return sessions.map(s => ({
            id: s.id,
            title: s.title,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            messageCount: s.messages.length,
            isActive: s.id === this._currentSessionId
        }));
    }

    clearCurrentSession(): void {
        this._currentSessionId = null;
    }
}
