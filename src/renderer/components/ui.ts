/**
 * Creates a styled button element
 */
export const createButton = (text: string, primary: boolean = false): HTMLButtonElement => {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.background = primary ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)';
  btn.style.color = primary ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)';
  btn.style.border = 'none';
  btn.style.padding = '4px 12px';
  btn.style.cursor = 'pointer';
  btn.style.borderRadius = '2px';
  btn.style.fontSize = '12px';
  btn.style.fontWeight = '500';
  return btn;
};

/**
 * Creates a styled tab button
 */
export const createTab = (label: string, id: string, isActive: boolean, onClick: () => void): HTMLButtonElement => {
  const tab = document.createElement('button');
  tab.textContent = label;
  tab.dataset.tabId = id;
  tab.style.cssText = `
        padding: 8px 16px;
        border: none;
        background: ${isActive ? 'var(--vscode-tab-activeBackground)' : 'transparent'};
        color: ${isActive ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)'};
        border-bottom: ${isActive ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent'};
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.15s;
    `;
  tab.addEventListener('click', onClick);
  return tab;
};
