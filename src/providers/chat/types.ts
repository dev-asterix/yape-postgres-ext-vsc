/**
 * Type definitions for the Chat View
 */

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: FileAttachment[];
    mentions?: DbMention[];
}

export interface FileAttachment {
    name: string;
    content: string;
    type: string;
}

export interface DbMention {
    name: string;
    type: DbObjectType;
    schema: string;
    database: string;
    connectionId: string;
    breadcrumb: string;
    schemaInfo?: string;
}

export type DbObjectType = 'table' | 'view' | 'function' | 'materialized-view' | 'type' | 'schema';

export interface DbObject {
    name: string;
    type: DbObjectType;
    schema: string;
    database: string;
    connectionId: string;
    connectionName: string;
    breadcrumb: string;
    details?: string;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

export interface ChatSessionSummary {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    isActive: boolean;
}
