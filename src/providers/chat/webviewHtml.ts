/**
 * Webview HTML template for Chat View
 */
import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PostgreSQL Chat</title>
    <style>
        :root {
            --chat-spacing: 12px;
            --chat-radius: 12px;
            --chat-radius-sm: 6px;
            --transition-fast: 0.15s ease;
            --transition-normal: 0.25s ease;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: transparent;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Custom scrollbar */
        ::-webkit-scrollbar {
            width: 6px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        /* Main layout */
        .main-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            position: relative;
        }

        /* History Panel Overlay */
        .history-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 100;
            opacity: 0;
            visibility: hidden;
            transition: all var(--transition-normal);
        }

        .history-overlay.visible {
            opacity: 1;
            visibility: visible;
        }

        .history-panel {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 85%;
            max-width: 300px;
            background: var(--vscode-sideBar-background);
            border-right: 1px solid var(--vscode-widget-border);
            z-index: 101;
            display: flex;
            flex-direction: column;
            transform: translateX(-100%);
            transition: transform var(--transition-normal);
        }

        .history-overlay.visible .history-panel {
            transform: translateX(0);
        }

        .history-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }

        .history-header h3 {
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .history-close-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .history-close-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .history-search {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }

        .history-search input {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: var(--chat-radius-sm);
            font-size: 12px;
            outline: none;
        }

        .history-search input:focus {
            border-color: var(--vscode-focusBorder);
        }

        .history-search input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .history-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }

        .history-item {
            padding: 10px 12px;
            border-radius: var(--chat-radius-sm);
            cursor: pointer;
            margin-bottom: 4px;
            transition: all var(--transition-fast);
            position: relative;
        }

        .history-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .history-item.active {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .history-item-title {
            font-size: 12px;
            font-weight: 500;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding-right: 24px;
        }

        .history-item-meta {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .history-item-delete {
            position: absolute;
            top: 8px;
            right: 8px;
            background: transparent;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            opacity: 0;
            transition: all var(--transition-fast);
            z-index: 10;
        }

        .history-item-delete svg {
            pointer-events: none;
            display: block;
        }

        .history-item:hover .history-item-delete {
            opacity: 0.7;
        }

        .history-item-delete:hover {
            opacity: 1 !important;
            background: var(--vscode-toolbar-hoverBackground);
            color: var(--vscode-errorForeground);
        }

        .history-item-delete.confirm-delete {
            opacity: 1 !important;
            background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
            color: var(--vscode-errorForeground, #f48771);
            animation: pulse-delete 0.5s ease-in-out infinite alternate;
        }

        @keyframes pulse-delete {
            from { transform: scale(1); }
            to { transform: scale(1.1); }
        }

        .history-empty {
            text-align: center;
            padding: 24px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .chat-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            padding: var(--chat-spacing);
            gap: var(--chat-spacing);
        }

        .chat-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 0;
        }

        .chat-header-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .chat-header-right {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .header-btn {
            background: transparent;
            border: 1px solid transparent;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            padding: 4px 6px;
            border-radius: var(--chat-radius-sm);
            transition: all var(--transition-fast);
            opacity: 0.7;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .header-btn:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
        }

        .header-btn svg {
            width: 14px;
            height: 14px;
        }

        .chat-header h3 {
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .header-icon {
            font-size: 14px;
        }

        .clear-btn {
            background: transparent;
            border: 1px solid transparent;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: var(--chat-radius-sm);
            transition: all var(--transition-fast);
            opacity: 0.7;
        }

        .clear-btn:hover {
            opacity: 1;
            background-color: var(--vscode-toolbar-hoverBackground);
            border-color: var(--vscode-contrastBorder, transparent);
        }

        .messages-container {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 4px 0;
        }

        .message {
            display: flex;
            flex-direction: column;
            gap: 6px;
            animation: messageIn 0.3s ease;
        }

        @keyframes messageIn {
            from {
                opacity: 0;
                transform: translateY(8px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .message.user {
            align-items: flex-end;
        }

        .message.assistant {
            align-items: flex-start;
        }

        .message-bubble {
            padding: 10px 14px;
            border-radius: var(--chat-radius);
            max-width: 92%;
            word-wrap: break-word;
            line-height: 1.5;
        }

        .message.user .message-bubble {
            background: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
            border-bottom-right-radius: 4px;
        }

        .message.assistant .message-bubble {
            background-color: color-mix(in srgb, var(--vscode-editor-background) 50%, var(--vscode-sideBar-background) 50%);
            border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
            border-bottom-left-radius: 4px;
        }

        .message-role {
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: var(--vscode-descriptionForeground);
            padding: 0 4px;
        }

        .message-content {
            font-size: 13px;
            line-height: 1.6;
        }

        .message-content pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: var(--chat-radius-sm);
            overflow-x: auto;
            margin: 10px 0;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15));
        }

        .message-content code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }

        .message-content pre code {
            background: none;
            padding: 0;
            border-radius: 0;
        }

        /* Code block wrapper with copy button */
        .code-block-wrapper {
            position: relative;
            margin: 10px 0;
        }

        .code-block-wrapper pre {
            margin: 0;
            padding-top: 32px;
        }

        .code-block-header {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 12px;
            background: rgba(0, 0, 0, 0.15);
            border-radius: var(--chat-radius-sm) var(--chat-radius-sm) 0 0;
            border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15));
        }

        .code-language {
            font-size: 11px;
            font-weight: 500;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .copy-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            background: transparent;
            border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .copy-btn:hover {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-color: var(--vscode-button-secondaryBackground);
        }

        .copy-btn.copied {
            background: var(--vscode-charts-green, #4caf50);
            color: white;
            border-color: var(--vscode-charts-green, #4caf50);
        }

        .copy-btn svg {
            width: 12px;
            height: 12px;
        }

        /* SQL Syntax Highlighting */
        .sql-keyword {
            color: var(--vscode-symbolIcon-keywordForeground, #569cd6);
            font-weight: 600;
        }

        .sql-function {
            color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
        }

        .sql-string {
            color: var(--vscode-symbolIcon-stringForeground, #ce9178);
        }

        .sql-number {
            color: var(--vscode-symbolIcon-numberForeground, #b5cea8);
        }

        .sql-comment {
            color: var(--vscode-symbolIcon-commentForeground, #6a9955);
            font-style: italic;
        }

        .sql-operator {
            color: var(--vscode-symbolIcon-operatorForeground, #d4d4d4);
        }

        .sql-type {
            color: var(--vscode-symbolIcon-typeParameterForeground, #4ec9b0);
        }

        .sql-special {
            color: var(--vscode-symbolIcon-variableForeground, #9cdcfe);
        }

        .message-content p {
            margin: 8px 0;
        }

        .message-content p:first-child {
            margin-top: 0;
        }

        .message-content p:last-child {
            margin-bottom: 0;
        }

        .message-content ul, .message-content ol {
            margin: 8px 0;
            padding-left: 18px;
        }

        .message-content li {
            margin: 4px 0;
            line-height: 1.5;
        }

        .message-content li::marker {
            color: var(--vscode-descriptionForeground);
        }

        .message-content strong {
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .message-content h1, .message-content h2, .message-content h3 {
            margin: 14px 0 8px 0;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .message-content h1 { font-size: 1.25em; }
        .message-content h2 { font-size: 1.15em; }
        .message-content h3 { font-size: 1.05em; }

        .input-container {
            display: flex;
            align-items: flex-end;
            gap: 6px;
            padding: 10px 12px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
            border-radius: var(--chat-radius);
            transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }

        .input-container:focus-within {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        .chat-input {
            flex: 1;
            padding: 4px 0;
            border: none;
            background: transparent;
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            outline: none;
            resize: none;
            min-height: 20px;
            max-height: 120px;
            line-height: 1.5;
            overflow-y: auto;
            scrollbar-width: none;
            -ms-overflow-style: none;
        }

        .chat-input::-webkit-scrollbar {
            display: none;
        }

        .chat-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .chat-input:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .send-btn {
            flex-shrink: 0;
            width: 28px;
            height: 28px;
            padding: 0;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: var(--chat-radius-sm);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--transition-fast);
            opacity: 0.9;
        }

        .send-btn:hover:not(:disabled) {
            opacity: 1;
            background: var(--vscode-button-hoverBackground);
            transform: scale(1.05);
        }

        .send-btn:active:not(:disabled) {
            transform: scale(0.95);
        }

        .send-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .send-btn svg {
            width: 14px;
            height: 14px;
        }

        .attach-btn {
            flex-shrink: 0;
            width: 28px;
            height: 28px;
            padding: 0;
            background: rgba(128, 128, 128, 0.15);
            color: var(--vscode-descriptionForeground);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--transition-fast);
        }

        .attach-btn:hover:not(:disabled) {
            background: rgba(128, 128, 128, 0.25);
            color: var(--vscode-foreground);
        }

        .attach-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }

        .attach-btn svg {
            width: 16px;
            height: 16px;
        }

        .attachments-container {
            display: none;
            flex-wrap: wrap;
            gap: 6px;
            padding: 8px 12px;
            background-color: color-mix(in srgb, var(--vscode-input-background) 60%, transparent);
            border: 1px solid var(--vscode-input-border);
            border-bottom: none;
            border-radius: var(--chat-radius) var(--chat-radius) 0 0;
            margin-bottom: -1px;
        }

        .attachments-container.has-files {
            display: flex;
        }

        .attachment-chip {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px 4px 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 16px;
            font-size: 11px;
            animation: chipIn 0.2s ease;
        }

        @keyframes chipIn {
            from {
                opacity: 0;
                transform: scale(0.8);
            }
            to {
                opacity: 1;
                transform: scale(1);
            }
        }

        .attachment-chip .file-icon {
            font-size: 12px;
        }

        .attachment-chip .file-name {
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .attachment-chip .remove-btn {
            background: transparent;
            border: none;
            color: inherit;
            cursor: pointer;
            padding: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            opacity: 0.7;
            transition: all var(--transition-fast);
        }

        .attachment-chip .remove-btn:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.2);
        }

        .attachment-chip .remove-btn svg {
            width: 12px;
            height: 12px;
        }

        .empty-state-text {
            font-size: 12px;
            line-height: 1.6;
            max-width: 220px;
            opacity: 0.8;
        }

        .file-preview {
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15));
            border-radius: var(--chat-radius-sm);
            margin: 8px 0;
            overflow: hidden;
        }

        .file-preview-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            background: rgba(128, 128, 128, 0.1);
            font-size: 11px;
            font-weight: 500;
            color: var(--vscode-descriptionForeground);
        }

        .file-preview-content {
            padding: 8px 10px;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            max-height: 150px;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            flex: 1;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            padding: 24px 16px;
            gap: 12px;
        }

        .empty-state-icon {
            font-size: 36px;
            opacity: 0.6;
            filter: grayscale(0.3);
        }

        .empty-state-text {
            font-size: 12px;
            line-height: 1.6;
            max-width: 220px;
            opacity: 0.8;
        }

        .empty-state-hint {
            font-size: 10px;
            opacity: 0.5;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .suggestions {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 6px;
            margin-top: 8px;
        }

        .suggestion-btn {
            padding: 5px 10px;
            font-size: 11px;
            background: transparent;
            color: var(--vscode-textLink-foreground);
            border: 1px solid var(--vscode-textLink-foreground);
            border-radius: 20px;
            cursor: pointer;
            transition: all var(--transition-fast);
            opacity: 0.7;
        }

        .suggestion-btn:hover {
            opacity: 1;
            background: var(--vscode-textLink-foreground);
            color: var(--vscode-button-foreground);
            transform: translateY(-1px);
        }

        .typing-indicator {
            display: none;
            padding: 12px 16px;
            background-color: color-mix(in srgb, var(--vscode-editor-background) 50%, var(--vscode-sideBar-background) 50%);
            border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
            border-radius: var(--chat-radius);
            border-bottom-left-radius: 4px;
            width: fit-content;
            animation: messageIn 0.3s ease;
        }

        .typing-indicator.visible {
            display: block;
        }

        .typing-dots {
            display: flex;
            gap: 5px;
            align-items: center;
        }

        .typing-dots span {
            width: 6px;
            height: 6px;
            background-color: var(--vscode-descriptionForeground);
            border-radius: 50%;
            animation: pulse 1.4s infinite ease-in-out;
        }

        .typing-dots span:nth-child(1) { animation-delay: 0s; }
        .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.3s; }

        @keyframes pulse {
            0%, 80%, 100% { 
                opacity: 0.3;
                transform: scale(0.8);
            }
            40% { 
                opacity: 1;
                transform: scale(1);
            }
        }

        .loading-text {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            margin-top: 6px;
            animation: fadeInOut 0.3s ease;
        }

        @keyframes fadeInOut {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .typing-cursor {
            display: inline-block;
            width: 2px;
            height: 1em;
            background-color: var(--vscode-foreground);
            margin-left: 1px;
            animation: blink 0.8s infinite;
            vertical-align: text-bottom;
        }

        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }

        /* Focus styles for accessibility */
        .clear-btn:focus-visible,
        .suggestion-btn:focus-visible,
        .send-btn:focus-visible,
        .attach-btn:focus-visible,
        .header-btn:focus-visible {
            outline: 2px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }

        .input-wrapper {
            display: flex;
            flex-direction: column;
            position: relative;
        }

        .input-wrapper.has-attachments .input-container {
            border-top-left-radius: 0;
            border-top-right-radius: 0;
        }

        /* @ Mention styles */
        .mention-btn {
            flex-shrink: 0;
            width: 28px;
            height: 28px;
            padding: 0;
            background: rgba(128, 128, 128, 0.15);
            color: var(--vscode-descriptionForeground);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--transition-fast);
            font-weight: bold;
            font-size: 14px;
        }

        .mention-btn:hover:not(:disabled) {
            background: rgba(128, 128, 128, 0.25);
            color: var(--vscode-foreground);
        }
        }

        .mention-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }

        .mention-picker {
            position: absolute;
            bottom: 100%;
            left: 0;
            right: 0;
            max-height: 250px;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: var(--chat-radius);
            margin-bottom: 4px;
            display: none;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 1000;
        }

        .mention-picker.visible {
            display: flex;
        }

        .mention-picker-header {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .mention-picker-search {
            flex: 1;
            padding: 6px 10px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: var(--chat-radius-sm);
            font-size: 12px;
            outline: none;
        }

        .mention-picker-search:focus {
            border-color: var(--vscode-focusBorder);
        }

        .mention-picker-search::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        .mention-picker-list {
            flex: 1;
            overflow-y: auto;
            padding: 4px;
        }

        .mention-item {
            padding: 8px 10px;
            border-radius: var(--chat-radius-sm);
            cursor: pointer;
            display: flex;
            flex-direction: column;
            gap: 2px;
            transition: all var(--transition-fast);
        }

        .mention-item:hover, .mention-item.selected {
            background: var(--vscode-list-hoverBackground);
        }

        .mention-item-name {
            font-size: 12px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .mention-item-type {
            font-size: 9px;
            padding: 1px 5px;
            border-radius: 8px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            text-transform: uppercase;
        }

        .mention-item-breadcrumb {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .mention-picker-empty {
            padding: 16px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .mention-picker-loading {
            padding: 16px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        /* Mention chips in attachments area */
        .mention-chip {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px 4px 10px;
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: #ffffff;
            border-radius: 16px;
            font-size: 11px;
            font-weight: 500;
            animation: chipIn 0.2s ease;
            box-shadow: 0 1px 3px rgba(37, 99, 235, 0.3);
        }

        .mention-chip .mention-icon {
            font-size: 10px;
        }

        .mention-chip .mention-name {
            max-width: 100px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .mention-chip .remove-btn {
            background: transparent;
            border: none;
            color: inherit;
            cursor: pointer;
            padding: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            opacity: 0.7;
            transition: all var(--transition-fast);
        }

        .mention-chip .remove-btn:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.2);
        }

        .mention-chip .remove-btn svg {
            width: 12px;
            height: 12px;
        }

        /* Mentions container - shared with attachments */
        .attachments-container.has-mentions {
            display: flex;
        }

        /* Type icons for database objects */
        .db-type-icon {
            font-size: 11px;
        }

        /* Inline @mention highlight in messages */
        .mention-inline {
            background: var(--vscode-textLink-foreground);
            color: var(--vscode-button-foreground);
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 0.9em;
            font-weight: 500;
            white-space: nowrap;
        }

        /* Toast notifications */
        .toast {
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%) translateY(20px);
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 12px;
            max-width: 90%;
            z-index: 1000;
            opacity: 0;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .toast.visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        .toast-info {
            background: var(--vscode-notifications-background);
            color: var(--vscode-notifications-foreground);
            border: 1px solid var(--vscode-notifications-border);
        }

        .toast-warning {
            background: var(--vscode-inputValidation-warningBackground, #5a4a00);
            color: var(--vscode-inputValidation-warningForeground, #fff);
            border: 1px solid var(--vscode-inputValidation-warningBorder, #f0a800);
        }

        .toast-error {
            background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
            color: var(--vscode-inputValidation-errorForeground, #fff);
            border: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c);
        }
    </style>
</head>
<body data-vscode-theme-kind="">
    <script>
        // Detect VS Code theme kind
        (function() {
            const body = document.body;
            const observer = new MutationObserver(() => {
                const computedStyle = getComputedStyle(body);
                const bgColor = computedStyle.getPropertyValue('--vscode-editor-background');
                if (bgColor) {
                    // Parse the color to determine if it's light or dark
                    const rgb = bgColor.match(/\\d+/g);
                    if (rgb && rgb.length >= 3) {
                        const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
                        body.setAttribute('data-vscode-theme-kind', brightness > 128 ? 'vscode-light' : 'vscode-dark');
                    }
                }
            });
            observer.observe(body, { attributes: true, attributeFilter: ['class', 'style'] });
            // Initial detection
            setTimeout(() => {
                const computedStyle = getComputedStyle(body);
                const bgColor = computedStyle.getPropertyValue('--vscode-editor-background');
                if (bgColor) {
                    const rgb = bgColor.match(/\\d+/g);
                    if (rgb && rgb.length >= 3) {
                        const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
                        body.setAttribute('data-vscode-theme-kind', brightness > 128 ? 'vscode-light' : 'vscode-dark');
                    }
                }
            }, 100);
        })();
    </script>
    <div class="main-container">
        <!-- History Overlay -->
        <div class="history-overlay" id="historyOverlay" onclick="closeHistory(event)">
            <div class="history-panel" onclick="event.stopPropagation()">
                <div class="history-header">
                    <h3>📚 Chat History</h3>
                    <button class="history-close-btn" onclick="toggleHistory()" title="Close">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/>
                        </svg>
                    </button>
                </div>
                <div class="history-search">
                    <input type="text" id="historySearch" placeholder="🔍 Search chats..." oninput="filterHistory(this.value)">
                </div>
                <div class="history-list" id="historyList">
                    <div class="history-empty">No chat history yet</div>
                </div>
            </div>
        </div>

        <div class="chat-container">
            <div class="chat-header">
                <div class="chat-header-left">
                    <button class="header-btn" onclick="toggleHistory()" title="Chat History">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/>
                            <path d="M8 3.5a.5.5 0 0 1 .5.5v4H12a.5.5 0 0 1 0 1H8a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/>
                        </svg>
                    </button>
                    <h3><span class="header-icon">🐘</span> SQL Assistant</h3>
                </div>
                <div class="chat-header-right">
                    <button class="header-btn" onclick="newChat()" title="New Chat">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
                        </svg>
                    </button>
                    <button class="header-btn" onclick="clearChat()" title="Clear Current Chat">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <div class="messages-container" id="messagesContainer">
                <div class="empty-state" id="emptyState">
                    <div class="empty-state-icon">💬</div>
                    <div class="empty-state-text">
                        Ask questions about PostgreSQL<br />
                        Get help writing queries<br />
                        Generating performant SQL statements<br />
                        Explore database concepts
                    </div>
                    <div class="empty-state-hint">
                        <span>⚡</span> Powered by You & AI
                    </div>
                    <div class="suggestions">
                        <button class="suggestion-btn" onclick="sendSuggestion('How do I write a JOIN query?')">JOINs</button>
                        <button class="suggestion-btn" onclick="sendSuggestion('Explain CTEs in PostgreSQL')">CTEs</button>
                        <button class="suggestion-btn" onclick="sendSuggestion('How to optimize a slow query?')">Optimize</button>
                        <button class="suggestion-btn" onclick="sendSuggestion('What are window functions?')">Window Fn</button>
                    </div>
                </div>
                <div class="typing-indicator" id="typingIndicator">
                    <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <div class="loading-text" id="loadingText"></div>
            </div>
        </div>
        
        <div class="input-wrapper" id="inputWrapper">
            <div class="mention-picker" id="mentionPicker">
                <div class="mention-picker-header">
                    <span>🔗 Reference DB Object</span>
                </div>
                <input type="text" class="mention-picker-search" id="mentionSearch" placeholder="Search tables, views, functions..." oninput="searchMentions(this.value)">
                <div class="mention-picker-list" id="mentionList">
                    <div class="mention-picker-loading">Loading database objects...</div>
                </div>
            </div>
            <div class="attachments-container" id="attachmentsContainer"></div>
            <div class="input-container">
                <button class="attach-btn" id="attachBtn" onclick="attachFile()" title="Attach file (SQL, CSV, JSON, TXT)">
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11.5 2c1.4 0 2.5 1.1 2.5 2.5v6c0 2.5-2 4.5-4.5 4.5S5 13 5 10.5V4h1v6.5c0 1.9 1.6 3.5 3.5 3.5s3.5-1.6 3.5-3.5v-6c0-.8-.7-1.5-1.5-1.5S10 3.7 10 4.5v6c0 .3.2.5.5.5s.5-.2.5-.5V5h1v5.5c0 .8-.7 1.5-1.5 1.5S9 11.3 9 10.5v-6C9 3.1 10.1 2 11.5 2z"/>
                    </svg>
                </button>
                <button class="mention-btn" id="mentionBtn" onclick="toggleMentionPicker()" title="Reference a database object (@)">@</button>
                <textarea 
                    class="chat-input" 
                    id="chatInput" 
                    placeholder="Ask anything about PostgreSQL... (@ to reference tables)"
                    rows="1"
                    onkeydown="handleKeyDown(event)"
                    oninput="handleChatInput(event)"
                ></textarea>
                <button class="send-btn" id="sendBtn" onclick="sendMessage()" title="Send message">
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M1.5 1.5L14.5 8L1.5 14.5V9L10.5 8L1.5 7V1.5Z"/>
                    </svg>
                </button>
            </div>
        </div>
    </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesContainer = document.getElementById('messagesContainer');
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        const attachBtn = document.getElementById('attachBtn');
        const emptyState = document.getElementById('emptyState');
        const typingIndicator = document.getElementById('typingIndicator');
        const loadingText = document.getElementById('loadingText');
        const attachmentsContainer = document.getElementById('attachmentsContainer');
        const inputWrapper = document.getElementById('inputWrapper');
        const historyOverlay = document.getElementById('historyOverlay');
        const historyList = document.getElementById('historyList');
        const historySearch = document.getElementById('historySearch');
        const mentionPicker = document.getElementById('mentionPicker');
        const mentionSearch = document.getElementById('mentionSearch');
        const mentionList = document.getElementById('mentionList');
        const mentionBtn = document.getElementById('mentionBtn');

        let attachedFiles = [];
        let loadingInterval = null;
        let typingAnimation = null;
        let chatHistory = [];
        let dbObjects = [];
        let selectedMentions = [];
        let mentionPickerVisible = false;
        let selectedMentionIndex = -1;

        // History functions
        function toggleHistory() {
            historyOverlay.classList.toggle('visible');
            if (historyOverlay.classList.contains('visible')) {
                vscode.postMessage({ type: 'getHistory' });
                historySearch.focus();
            }
        }

        function closeHistory(event) {
            if (event.target === historyOverlay) {
                historyOverlay.classList.remove('visible');
            }
        }

        function loadSession(sessionId) {
            vscode.postMessage({ type: 'loadSession', sessionId });
            historyOverlay.classList.remove('visible');
        }

        let pendingDeleteId = null;
        
        function deleteSession(sessionId, event) {
            console.log('[WebView] deleteSession called with sessionId:', sessionId, 'event:', event);
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            
            // If already pending for this session, confirm delete
            if (pendingDeleteId === sessionId) {
                console.log('[WebView] Confirmed delete for:', sessionId);
                vscode.postMessage({ type: 'deleteSession', sessionId });
                pendingDeleteId = null;
                return;
            }
            
            // First click - show confirmation state
            console.log('[WebView] First click, setting pending delete for:', sessionId);
            if (pendingDeleteId) {
                // Reset any other pending delete
                const prevBtn = document.querySelector(\`[data-pending-delete="\${pendingDeleteId}"]\`);
                if (prevBtn) {
                    prevBtn.removeAttribute('data-pending-delete');
                    prevBtn.classList.remove('confirm-delete');
                }
            }
            
            pendingDeleteId = sessionId;
            const btn = event.currentTarget || event.target.closest('.history-item-delete');
            if (btn) {
                btn.setAttribute('data-pending-delete', sessionId);
                btn.classList.add('confirm-delete');
            }
            
            // Auto-reset after 3 seconds
            setTimeout(() => {
                if (pendingDeleteId === sessionId) {
                    pendingDeleteId = null;
                    if (btn) {
                        btn.removeAttribute('data-pending-delete');
                        btn.classList.remove('confirm-delete');
                    }
                }
            }, 3000);
        }

        function newChat() {
            vscode.postMessage({ type: 'newChat' });
        }

        function formatDate(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            if (days === 0) {
                return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (days === 1) {
                return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (days < 7) {
                return date.toLocaleDateString([], { weekday: 'short' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
                return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        }

        function renderHistory(sessions) {
            console.log('[WebView] renderHistory called with', sessions?.length, 'sessions');
            chatHistory = sessions;
            filterHistory(historySearch.value);
        }

        function filterHistory(query) {
            const filtered = query 
                ? chatHistory.filter(s => s.title.toLowerCase().includes(query.toLowerCase()))
                : chatHistory;
            
            if (filtered.length === 0) {
                historyList.innerHTML = '<div class="history-empty">' + (query ? 'No matching chats found' : 'No chat history yet') + '</div>';
                return;
            }

            historyList.innerHTML = filtered.map(session => \`
                <div class="history-item \${session.isActive ? 'active' : ''}" onclick="loadSession('\${session.id}')">
                    <div class="history-item-title">\${escapeHtml(session.title)}</div>
                    <div class="history-item-meta">
                        <span>📅 \${formatDate(session.updatedAt)}</span>
                        <span>💬 \${session.messageCount} messages</span>
                    </div>
                    <button class="history-item-delete" onclick="deleteSession('\${session.id}', event)" title="Delete chat">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                        </svg>
                    </button>
                </div>
            \`).join('');
        }

        // @ Mention functions
        function toggleMentionPicker() {
            console.log('[WebView] toggleMentionPicker called, current visible:', mentionPickerVisible);
            mentionPickerVisible = !mentionPickerVisible;
            if (mentionPickerVisible) {
                showMentionPicker();
            } else {
                hideMentionPicker();
            }
        }

        function showMentionPicker() {
            console.log('[WebView] showMentionPicker called');
            mentionPickerVisible = true;
            mentionPicker.classList.add('visible');
            mentionSearch.value = '';
            mentionSearch.focus();
            mentionList.innerHTML = '<div class="mention-picker-loading">Loading database objects...</div>';
            console.log('[WebView] Sending getDbObjects message');
            vscode.postMessage({ type: 'getDbObjects' });
        }

        function hideMentionPicker() {
            console.log('[WebView] hideMentionPicker called');
            mentionPickerVisible = false;
            mentionPicker.classList.remove('visible');
            selectedMentionIndex = -1;
        }

        function searchMentions(query) {
            console.log('[WebView] searchMentions:', query);
            vscode.postMessage({ type: 'searchDbObjects', query: query });
        }

        function getDbTypeIcon(type) {
            const icons = {
                'table': '📋',
                'view': '👁️',
                'function': '⚙️',
                'materialized-view': '📦',
                'type': '🔤',
                'schema': '📁'
            };
            return icons[type] || '📄';
        }

        function renderDbObjects(objects) {
            console.log('[WebView] renderDbObjects called with', objects.length, 'objects');
            dbObjects = objects;
            if (objects.length === 0) {
                mentionList.innerHTML = '<div class="mention-picker-empty">No database objects found. Connect to a database first.</div>';
                return;
            }

            selectedMentionIndex = -1;
            mentionList.innerHTML = objects.map((obj, idx) => \`
                <div class="mention-item" data-index="\${idx}" onclick="selectMention(\${idx})" onmouseenter="highlightMention(\${idx})">
                    <div class="mention-item-name">
                        <span class="db-type-icon">\${getDbTypeIcon(obj.type)}</span>
                        <span>\${escapeHtml(obj.name)}</span>
                        <span class="mention-item-type">\${obj.type}</span>
                    </div>
                    <div class="mention-item-breadcrumb">\${escapeHtml(obj.breadcrumb)}</div>
                </div>
            \`).join('');
        }

        function highlightMention(index) {
            const items = mentionList.querySelectorAll('.mention-item');
            items.forEach((item, i) => {
                item.classList.toggle('selected', i === index);
            });
            selectedMentionIndex = index;
        }

        function selectMention(index) {
            const obj = dbObjects[index];
            if (!obj) return;

            // Create mention object
            const mention = {
                name: obj.name,
                type: obj.type,
                schema: obj.schema,
                database: obj.database,
                connectionId: obj.connectionId,
                breadcrumb: obj.breadcrumb
            };

            // Check if already selected
            const exists = selectedMentions.find(m => 
                m.name === mention.name && 
                m.schema === mention.schema && 
                m.database === mention.database
            );

            if (!exists) {
                selectedMentions.push(mention);
                renderMentionChips();
                
                // Insert @mention in textarea
                const mentionText = '@' + obj.schema + '.' + obj.name;
                const cursorPos = chatInput.selectionStart;
                const textBefore = chatInput.value.substring(0, cursorPos);
                const textAfter = chatInput.value.substring(cursorPos);
                
                // Check if there's an incomplete @ mention to replace
                const atMatch = textBefore.match(/@[\\w.]*$/);
                if (atMatch) {
                    chatInput.value = textBefore.substring(0, textBefore.length - atMatch[0].length) + mentionText + ' ' + textAfter;
                } else {
                    chatInput.value = textBefore + mentionText + ' ' + textAfter;
                }
            }

            hideMentionPicker();
            chatInput.focus();
        }

        function removeMention(index) {
            selectedMentions.splice(index, 1);
            renderMentionChips();
        }

        function renderMentionChips() {
            // Include both files and mentions in the attachments container
            const hasContent = attachedFiles.length > 0 || selectedMentions.length > 0;
            
            if (!hasContent) {
                attachmentsContainer.classList.remove('has-files');
                attachmentsContainer.classList.remove('has-mentions');
                inputWrapper.classList.remove('has-attachments');
                renderAttachments(); // Just render file chips
                return;
            }

            attachmentsContainer.classList.add('has-files');
            if (selectedMentions.length > 0) {
                attachmentsContainer.classList.add('has-mentions');
            }
            inputWrapper.classList.add('has-attachments');

            // Render file chips first, then mention chips
            attachmentsContainer.innerHTML = '';
            
            attachedFiles.forEach((file, index) => {
                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                const icon = getFileIcon(file.type);
                chip.innerHTML = \`
                    <span class="file-icon">\${icon}</span>
                    <span class="file-name">\${file.name}</span>
                    <button class="remove-btn" onclick="removeAttachment(\${index})" title="Remove file">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/>
                        </svg>
                    </button>
                \`;
                attachmentsContainer.appendChild(chip);
            });

            selectedMentions.forEach((mention, index) => {
                const chip = document.createElement('div');
                chip.className = 'mention-chip';
                chip.innerHTML = \`
                    <span class="mention-icon">\${getDbTypeIcon(mention.type)}</span>
                    <span class="mention-name">@\${mention.schema}.\${mention.name}</span>
                    <button class="remove-btn" onclick="removeMention(\${index})" title="Remove reference">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/>
                        </svg>
                    </button>
                \`;
                attachmentsContainer.appendChild(chip);
            });
        }

        function handleChatInput(event) {
            const value = chatInput.value;
            const cursorPos = chatInput.selectionStart;
            const textUpToCursor = value.substring(0, cursorPos);
            
            // Check if user just typed @ or is in middle of @mention
            const atMatch = textUpToCursor.match(/@([\\w.]*)$/);
            
            if (atMatch) {
                if (!mentionPickerVisible) {
                    showMentionPicker();
                }
                // Search with the text after @
                if (atMatch[1]) {
                    searchMentions(atMatch[1]);
                }
            } else if (mentionPickerVisible && !event.inputType?.includes('delete')) {
                // Hide picker if @ context is lost (but not on delete)
                hideMentionPicker();
            }

            // Auto-resize textarea
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        }

        function handleMentionKeydown(event) {
            if (!mentionPickerVisible) return false;

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                selectedMentionIndex = Math.min(selectedMentionIndex + 1, dbObjects.length - 1);
                highlightMention(selectedMentionIndex);
                scrollMentionIntoView();
                return true;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                selectedMentionIndex = Math.max(selectedMentionIndex - 1, 0);
                highlightMention(selectedMentionIndex);
                scrollMentionIntoView();
                return true;
            }
            if (event.key === 'Enter' && selectedMentionIndex >= 0) {
                event.preventDefault();
                selectMention(selectedMentionIndex);
                return true;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                hideMentionPicker();
                return true;
            }
            if (event.key === 'Tab' && selectedMentionIndex >= 0) {
                event.preventDefault();
                selectMention(selectedMentionIndex);
                return true;
            }
            return false;
        }

        function scrollMentionIntoView() {
            const selected = mentionList.querySelector('.mention-item.selected');
            if (selected) {
                selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        function highlightMentionsInText(text) {
            // Escape HTML first, then highlight @mentions
            let html = escapeHtml(text);
            // Match @schema.name or @name patterns
            html = html.replace(/@([\\w]+(?:\\.[\\w]+)?)/g, '<span class="mention-inline">@$1</span>');
            return html;
        }

        // Quirky loading messages
        const quirkyMessages = [
            "🧠 Negotiating with the AI overlords…",
            "🐘 Teaching Postgres new tricks…",
            "💾 Convincing the bits to behave…",
            "🧙‍♂️ Refactoring reality… one spell at a time.",
            "🎮 Buffering your next plot twist…",
            "🍕 Bribing the database with carbs…",
            "🐞 Politely asking bugs to leave… again.",
            "🚨 Deploying controlled chaos…",
            "🤖 Beeping, booping, pretending to work…",
            "🌋 Melting slow queries in hot lava…",
            "🧵 Weaving multi-threaded dreams…",
            "🎯 Aiming for 0ms latency (manifesting hard).",
            "🧊 Freezing the race conditions…",
            "🛸 Abducting your data for analysis…",
            "🌈 Painting graphs with unicorn dust…",
            "🧩 Assembling answers without the manual…",
            "⚔️ Sparring with rogue JOIN statements…",
            "📡 Calling the mothership for wisdom…",
            "🌪️ Spinning up some fresh insights…",
            "🍩 Debugging powered by sugar and despair…"
        ];

        function startLoadingMessages() {
            let index = Math.floor(Math.random() * quirkyMessages.length);
            loadingText.textContent = quirkyMessages[index];
            
            loadingInterval = setInterval(() => {
                index = (index + 1) % quirkyMessages.length;
                loadingText.style.animation = 'none';
                loadingText.offsetHeight; // Trigger reflow
                loadingText.style.animation = 'fadeInOut 0.3s ease';
                loadingText.textContent = quirkyMessages[index];
            }, 2500);
        }

        function stopLoadingMessages() {
            if (loadingInterval) {
                clearInterval(loadingInterval);
                loadingInterval = null;
            }
            loadingText.textContent = '';
        }

        function attachFile() {
            vscode.postMessage({ type: 'pickFile' });
        }

        function removeAttachment(index) {
            attachedFiles.splice(index, 1);
            renderAttachments();
        }

        function renderAttachments() {
            attachmentsContainer.innerHTML = '';
            
            if (attachedFiles.length === 0) {
                attachmentsContainer.classList.remove('has-files');
                inputWrapper.classList.remove('has-attachments');
                return;
            }

            attachmentsContainer.classList.add('has-files');
            inputWrapper.classList.add('has-attachments');

            attachedFiles.forEach((file, index) => {
                const chip = document.createElement('div');
                chip.className = 'attachment-chip';
                
                const icon = getFileIcon(file.type);
                chip.innerHTML = \`
                    <span class="file-icon">\${icon}</span>
                    <span class="file-name">\${file.name}</span>
                    <button class="remove-btn" onclick="removeAttachment(\${index})" title="Remove file">
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z"/>
                        </svg>
                    </button>
                \`;
                
                attachmentsContainer.appendChild(chip);
            });
        }

        function getFileIcon(type) {
            const icons = {
                'sql': '📄',
                'json': '📋',
                'csv': '📊',
                'text': '📝'
            };
            return icons[type] || '📎';
        }

        function sendMessage() {
            const message = chatInput.value.trim();
            if (!message && attachedFiles.length === 0 && selectedMentions.length === 0) return;

            vscode.postMessage({
                type: 'sendMessage',
                message: message || (selectedMentions.length > 0 ? 'Please analyze the referenced database objects' : 'Please analyze the attached file(s)'),
                attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
                mentions: selectedMentions.length > 0 ? [...selectedMentions] : undefined
            });

            chatInput.value = '';
            chatInput.style.height = 'auto';
            chatInput.disabled = true;
            sendBtn.disabled = true;
            attachBtn.disabled = true;
            mentionBtn.disabled = true;
            
            // Clear attachments and mentions after sending
            attachedFiles = [];
            selectedMentions = [];
            renderMentionChips();
        }

        function sendSuggestion(text) {
            chatInput.value = text;
            sendMessage();
        }

        function clearChat() {
            vscode.postMessage({
                type: 'clearChat'
            });
        }

        function handleKeyDown(event) {
            // Check mention picker navigation first
            if (handleMentionKeydown(event)) {
                return;
            }
            
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        }

        // Auto-resize textarea
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        // Escape HTML for safe display
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Copy code to clipboard
        function copyCode(button, codeId) {
            const codeElement = document.getElementById(codeId);
            if (!codeElement) return;
            
            // Use data-raw attribute if available (preserves original code without HTML)
            // Otherwise fall back to textContent
            let code = codeElement.getAttribute('data-raw');
            if (code) {
                // Decode HTML entities that were escaped
                code = code.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            } else {
                code = codeElement.textContent || '';
            }
            
            navigator.clipboard.writeText(code).then(() => {
                button.classList.add('copied');
                button.innerHTML = \`
                    <svg viewBox="0 0 16 16" fill="currentColor">
                        <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                    </svg>
                    Copied!
                \`;
                setTimeout(() => {
                    button.classList.remove('copied');
                    button.innerHTML = \`
                        <svg viewBox="0 0 16 16" fill="currentColor">
                            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/>
                            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/>
                        </svg>
                        Copy
                    \`;
                }, 2000);
            });
        }

        // SQL Syntax Highlighter - simplified and robust version
        function highlightSql(code) {
            // Token-based approach: split code into tokens and classify each
            const tokens = [];
            let remaining = code;
            
            while (remaining.length > 0) {
                let matched = false;
                
                // Comments: -- single line
                let match = remaining.match(/^(--[^\\n]*)/);
                if (match) {
                    tokens.push({ type: 'comment', text: match[1] });
                    remaining = remaining.slice(match[1].length);
                    matched = true;
                    continue;
                }
                
                // Comments: /* multi-line */
                match = remaining.match(/^(\\/\\*[\\s\\S]*?\\*\\/)/);
                if (match) {
                    tokens.push({ type: 'comment', text: match[1] });
                    remaining = remaining.slice(match[1].length);
                    matched = true;
                    continue;
                }
                
                // Strings: 'single quoted' (handles escaped quotes)
                match = remaining.match(/^('(?:[^'\\\\]|\\\\.)*')/);
                if (match) {
                    tokens.push({ type: 'string', text: match[1] });
                    remaining = remaining.slice(match[1].length);
                    matched = true;
                    continue;
                }
                
                // Numbers (integers and decimals)
                match = remaining.match(/^(\\d+\\.?\\d*)/);
                if (match) {
                    tokens.push({ type: 'number', text: match[1] });
                    remaining = remaining.slice(match[1].length);
                    matched = true;
                    continue;
                }
                
                // Words (identifiers, keywords, functions)
                match = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
                if (match) {
                    const word = match[1];
                    const upperWord = word.toUpperCase();
                    
                    // Check if it's a function (followed by parenthesis)
                    const afterWord = remaining.slice(word.length);
                    const isFunction = /^\\s*\\(/.test(afterWord);
                    
                    const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TABLE', 'INDEX', 'VIEW', 'DATABASE', 'SCHEMA', 'TRIGGER', 'FUNCTION', 'PROCEDURE', 'RETURNS', 'RETURN', 'BEGIN', 'END', 'IF', 'THEN', 'ELSE', 'ELSIF', 'CASE', 'WHEN', 'LOOP', 'WHILE', 'FOR', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AS', 'ASC', 'DESC', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'SIMILAR', 'TO', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'UNIQUE', 'CHECK', 'DEFAULT', 'CASCADE', 'RESTRICT', 'WITH', 'RECURSIVE', 'LATERAL', 'GRANT', 'REVOKE', 'TRUNCATE', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'SAVEPOINT', 'DECLARE', 'CURSOR', 'FETCH', 'CLOSE', 'EXECUTE', 'PREPARE', 'EXPLAIN', 'ANALYZE', 'VACUUM', 'COPY', 'RAISE', 'EXCEPTION', 'NOTICE', 'COALESCE', 'NULLIF', 'GREATEST', 'LEAST', 'TRUE', 'FALSE', 'OVER', 'PARTITION'];
                    
                    const builtinFunctions = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ARRAY_AGG', 'STRING_AGG', 'CONCAT', 'SUBSTRING', 'TRIM', 'UPPER', 'LOWER', 'LENGTH', 'REPLACE', 'SPLIT_PART', 'REGEXP_REPLACE', 'REGEXP_MATCHES', 'POSITION', 'NOW', 'CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME', 'DATE_TRUNC', 'DATE_PART', 'EXTRACT', 'AGE', 'INTERVAL', 'TO_CHAR', 'TO_DATE', 'TO_TIMESTAMP', 'TO_NUMBER', 'CAST', 'CONVERT', 'ROUND', 'FLOOR', 'CEIL', 'ABS', 'MOD', 'POWER', 'SQRT', 'RANDOM', 'GENERATE_SERIES', 'UNNEST', 'JSON_BUILD_OBJECT', 'JSON_AGG', 'JSONB_SET', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'NULLIF', 'COALESCE'];
                    
                    const types = ['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL', 'NUMERIC', 'DECIMAL', 'REAL', 'DOUBLE', 'PRECISION', 'FLOAT', 'VARCHAR', 'CHAR', 'TEXT', 'BYTEA', 'BOOLEAN', 'BOOL', 'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'UUID', 'JSON', 'JSONB', 'XML', 'MONEY', 'INET'];
                    
                    if (isFunction && builtinFunctions.includes(upperWord)) {
                        tokens.push({ type: 'function', text: word });
                    } else if (keywords.includes(upperWord)) {
                        tokens.push({ type: 'keyword', text: word });
                    } else if (types.includes(upperWord)) {
                        tokens.push({ type: 'type', text: word });
                    } else {
                        tokens.push({ type: 'text', text: word });
                    }
                    remaining = remaining.slice(word.length);
                    matched = true;
                    continue;
                }
                
                // Type cast ::
                match = remaining.match(/^(::[a-zA-Z_][a-zA-Z0-9_]*)/);
                if (match) {
                    tokens.push({ type: 'special', text: match[1] });
                    remaining = remaining.slice(match[1].length);
                    matched = true;
                    continue;
                }
                
                // Parameter $1, $2, etc
                match = remaining.match(/^(\\$\\d+)/);
                if (match) {
                    tokens.push({ type: 'special', text: match[1] });
                    remaining = remaining.slice(match[1].length);
                    matched = true;
                    continue;
                }
                
                // Any other character (operators, whitespace, etc)
                if (!matched) {
                    tokens.push({ type: 'text', text: remaining[0] });
                    remaining = remaining.slice(1);
                }
            }
            
            // Build result
            return tokens.map(token => {
                switch (token.type) {
                    case 'keyword': return '<span class="sql-keyword">' + token.text + '</span>';
                    case 'function': return '<span class="sql-function">' + token.text + '</span>';
                    case 'string': return '<span class="sql-string">' + token.text + '</span>';
                    case 'number': return '<span class="sql-number">' + token.text + '</span>';
                    case 'comment': return '<span class="sql-comment">' + token.text + '</span>';
                    case 'type': return '<span class="sql-type">' + token.text + '</span>';
                    case 'special': return '<span class="sql-special">' + token.text + '</span>';
                    default: return token.text;
                }
            }).join('');
        }

        // Counter for unique code block IDs
        let codeBlockCounter = 0;

        // Simple markdown parser
        function parseMarkdown(text) {
            // First, extract code blocks to protect them from HTML escaping
            const codeBlocks = [];
            let processedText = text.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, (match, lang, code) => {
                const placeholder = '___CODE_BLOCK_' + codeBlocks.length + '___';
                codeBlocks.push({ lang, code });
                return placeholder;
            });
            
            // Escape HTML in the non-code parts
            let html = processedText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

            // Restore code blocks with syntax highlighting
            codeBlocks.forEach((block, index) => {
                const placeholder = '___CODE_BLOCK_' + index + '___';
                const codeId = 'code-block-' + (++codeBlockCounter);
                const language = block.lang || 'code';
                const displayLang = language.toUpperCase();
                
                // Escape HTML in code first
                let escapedCode = block.code
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
                
                // Apply SQL syntax highlighting if language is sql, pgsql, or postgresql
                let highlightedCode = escapedCode;
                if (['sql', 'pgsql', 'postgresql', 'plpgsql'].includes(language.toLowerCase())) {
                    highlightedCode = highlightSql(escapedCode);
                }
                
                const codeBlockHtml = \`<div class="code-block-wrapper">
                    <div class="code-block-header">
                        <span class="code-language">\${displayLang}</span>
                        <button class="copy-btn" onclick="copyCode(this, '\${codeId}')">
                            <svg viewBox="0 0 16 16" fill="currentColor">
                                <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/>
                                <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/>
                            </svg>
                            Copy
                        </button>
                    </div>
                    <pre><code id="\${codeId}" class="language-\${language}" data-raw="\${block.code.replace(/"/g, '&quot;')}">\${highlightedCode}</code></pre>
                </div>\`;
                
                html = html.replace(placeholder, codeBlockHtml);
            });
            
            // Inline code
            html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
            
            // Bold - must have ** on both sides with content between
            html = html.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
            
            // Italic - only match *text* when surrounded by whitespace/punctuation
            // This prevents SQL * from being converted to <em>
            // Using simpler pattern: space or start, then *content*, then space or end
            html = html.replace(/(^|\\s)\\*([^*\\s][^*]*[^*\\s])\\*(\\s|[.,;:!?]|$)/gm, '$1<em>$2</em>$3');
            
            // Headers
            html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
            html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
            html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
            
            // Lists
            html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\\/li>\\n?)+/g, '<ul>$&</ul>');
            
            // Numbered lists
            html = html.replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>');
            
            // Line breaks (double newline = paragraph)
            html = html.replace(/\\n\\n/g, '</p><p>');
            html = '<p>' + html + '</p>';
            
            // Clean up empty paragraphs
            html = html.replace(/<p><\\/p>/g, '');
            html = html.replace(/<p>(<h[123]>)/g, '$1');
            html = html.replace(/(<\\/h[123]>)<\\/p>/g, '$1');
            html = html.replace(/<p>(<div class="code-block-wrapper">)/g, '$1');
            html = html.replace(/(<\\/div>)<\\/p>/g, '$1');
            html = html.replace(/<p>(<pre>)/g, '$1');
            html = html.replace(/(<\\/pre>)<\\/p>/g, '$1');
            html = html.replace(/<p>(<ul>)/g, '$1');
            html = html.replace(/(<\\/ul>)<\\/p>/g, '$1');

            return html;
        }

        // Typing effect for assistant messages
        function typeText(element, text, callback) {
            if (typingAnimation) {
                clearInterval(typingAnimation);
            }
            
            const parsedHtml = parseMarkdown(text);
            let charIndex = 0;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = parsedHtml;
            const plainText = tempDiv.textContent || '';
            
            // For complex HTML, just set it with a quick fade effect
            if (text.includes('\`\`\`') || text.includes('**') || text.length > 1000) {
                element.style.opacity = '0';
                element.innerHTML = parsedHtml;
                element.style.transition = 'opacity 0.3s ease';
                requestAnimationFrame(() => {
                    element.style.opacity = '1';
                });
                if (callback) setTimeout(callback, 300);
                return;
            }
            
            // Simple typing effect for shorter, simpler messages
            const cursor = document.createElement('span');
            cursor.className = 'typing-cursor';
            element.innerHTML = '';
            element.appendChild(cursor);
            
            const speed = Math.max(5, Math.min(20, 1000 / plainText.length)); // Adaptive speed
            
            typingAnimation = setInterval(() => {
                if (charIndex < plainText.length) {
                    cursor.before(plainText[charIndex]);
                    charIndex++;
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                } else {
                    clearInterval(typingAnimation);
                    typingAnimation = null;
                    cursor.remove();
                    // Now apply full formatting
                    element.innerHTML = parsedHtml;
                    if (callback) callback();
                }
            }, speed);
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'updateMessages':
                    stopLoadingMessages();
                    renderMessages(message.messages, true);
                    chatInput.disabled = false;
                    sendBtn.disabled = false;
                    attachBtn.disabled = false;
                    mentionBtn.disabled = false;
                    chatInput.focus();
                    break;
                case 'setTyping':
                    if (message.isTyping) {
                        typingIndicator.classList.add('visible');
                        startLoadingMessages();
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    } else {
                        typingIndicator.classList.remove('visible');
                        stopLoadingMessages();
                    }
                    break;
                case 'fileAttached':
                    attachedFiles.push(message.file);
                    renderAttachments();
                    break;
                case 'updateHistory':
                    renderHistory(message.sessions);
                    break;
                case 'dbObjectsResult':
                    console.log('[WebView] Received dbObjectsResult:', message.objects?.length || 0, 'objects');
                    if (message.error) {
                        mentionList.innerHTML = '<div class="mention-picker-empty">' + escapeHtml(message.error) + '</div>';
                    } else {
                        renderDbObjects(message.objects);
                    }
                    break;
                case 'schemaError':
                    // Show a toast notification about schema fetch error
                    showToast('⚠️ Could not fetch schema for ' + message.object + ': ' + message.error, 'warning');
                    break;
            }
        });

        // Toast notification function
        function showToast(text, type = 'info') {
            const toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            toast.textContent = text;
            document.body.appendChild(toast);
            
            // Trigger animation
            requestAnimationFrame(() => {
                toast.classList.add('visible');
            });
            
            // Auto-remove after 5 seconds
            setTimeout(() => {
                toast.classList.remove('visible');
                setTimeout(() => toast.remove(), 300);
            }, 5000);
        }

        let lastMessageCount = 0;

        function renderMessages(messages, animate = false) {
            if (messages.length === 0) {
                emptyState.style.display = 'flex';
                const messageElements = messagesContainer.querySelectorAll('.message');
                messageElements.forEach(el => el.remove());
                lastMessageCount = 0;
                return;
            }

            emptyState.style.display = 'none';
            
            // Check if this is a new assistant message (for typing effect)
            const isNewAssistantMessage = animate && 
                messages.length > lastMessageCount && 
                messages[messages.length - 1].role === 'assistant';
            
            lastMessageCount = messages.length;
            
            // Clear existing messages (but keep typing indicator)
            const messageElements = messagesContainer.querySelectorAll('.message');
            messageElements.forEach(el => el.remove());

            // Render new messages (insert before typing indicator)
            messages.forEach((msg, idx) => {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + msg.role;
                
                const roleDiv = document.createElement('div');
                roleDiv.className = 'message-role';
                roleDiv.textContent = msg.role === 'user' ? 'You' : 'Assistant';
                
                const bubbleDiv = document.createElement('div');
                bubbleDiv.className = 'message-bubble';
                
                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                
                // Render attachments for user messages
                if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
                    msg.attachments.forEach(att => {
                        const filePreview = document.createElement('div');
                        filePreview.className = 'file-preview';
                        filePreview.innerHTML = \`
                            <div class="file-preview-header">
                                <span>\${getFileIcon(att.type)}</span>
                                <span>\${att.name}</span>
                            </div>
                            <div class="file-preview-content">\${escapeHtml(att.content.substring(0, 500))}\${att.content.length > 500 ? '...' : ''}</div>
                        \`;
                        contentDiv.appendChild(filePreview);
                    });
                    
                    // Add the text message after attachments if exists
                    const textWithoutAttachments = msg.content.split('\\n\\n📎')[0].trim();
                    if (textWithoutAttachments && textWithoutAttachments !== 'Please analyze the attached file(s)') {
                        const textP = document.createElement('p');
                        textP.innerHTML = highlightMentionsInText(textWithoutAttachments);
                        contentDiv.appendChild(textP);
                    }
                } else if (msg.role === 'user') {
                    // User message without attachments - highlight any @mentions
                    const text = msg.content.split('\\n\\n📎')[0].trim();
                    if (text && text !== 'Please analyze the referenced database objects' && text !== 'Please analyze the attached file(s)') {
                        contentDiv.innerHTML = highlightMentionsInText(text);
                    } else {
                        contentDiv.textContent = msg.content;
                    }
                } else if (msg.role === 'assistant') {
                    // Apply typing effect for the newest assistant message
                    const isLastMessage = idx === messages.length - 1;
                    if (isNewAssistantMessage && isLastMessage) {
                        // Will be typed out
                        bubbleDiv.appendChild(contentDiv);
                        messageDiv.appendChild(roleDiv);
                        messageDiv.appendChild(bubbleDiv);
                        messagesContainer.insertBefore(messageDiv, typingIndicator);
                        typeText(contentDiv, msg.content);
                        return; // Skip the normal append below
                    } else {
                        contentDiv.innerHTML = parseMarkdown(msg.content);
                    }
                } else {
                    contentDiv.textContent = msg.content;
                }
                
                bubbleDiv.appendChild(contentDiv);
                messageDiv.appendChild(roleDiv);
                messageDiv.appendChild(bubbleDiv);
                messagesContainer.insertBefore(messageDiv, typingIndicator);
            });

            // Scroll to bottom smoothly
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    </script>
</body>
</html>`;
}
