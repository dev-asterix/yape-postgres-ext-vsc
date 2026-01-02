/**
 * Breadcrumb navigation component for query results.
 * Displays: Connection ▸ Database ▸ Schema ▸ Object
 */

export interface BreadcrumbSegment {
  label: string;
  id: string;
  type: 'connection' | 'database' | 'schema' | 'object';
  onClick?: () => void;
  isLast?: boolean;
}

export interface BreadcrumbOptions {
  onConnectionDropdown?: (anchorEl: HTMLElement) => void;
  onDatabaseDropdown?: (anchorEl: HTMLElement) => void;
}

const BREADCRUMB_ICONS: Record<string, string> = {
  connection: '🗄️',
  database: '🗃️',
  schema: '📁',
  object: '📋'
};

/**
 * Creates a breadcrumb navigation element with clickable segments.
 */
export function createBreadcrumb(
  segments: BreadcrumbSegment[],
  options?: BreadcrumbOptions
): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-widget-border);
    flex-wrap: wrap;
  `;

  segments.forEach((segment, index) => {
    const segmentEl = createSegmentElement(segment, options);
    container.appendChild(segmentEl);

    // Chevron separator (except after last)
    if (index < segments.length - 1) {
      container.appendChild(createChevron());
    }
  });

  return container;
}

function createSegmentElement(
  segment: BreadcrumbSegment,
  options?: BreadcrumbOptions
): HTMLElement {
  const el = document.createElement('span');
  el.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: ${segment.isLast ? 'default' : 'pointer'};
    opacity: ${segment.isLast ? '0.7' : '1'};
    transition: background 0.15s;
    max-width: 150px;
    white-space: nowrap;
  `;

  // Icon
  const icon = document.createElement('span');
  icon.textContent = BREADCRUMB_ICONS[segment.type] || '';
  icon.style.fontSize = '11px';
  el.appendChild(icon);

  // Label with truncation
  const label = document.createElement('span');
  label.textContent = segment.label;
  label.style.cssText = `
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;
  el.appendChild(label);

  // Dropdown indicator for connection and database
  if (hasDropdown(segment.type, options)) {
    const dropdown = document.createElement('span');
    dropdown.textContent = '▾';
    dropdown.style.cssText = 'font-size: 10px; opacity: 0.6; margin-left: 2px;';
    el.appendChild(dropdown);
  }

  // Tooltip
  el.title = segment.label;

  // Hover effect (non-last segments)
  if (!segment.isLast) {
    el.onmouseover = () => { el.style.background = 'var(--vscode-list-hoverBackground)'; };
    el.onmouseout = () => { el.style.background = 'transparent'; };
  }

  // Click handler
  el.onclick = (e) => {
    e.stopPropagation();
    handleSegmentClick(segment, el, options);
  };

  return el;
}

function hasDropdown(type: string, options?: BreadcrumbOptions): boolean {
  return (type === 'connection' && !!options?.onConnectionDropdown) ||
    (type === 'database' && !!options?.onDatabaseDropdown);
}

function handleSegmentClick(
  segment: BreadcrumbSegment,
  el: HTMLElement,
  options?: BreadcrumbOptions
): void {
  if (segment.type === 'connection' && options?.onConnectionDropdown) {
    options.onConnectionDropdown(el);
  } else if (segment.type === 'database' && options?.onDatabaseDropdown) {
    options.onDatabaseDropdown(el);
  } else if (segment.onClick) {
    segment.onClick();
  }
}

function createChevron(): HTMLElement {
  const chevron = document.createElement('span');
  chevron.textContent = '▸';
  chevron.style.cssText = 'opacity: 0.4; font-size: 10px;';
  return chevron;
}
