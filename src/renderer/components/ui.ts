
export function createButton(text: string, isSmall = false): HTMLElement {
  const btn = document.createElement('button');
  btn.innerText = text;
  btn.style.cssText = `
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    padding: ${isSmall ? '4px 8px' : '6px 12px'};
    border-radius: 2px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-size: ${isSmall ? '11px' : '13px'};
    display: inline-flex; align-items: center; gap: 4px;
    user-select: none;
  `;
  btn.onmouseover = () => {
    btn.style.background = 'var(--vscode-button-secondaryHoverBackground)';
  };
  btn.onmouseout = () => {
    btn.style.background = 'var(--vscode-button-secondaryBackground)';
  };
  return btn;
}

export function createTab(text: string, id: string, isActive: boolean, onClick: () => void): HTMLElement {
  const tab = document.createElement('div');
  tab.textContent = text;
  tab.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
      user-select: none;
      border-bottom: 2px solid ${isActive ? 'var(--vscode-focusBorder)' : 'transparent'};
      opacity: ${isActive ? '1' : '0.6'};
      transition: opacity 0.2s;
    `;
  tab.onclick = onClick;
  return tab;
}

// Re-export breadcrumb from dedicated module
export { createBreadcrumb, BreadcrumbSegment, BreadcrumbOptions } from './Breadcrumb';
