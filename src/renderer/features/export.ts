import { createButton } from '../components/ui';

export const createExportButton = (columns: string[], rows: any[], tableInfo: any | undefined) => {
  const exportBtn = createButton('Export ▼', true);
  exportBtn.style.position = 'relative';

  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    // Remove existing dropdown if any
    const existing = document.querySelector('.export-dropdown');
    if (existing) {
      existing.remove();
      return;
    }

    const menu = document.createElement('div');
    menu.className = 'export-dropdown';
    menu.style.position = 'absolute';
    menu.style.top = '100%';
    menu.style.left = '0';
    menu.style.background = 'var(--vscode-menu-background)';
    menu.style.border = '1px solid var(--vscode-menu-border)';
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    menu.style.zIndex = '100';
    menu.style.minWidth = '150px';
    menu.style.borderRadius = '3px';
    menu.style.padding = '4px 0';

    const createMenuItem = (label: string, onClick: () => void) => {
      const item = document.createElement('div');
      item.textContent = label;
      item.style.padding = '6px 12px';
      item.style.cursor = 'pointer';
      item.style.color = 'var(--vscode-menu-foreground)';
      item.style.fontSize = '12px';

      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--vscode-menu-selectionBackground)';
        item.style.color = 'var(--vscode-menu-selectionForeground)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
        item.style.color = 'var(--vscode-menu-foreground)';
      });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
        menu.remove();
      });
      return item;
    };

    const downloadFile = (content: string, filename: string, type: string) => {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const stringifyValue = (val: any): string => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    };

    const getCSV = () => {
      const header = columns.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(',');
      const body = rows.map(row => {
        return columns.map((col: string) => {
          const val = row[col];
          const str = stringifyValue(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',');
      }).join('\n');
      return `${header}\n${body}`;
    };

    const getMarkdown = () => {
      const header = `| ${columns.join(' | ')} |`;
      const separator = `| ${columns.map(() => '---').join(' | ')} |`;
      const body = rows.map(row => {
        return `| ${columns.map((col: string) => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        }).join(' | ')} |`;
      }).join('\n');
      return `${header}\n${separator}\n${body}`;
    };

    const getSQLInsert = () => {
      if (!tableInfo) return '-- Table information not available for INSERT script';
      const tableName = `"${tableInfo.schema}"."${tableInfo.table}"`;
      const cols = columns.map((c: string) => `"${c}"`).join(', ');

      return rows.map((row: any) => {
        const values = columns.map((col: string) => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return val;
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return `'${str.replace(/'/g, "''")}'`;
        }).join(', ');
        return `INSERT INTO ${tableName} (${cols}) VALUES (${values});`;
      }).join('\n');
    };

    const getExcel = () => {
      // Simple HTML-based Excel format
      const header = columns.map((c: string) => `<th>${c}</th>`).join('');
      const body = rows.map(row => {
        const cells = columns.map((col: string) => {
          const val = row[col];
          return `<td>${stringifyValue(val)}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      return `
              <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
              <head>
                  <!--[if gte mso 9]>
                  <xml>
                      <x:ExcelWorkbook>
                          <x:ExcelWorksheets>
                              <x:ExcelWorksheet>
                                  <x:Name>Sheet1</x:Name>
                                  <x:WorksheetOptions>
                                      <x:DisplayGridlines/>
                                  </x:WorksheetOptions>
                              </x:ExcelWorksheet>
                          </x:ExcelWorksheets>
                      </x:ExcelWorkbook>
                  </xml>
                  <![endif]-->
              </head>
              <body>
                  <table>
                      <thead><tr>${header}</tr></thead>
                      <tbody>${body}</tbody>
                  </table>
              </body>
              </html>
          `;
    };

    menu.appendChild(createMenuItem('Save as CSV', () => {
      downloadFile(getCSV(), `export_${Date.now()}.csv`, 'text/csv');
    }));

    menu.appendChild(createMenuItem('Save as Excel', () => {
      downloadFile(getExcel(), `export_${Date.now()}.xls`, 'application/vnd.ms-excel');
    }));

    menu.appendChild(createMenuItem('Save as JSON', () => {
      const jsonStr = JSON.stringify(rows, null, 2);
      downloadFile(jsonStr, `export_${Date.now()}.json`, 'application/json');
    }));

    menu.appendChild(createMenuItem('Save as Markdown', () => {
      downloadFile(getMarkdown(), `export_${Date.now()}.md`, 'text/markdown');
    }));

    if (tableInfo) {
      menu.appendChild(createMenuItem('Copy SQL INSERT', () => {
        navigator.clipboard.writeText(getSQLInsert()).then(() => {
          exportBtn.textContent = 'Copied!';
          setTimeout(() => exportBtn.textContent = 'Export ▼', 2000);
        });
      }));
    }

    menu.appendChild(createMenuItem('Copy to Clipboard', () => {
      navigator.clipboard.writeText(getCSV()).then(() => {
        exportBtn.textContent = 'Copied!';
        setTimeout(() => exportBtn.textContent = 'Export ▼', 2000);
      });
    }));

    exportBtn.appendChild(menu);

    // Close menu when clicking outside
    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  });

  return exportBtn;
};
