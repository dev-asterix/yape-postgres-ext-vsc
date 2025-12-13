import type { ActivationFunction } from 'vscode-notebook-renderer';
import { Chart, registerables } from 'chart.js';

// Register all Chart.js components
Chart.register(...registerables);

export const activate: ActivationFunction = context => {
    return {
        renderOutputItem(data, element) {
            const json = data.json();

            if (!json) {
                element.innerText = 'No data';
                return;
            }

            const { columns, rows, rowCount, command, notices, executionTime, tableInfo, success, columnTypes } = json;
            // Deep copy rows to allow modifications without affecting originals
            const originalRows: any[] = rows ? JSON.parse(JSON.stringify(rows)) : [];
            let currentRows: any[] = rows ? JSON.parse(JSON.stringify(rows)) : [];
            const selectedIndices = new Set<number>();

            // Track modified cells: Map of "rowIndex-columnName" -> { originalValue, newValue }
            const modifiedCells = new Map<string, { originalValue: any, newValue: any }>();
            let currentlyEditingCell: HTMLElement | null = null;

            // Track date/time column display mode: true = local time, false = original value
            const dateTimeDisplayMode = new Map<string, boolean>();

            // ... (rest of the code)

            // Main Container (Collapsible Wrapper)
            const mainContainer = document.createElement('div');
            mainContainer.style.fontFamily = 'var(--vscode-font-family), "Segoe UI", "Helvetica Neue", sans-serif';
            mainContainer.style.fontSize = '13px';
            mainContainer.style.color = 'var(--vscode-editor-foreground)';
            mainContainer.style.border = '1px solid var(--vscode-widget-border)';
            mainContainer.style.borderRadius = '4px';
            mainContainer.style.overflow = 'hidden';
            mainContainer.style.marginBottom = '8px';

            // Header
            const header = document.createElement('div');
            header.style.padding = '6px 12px';
            // Use green background for successful queries, neutral for others
            if (success) {
                header.style.background = 'rgba(115, 191, 105, 0.25)'; // Green tint for success
                header.style.borderLeft = '4px solid var(--vscode-testing-iconPassed)';
            } else {
                header.style.background = 'var(--vscode-editor-background)';
            }
            header.style.borderBottom = '1px solid var(--vscode-widget-border)';
            header.style.cursor = 'pointer';
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.gap = '8px';
            header.style.userSelect = 'none';

            const chevron = document.createElement('span');
            chevron.textContent = '▼'; // Expanded by default
            chevron.style.fontSize = '10px';
            chevron.style.transition = 'transform 0.2s';
            chevron.style.display = 'inline-block';

            const title = document.createElement('span');
            title.textContent = command || 'QUERY';
            title.style.fontWeight = '600';
            title.style.textTransform = 'uppercase';

            const summary = document.createElement('span');
            summary.style.marginLeft = 'auto';
            summary.style.opacity = '0.7';
            summary.style.fontSize = '0.9em';

            let summaryText = '';
            if (rowCount !== undefined && rowCount !== null) {
                summaryText += `${rowCount} rows`;
            }
            if (notices && notices.length > 0) {
                summaryText += summaryText ? `, ${notices.length} messages` : `${notices.length} messages`;
            }
            if (executionTime !== undefined) {
                summaryText += summaryText ? `, ${executionTime.toFixed(3)}s` : `${executionTime.toFixed(3)}s`;
            }
            if (!summaryText) summaryText = 'No results';
            summary.textContent = summaryText;

            header.appendChild(chevron);
            header.appendChild(title);
            header.appendChild(summary);
            mainContainer.appendChild(header);

            // Content Container
            const contentContainer = document.createElement('div');
            contentContainer.style.display = 'flex'; // Expanded by default
            contentContainer.style.flexDirection = 'column';
            contentContainer.style.height = '100%'; // Added to ensure content takes full height if needed
            mainContainer.appendChild(contentContainer);

            // Toggle Logic
            let isExpanded = true;
            header.addEventListener('click', () => {
                isExpanded = !isExpanded;
                contentContainer.style.display = isExpanded ? 'flex' : 'none';
                chevron.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
                header.style.borderBottom = isExpanded ? '1px solid var(--vscode-widget-border)' : 'none';
            });

            // Messages Section
            if (notices && notices.length > 0) {
                const messagesContainer = document.createElement('div');
                messagesContainer.style.padding = '8px 12px';
                messagesContainer.style.background = 'var(--vscode-textBlockQuote-background)';
                messagesContainer.style.borderLeft = '4px solid var(--vscode-textBlockQuote-border)';
                messagesContainer.style.margin = '8px 12px 0 12px'; // Add margin
                messagesContainer.style.fontFamily = 'var(--vscode-editor-font-family)';
                messagesContainer.style.whiteSpace = 'pre-wrap';
                messagesContainer.style.fontSize = '12px';

                const title = document.createElement('div');
                title.textContent = 'Messages';
                title.style.fontWeight = '600';
                title.style.marginBottom = '4px';
                title.style.opacity = '0.8';
                messagesContainer.appendChild(title);

                notices.forEach((msg: string) => {
                    const msgDiv = document.createElement('div');
                    msgDiv.textContent = msg;
                    msgDiv.style.marginBottom = '2px';
                    messagesContainer.appendChild(msgDiv);
                });

                contentContainer.appendChild(messagesContainer);
            }

            // Actions Bar
            const actionsBar = document.createElement('div');
            actionsBar.style.display = 'none'; // Hidden by default
            actionsBar.style.padding = '8px 12px';
            actionsBar.style.gap = '8px';
            actionsBar.style.alignItems = 'center';
            actionsBar.style.borderBottom = '1px solid var(--vscode-panel-border)';
            actionsBar.style.background = 'var(--vscode-editor-background)';

            const createButton = (text: string, primary: boolean = false) => {
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
            const selectAllBtn = createButton('Select All', true);
            selectAllBtn.addEventListener('click', () => {
                const allSelected = selectedIndices.size === currentRows.length;

                if (allSelected) {
                    selectedIndices.clear();
                    selectAllBtn.innerText = 'Select All';
                } else {
                    currentRows.forEach((_, i) => selectedIndices.add(i));
                    selectAllBtn.innerText = 'Deselect All';
                }

                updateTable();
                updateActionsVisibility();
            });
            actionsBar.appendChild(selectAllBtn);

            const copyBtn = createButton('Copy Selected', true);
            copyBtn.addEventListener('click', async () => {
                if (selectedIndices.size === 0) return;

                const selectedRows = currentRows.filter((_, i) => selectedIndices.has(i));

                // Convert to CSV
                const header = columns.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(',');
                const body = selectedRows.map(row => {
                    return columns.map((col: string) => {
                        const val = row[col];
                        if (val === null || val === undefined) return '';
                        const str = String(val);
                        // Quote strings if they contain commas, quotes, or newlines
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return `"${str.replace(/"/g, '""')}"`;
                        }
                        return str;
                    }).join(',');
                }).join('\n');

                const csv = `${header}\n${body}`;

                navigator.clipboard.writeText(csv).then(() => {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = 'Copied!';
                    copyBtn.style.background = 'var(--vscode-debugIcon-startForeground)';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = 'var(--vscode-button-background)';
                    }, 2000);
                }).catch((err: Error) => {
                    console.error('Failed to copy:', err);
                    copyBtn.textContent = 'Failed';
                    copyBtn.style.background = 'var(--vscode-errorForeground)';
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy Selected';
                        copyBtn.style.background = 'var(--vscode-button-background)';
                    }, 2000);
                });
            });

            const deleteBtn = createButton(tableInfo ? 'Script Delete' : 'Remove from View', !!tableInfo);

            deleteBtn.addEventListener('click', () => {
                if (selectedIndices.size === 0) return;

                if (tableInfo) {
                    // Send script_delete message to kernel
                    const selectedRows = currentRows.filter((_, i) => selectedIndices.has(i));
                    if (context.postMessage) {
                        context.postMessage({
                            type: 'script_delete',
                            schema: tableInfo.schema,
                            table: tableInfo.table,
                            primaryKeys: tableInfo.primaryKeys,
                            rows: selectedRows,
                            cellIndex: (json as any).cellIndex // Access cellIndex from JSON
                        });
                    }
                } else {
                    // Fallback to remove from view
                    if (confirm('Remove selected rows from this view?')) {
                        currentRows = currentRows.filter((_, i) => !selectedIndices.has(i));
                        selectedIndices.clear();
                        updateTable();
                        updateActionsVisibility();
                    }
                }
            });

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
                    const body = currentRows.map(row => {
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
                    const body = currentRows.map(row => {
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

                    return currentRows.map((row: any) => {
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
                    const body = currentRows.map(row => {
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
                    const jsonStr = JSON.stringify(currentRows, null, 2);
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

            actionsBar.appendChild(selectAllBtn);
            actionsBar.appendChild(copyBtn);
            actionsBar.appendChild(exportBtn);

            // Helper to detect numeric columns
            const getNumericColumns = (): string[] => {
                if (!columns || columns.length === 0 || !currentRows || currentRows.length === 0) return [];
                return columns.filter((col: string) => {
                    // Check column type if available
                    if (columnTypes && columnTypes[col]) {
                        const type = columnTypes[col].toLowerCase();
                        if (type.includes('int') || type.includes('numeric') || type.includes('decimal') ||
                            type.includes('float') || type.includes('double') || type.includes('real') ||
                            type === 'money' || type === 'bigint' || type === 'smallint') {
                            return true;
                        }
                    }
                    // Fallback: check first few non-null values
                    for (let i = 0; i < Math.min(5, currentRows.length); i++) {
                        const val = currentRows[i][col];
                        if (val !== null && val !== undefined) {
                            if (typeof val === 'number') return true;
                            if (typeof val === 'string' && !isNaN(parseFloat(val)) && isFinite(parseFloat(val))) return true;
                        }
                    }
                    return false;
                });
            };

            // Helper to detect date/timestamp columns
            const isDateColumn = (col: string): boolean => {
                if (json.columnTypes) {
                    const type = (json.columnTypes[col] || '').toLowerCase();
                    if (type.includes('timestamp') || type.includes('date') || type.includes('time')) {
                        return true;
                    }
                }
                // Fallback: check first few non-null values for date-like strings
                for (let i = 0; i < Math.min(5, currentRows.length); i++) {
                    const val = currentRows[i][col];
                    if (val !== null && val !== undefined) {
                        const str = String(val);
                        // Check for ISO date format or common date patterns
                        if (/^\d{4}-\d{2}-\d{2}/.test(str) || /^\d{2}\/\d{2}\/\d{4}/.test(str)) {
                            const parsed = new Date(str);
                            if (!isNaN(parsed.getTime())) return true;
                        }
                    }
                }
                return false;
            };

            // Helper to format date with custom format string
            const formatDate = (value: any, format: string): string => {
                if (value === null || value === undefined) return '';
                const date = new Date(value);
                if (isNaN(date.getTime())) return String(value);

                const pad = (n: number, len: number = 2) => String(n).padStart(len, '0');

                // Get short timezone abbreviation (e.g., IST, EST, UTC)
                const getTimezoneAbbr = (): string => {
                    try {
                        const tzString = date.toLocaleTimeString('en-US', { timeZoneName: 'short' });
                        const match = tzString.match(/[A-Z]{2,5}$/);
                        return match ? match[0] : 'UTC';
                    } catch {
                        return 'UTC';
                    }
                };

                return format
                    .replace(/YYYY/g, String(date.getFullYear()))
                    .replace(/YY/g, String(date.getFullYear()).slice(-2))
                    .replace(/MM/g, pad(date.getMonth() + 1))
                    .replace(/DD/g, pad(date.getDate()))
                    .replace(/HH/g, pad(date.getHours()))
                    .replace(/mm/g, pad(date.getMinutes()))
                    .replace(/ss/g, pad(date.getSeconds()))
                    .replace(/Z/g, (() => {
                        const offset = -date.getTimezoneOffset();
                        const sign = offset >= 0 ? '+' : '-';
                        const h = pad(Math.floor(Math.abs(offset) / 60));
                        const m = pad(Math.abs(offset) % 60);
                        return `${sign}${h}:${m}`;
                    })())
                    .replace(/z/g, getTimezoneAbbr());
            };

            // Premium gradient-inspired color palette
            const defaultColors = [
                'rgba(99, 102, 241, 0.85)',   // Indigo
                'rgba(236, 72, 153, 0.85)',   // Pink
                'rgba(34, 211, 238, 0.85)',   // Cyan
                'rgba(251, 146, 60, 0.85)',   // Orange
                'rgba(168, 85, 247, 0.85)',   // Purple
                'rgba(52, 211, 153, 0.85)',   // Emerald
                'rgba(251, 191, 36, 0.85)',   // Amber
                'rgba(59, 130, 246, 0.85)',   // Blue
                'rgba(249, 115, 22, 0.85)',   // Deep Orange
                'rgba(139, 92, 246, 0.85)',   // Violet
            ];

            // Premium border colors (slightly darker/more saturated)
            const borderColors = [
                'rgba(79, 70, 229, 1)',       // Indigo
                'rgba(219, 39, 119, 1)',      // Pink
                'rgba(6, 182, 212, 1)',       // Cyan
                'rgba(234, 88, 12, 1)',       // Orange
                'rgba(147, 51, 234, 1)',      // Purple
                'rgba(16, 185, 129, 1)',      // Emerald
                'rgba(245, 158, 11, 1)',      // Amber
                'rgba(37, 99, 235, 1)',       // Blue
                'rgba(234, 88, 12, 1)',       // Deep Orange
                'rgba(124, 58, 237, 1)',      // Violet
            ];

            // Helper to create gradient for canvas
            const createGradient = (ctx: CanvasRenderingContext2D, colorIndex: number, customColor?: string, isVertical: boolean = true) => {
                const gradient = isVertical
                    ? ctx.createLinearGradient(0, 0, 0, 400)
                    : ctx.createLinearGradient(0, 0, 400, 0);
                const baseColor = customColor || defaultColors[colorIndex % defaultColors.length];
                const lighterColor = baseColor.replace(/0\.\d+\)$/, '0.4)');
                gradient.addColorStop(0, baseColor);
                gradient.addColorStop(1, lighterColor);
                return gradient;
            };

            // Helper to darken a color for borders
            const darkenColor = (rgba: string): string => {
                const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (!match) return rgba;
                const r = Math.max(0, parseInt(match[1]) - 40);
                const g = Math.max(0, parseInt(match[2]) - 40);
                const b = Math.max(0, parseInt(match[3]) - 40);
                return `rgba(${r}, ${g}, ${b}, 1)`;
            };

            // Tab state
            let activeTab: 'table' | 'chart' = 'table';
            let chartInstance: Chart | null = null;

            // Create tab bar
            const tabBar = document.createElement('div');
            tabBar.style.cssText = `
                display: flex;
                gap: 0;
                border-bottom: 1px solid var(--vscode-panel-border);
                background: var(--vscode-editor-background);
            `;

            const createTab = (label: string, id: 'table' | 'chart') => {
                const tab = document.createElement('button');
                tab.textContent = label;
                tab.dataset.tabId = id;
                tab.style.cssText = `
                    padding: 8px 16px;
                    border: none;
                    background: ${id === activeTab ? 'var(--vscode-tab-activeBackground)' : 'transparent'};
                    color: ${id === activeTab ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)'};
                    border-bottom: ${id === activeTab ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent'};
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: all 0.15s;
                `;
                tab.addEventListener('click', () => switchTab(id));
                return tab;
            };

            const tableTab = createTab('📋 Table', 'table');
            const chartTab = createTab('📊 Chart', 'chart');
            tabBar.appendChild(tableTab);
            tabBar.appendChild(chartTab);

            // Tab panels container
            const tabPanelsContainer = document.createElement('div');
            tabPanelsContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden;';

            // Table Panel
            const tablePanel = document.createElement('div');
            tablePanel.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden;';

            // Chart Panel
            const chartPanel = document.createElement('div');
            chartPanel.style.cssText = 'flex: 1; display: none; flex-direction: row; overflow: hidden;';

            // Chart state
            let selectedChartType = 'bar';
            let selectedXAxis = columns[0] || '';
            const numericCols = getNumericColumns();
            let selectedYAxes: string[] = numericCols.length > 0 ? [numericCols[0]] : [];
            const seriesColors: Map<string, string> = new Map();
            numericCols.forEach((col, i) => seriesColors.set(col, defaultColors[i % defaultColors.length]));

            // Pie/Doughnut slice state (color per category label, hidden slices)
            const sliceColors: Map<string, string> = new Map();
            const hiddenSlices: Set<string> = new Set();

            // Initialize slice colors from data
            const initSliceColors = () => {
                if (!currentRows || currentRows.length === 0) return;
                currentRows.forEach((row, i) => {
                    const label = String(row[selectedXAxis] ?? `Item ${i}`);
                    if (!sliceColors.has(label)) {
                        sliceColors.set(label, defaultColors[i % defaultColors.length]);
                    }
                });
            };
            initSliceColors();

            // Build chart configuration panel
            const chartConfigPanel = document.createElement('div');
            chartConfigPanel.style.cssText = `
                width: 260px;
                min-width: 260px;
                padding: 12px;
                border-right: 1px solid var(--vscode-panel-border);
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 12px;
                background: var(--vscode-sideBar-background);
            `;

            // Chart Type Section
            const chartTypeSection = document.createElement('div');
            const chartTypeLabel = document.createElement('div');
            chartTypeLabel.textContent = 'Chart Type';
            chartTypeLabel.style.cssText = 'font-weight: 600; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; opacity: 0.8;';
            chartTypeSection.appendChild(chartTypeLabel);

            const chartTypeGrid = document.createElement('div');
            chartTypeGrid.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;';

            const chartTypes = [
                { id: 'bar', icon: '📊', label: 'Bar' },
                { id: 'line', icon: '📈', label: 'Line' },
                { id: 'area', icon: '📉', label: 'Area' },
                { id: 'stackedBar', icon: '📊', label: 'Stacked' },
                { id: 'pie', icon: '🥧', label: 'Pie' },
                { id: 'doughnut', icon: '🍩', label: 'Donut' },
            ];

            const chartTypeBtns: HTMLButtonElement[] = [];
            chartTypes.forEach(type => {
                const btn = document.createElement('button');
                btn.textContent = type.icon;
                btn.title = type.label;
                btn.style.cssText = `
                    padding: 6px;
                    border: 1px solid var(--vscode-widget-border);
                    background: ${type.id === selectedChartType ? 'var(--vscode-button-background)' : 'var(--vscode-input-background)'};
                    color: ${type.id === selectedChartType ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)'};
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                `;
                btn.addEventListener('click', () => {
                    selectedChartType = type.id;
                    chartTypeBtns.forEach(b => {
                        b.style.background = 'var(--vscode-input-background)';
                        b.style.color = 'var(--vscode-foreground)';
                    });
                    btn.style.background = 'var(--vscode-button-background)';
                    btn.style.color = 'var(--vscode-button-foreground)';

                    // For pie/doughnut, limit to single Y-axis
                    const isPieType = type.id === 'pie' || type.id === 'doughnut';
                    if (isPieType && selectedYAxes.length > 1) {
                        selectedYAxes = [selectedYAxes[0]];
                        updateYAxisCheckboxes();
                    }
                    updateAxisLabels();
                    if (typeof updateLabelsVisibility === 'function') updateLabelsVisibility();
                    if (typeof updateSectionsVisibility === 'function') updateSectionsVisibility();
                    if (typeof updateChartOptionVisibility === 'function') updateChartOptionVisibility();
                    updateChart();
                });
                chartTypeBtns.push(btn);
                chartTypeGrid.appendChild(btn);
            });
            chartTypeSection.appendChild(chartTypeGrid);
            chartConfigPanel.appendChild(chartTypeSection);

            // X-Axis Section
            const xAxisSection = document.createElement('div');
            const xAxisLabel = document.createElement('div');
            xAxisLabel.textContent = 'X-Axis (Labels)';
            xAxisLabel.style.cssText = 'font-weight: 600; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; opacity: 0.8;';
            xAxisSection.appendChild(xAxisLabel);

            const xAxisSelect = document.createElement('select');
            xAxisSelect.style.cssText = `
                width: 100%;
                padding: 6px;
                border: 1px solid var(--vscode-input-border);
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 4px;
                font-size: 12px;
            `;
            columns.forEach((col: string) => {
                const option = document.createElement('option');
                option.value = col;
                option.textContent = col;
                if (col === selectedXAxis) option.selected = true;
                xAxisSelect.appendChild(option);
            });
            xAxisSelect.addEventListener('change', () => {
                selectedXAxis = xAxisSelect.value;
                // Reinitialize slice colors for new category and rebuild UI
                initSliceColors();
                if (typeof rebuildSlicesUI === 'function') rebuildSlicesUI();
                updateDateFormatVisibility();
                updateChart();
            });
            xAxisSection.appendChild(xAxisSelect);
            chartConfigPanel.appendChild(xAxisSection);

            // Date Format Section (visible only when X-axis is a date column)
            let dateFormat = 'YYYY-MM-DD';
            const dateFormatSection = document.createElement('div');
            dateFormatSection.style.cssText = 'display: none;'; // Hidden initially

            const dateFormatLabel = document.createElement('div');
            dateFormatLabel.textContent = 'Date Format';
            dateFormatLabel.style.cssText = 'font-weight: 600; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; opacity: 0.8;';
            dateFormatSection.appendChild(dateFormatLabel);

            const dateFormatInput = document.createElement('input');
            dateFormatInput.type = 'text';
            dateFormatInput.value = dateFormat;
            dateFormatInput.placeholder = 'YYYY-MM-DD HH:mm';
            dateFormatInput.style.cssText = `
                width: 100%;
                padding: 6px;
                border: 1px solid var(--vscode-input-border);
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 4px;
                font-size: 12px;
                box-sizing: border-box;
            `;
            dateFormatInput.addEventListener('input', () => {
                dateFormat = dateFormatInput.value || 'YYYY-MM-DD';
                updateChart();
            });
            dateFormatSection.appendChild(dateFormatInput);

            // Format hints
            const formatHints = document.createElement('div');
            formatHints.style.cssText = 'font-size: 10px; opacity: 0.6; margin-top: 4px;';
            formatHints.textContent = 'YYYY, MM, DD, HH, mm, ss, Z, z';
            dateFormatSection.appendChild(formatHints);

            chartConfigPanel.appendChild(dateFormatSection);

            // Function to update date format visibility
            const updateDateFormatVisibility = () => {
                const isDate = isDateColumn(selectedXAxis);
                dateFormatSection.style.display = isDate ? 'block' : 'none';
            };
            updateDateFormatVisibility();

            // Y-Axis Section
            const yAxisSection = document.createElement('div');
            const yAxisLabel = document.createElement('div');
            yAxisLabel.textContent = 'Y-Axis (Values)';
            yAxisLabel.style.cssText = 'font-weight: 600; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; opacity: 0.8;';
            yAxisSection.appendChild(yAxisLabel);

            // Helper to update axis labels based on chart type
            const updateAxisLabels = () => {
                const isPieType = selectedChartType === 'pie' || selectedChartType === 'doughnut';
                xAxisLabel.textContent = isPieType ? 'Categories (Slice Labels)' : 'X-Axis (Labels)';
                yAxisLabel.textContent = isPieType ? 'Values (Slice Sizes)' : 'Y-Axis (Values)';
            };

            const yAxisContainer = document.createElement('div');
            yAxisContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto;';

            const yAxisCheckboxes: Map<string, HTMLInputElement> = new Map();

            const updateYAxisCheckboxes = () => {
                yAxisCheckboxes.forEach((checkbox, col) => {
                    checkbox.checked = selectedYAxes.includes(col);
                });
            };

            // Helper functions for color conversion
            const rgbaToHex = (rgba: string): string => {
                const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (!match) return '#3498db';
                const r = parseInt(match[1]).toString(16).padStart(2, '0');
                const g = parseInt(match[2]).toString(16).padStart(2, '0');
                const b = parseInt(match[3]).toString(16).padStart(2, '0');
                return `#${r}${g}${b}`;
            };

            const hexToRgba = (hex: string, alpha: number): string => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            };

            numericCols.forEach((col, idx) => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 2px 0;';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = selectedYAxes.includes(col);
                checkbox.style.cssText = 'cursor: pointer;';
                yAxisCheckboxes.set(col, checkbox);

                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) {
                        if (selectedChartType === 'pie' || selectedChartType === 'doughnut') {
                            selectedYAxes = [col];
                            updateYAxisCheckboxes();
                        } else {
                            if (!selectedYAxes.includes(col)) {
                                selectedYAxes.push(col);
                            }
                        }
                    } else {
                        selectedYAxes = selectedYAxes.filter(c => c !== col);
                    }
                    updateChart();
                });

                const label = document.createElement('span');
                label.textContent = col;
                label.style.cssText = 'flex: 1; font-size: 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
                label.title = col;
                label.addEventListener('click', () => checkbox.click());

                const colorPicker = document.createElement('input');
                colorPicker.type = 'color';
                colorPicker.value = rgbaToHex(seriesColors.get(col) || defaultColors[idx % defaultColors.length]);
                colorPicker.style.cssText = 'width: 20px; height: 20px; border: none; border-radius: 3px; cursor: pointer; padding: 0;';
                colorPicker.addEventListener('input', () => {
                    seriesColors.set(col, hexToRgba(colorPicker.value, 0.8));
                    updateChart();
                });

                row.appendChild(checkbox);
                row.appendChild(label);
                row.appendChild(colorPicker);
                yAxisContainer.appendChild(row);
            });
            yAxisSection.appendChild(yAxisContainer);
            chartConfigPanel.appendChild(yAxisSection);

            // Values section (for pie/doughnut - select which numeric column to use for values)
            const valuesSection = document.createElement('div');
            valuesSection.style.cssText = 'display: none;'; // Hidden initially

            const valuesSectionLabel = document.createElement('div');
            valuesSectionLabel.textContent = 'Values (Slice Sizes)';
            valuesSectionLabel.style.cssText = 'font-weight: 600; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; opacity: 0.8;';
            valuesSection.appendChild(valuesSectionLabel);

            let selectedPieValueColumn: string = ''; // Empty means count occurrences

            const valuesSelect = document.createElement('select');
            valuesSelect.style.cssText = `
                width: 100%;
                padding: 6px;
                border: 1px solid var(--vscode-input-border);
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border-radius: 4px;
                font-size: 12px;
            `;

            // Add "Count" option as default
            const countOption = document.createElement('option');
            countOption.value = '';
            countOption.textContent = '📊 Count (occurrences)';
            countOption.selected = true;
            valuesSelect.appendChild(countOption);

            // Add numeric columns as options
            numericCols.forEach((col: string) => {
                const option = document.createElement('option');
                option.value = col;
                option.textContent = col;
                valuesSelect.appendChild(option);
            });

            valuesSelect.addEventListener('change', () => {
                selectedPieValueColumn = valuesSelect.value;
                rebuildSlicesUI();
                updateChart();
            });

            valuesSection.appendChild(valuesSelect);
            chartConfigPanel.appendChild(valuesSection);

            // Slices section (for pie/doughnut - shows actual categories with colors and hide/show)
            const slicesSection = document.createElement('div');
            slicesSection.style.cssText = 'display: none;'; // Hidden initially (shown only for pie/doughnut)

            const slicesSectionLabel = document.createElement('div');
            slicesSectionLabel.textContent = 'Slices';
            slicesSectionLabel.style.cssText = 'font-weight: 600; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; opacity: 0.8;';
            slicesSection.appendChild(slicesSectionLabel);

            const slicesContainer = document.createElement('div');
            slicesContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto;';

            // Function to rebuild slices UI based on current data
            const rebuildSlicesUI = () => {
                slicesContainer.innerHTML = '';
                if (!currentRows || currentRows.length === 0) return;

                // Check if X-axis is a date column
                const isXAxisDateCol = isDateColumn(selectedXAxis);

                // Aggregate data by category
                const aggregatedData: Map<string, { value: number; count: number }> = new Map();
                currentRows.forEach((row) => {
                    // Apply date formatting if X-axis is a date column
                    const rawValue = row[selectedXAxis];
                    const sliceLabel = isXAxisDateCol && rawValue
                        ? formatDate(rawValue, dateFormat)
                        : String(rawValue ?? 'Unknown');
                    const existing = aggregatedData.get(sliceLabel) || { value: 0, count: 0 };

                    if (selectedPieValueColumn) {
                        // Sum values for this category
                        existing.value += parseFloat(row[selectedPieValueColumn]) || 0;
                    }
                    existing.count += 1;
                    aggregatedData.set(sliceLabel, existing);
                });

                // Calculate totals
                let total = 0;
                const sliceData: { label: string; value: number; index: number }[] = [];
                let colorIndex = 0;
                aggregatedData.forEach((data, label) => {
                    const value = selectedPieValueColumn ? data.value : data.count;
                    sliceData.push({ label, value, index: colorIndex++ });
                    if (!hiddenSlices.has(label)) {
                        total += value;
                    }
                });

                sliceData.forEach(({ label: sliceLabel, value: sliceValue, index: i }) => {
                    // Initialize color if not set
                    if (!sliceColors.has(sliceLabel)) {
                        sliceColors.set(sliceLabel, defaultColors[i % defaultColors.length]);
                    }

                    const isHidden = hiddenSlices.has(sliceLabel);
                    const percentage = total > 0 && !isHidden ? ((sliceValue / total) * 100).toFixed(1) : '0.0';

                    const sliceRow = document.createElement('div');
                    sliceRow.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 2px 0;';

                    const sliceCheckbox = document.createElement('input');
                    sliceCheckbox.type = 'checkbox';
                    sliceCheckbox.checked = !isHidden;
                    sliceCheckbox.style.cssText = 'cursor: pointer;';
                    sliceCheckbox.addEventListener('change', () => {
                        if (sliceCheckbox.checked) {
                            hiddenSlices.delete(sliceLabel);
                        } else {
                            hiddenSlices.add(sliceLabel);
                        }
                        rebuildSlicesUI(); // Rebuild to update percentages
                        updateChart();
                    });

                    const sliceLabelSpan = document.createElement('span');
                    sliceLabelSpan.textContent = isHidden ? sliceLabel : `${sliceLabel} (${percentage}%)`;
                    sliceLabelSpan.style.cssText = `flex: 1; font-size: 11px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${isHidden ? 'opacity: 0.5;' : ''}`;
                    sliceLabelSpan.title = `${sliceLabel}: ${sliceValue.toLocaleString()}`;
                    sliceLabelSpan.addEventListener('click', () => sliceCheckbox.click());

                    const sliceColorPicker = document.createElement('input');
                    sliceColorPicker.type = 'color';
                    sliceColorPicker.value = rgbaToHex(sliceColors.get(sliceLabel) || defaultColors[i % defaultColors.length]);
                    sliceColorPicker.style.cssText = 'width: 20px; height: 20px; border: none; border-radius: 3px; cursor: pointer; padding: 0;';
                    sliceColorPicker.addEventListener('input', () => {
                        sliceColors.set(sliceLabel, hexToRgba(sliceColorPicker.value, 0.85));
                        updateChart();
                    });

                    sliceRow.appendChild(sliceCheckbox);
                    sliceRow.appendChild(sliceLabelSpan);
                    sliceRow.appendChild(sliceColorPicker);
                    slicesContainer.appendChild(sliceRow);
                });
            };

            slicesSection.appendChild(slicesContainer);
            chartConfigPanel.appendChild(slicesSection);

            // Update visibility of Y-axis vs Slices/Values sections
            const updateSectionsVisibility = () => {
                const isPieType = selectedChartType === 'pie' || selectedChartType === 'doughnut';
                yAxisSection.style.display = isPieType ? 'none' : 'block';
                valuesSection.style.display = isPieType ? 'block' : 'none';
                slicesSection.style.display = isPieType ? 'block' : 'none';
                if (isPieType) {
                    rebuildSlicesUI();
                }
            };

            // Show Labels option (for pie/doughnut)
            let showLabels = true;
            const labelsSection = document.createElement('div');
            labelsSection.style.cssText = 'display: none;'; // Hidden initially

            const labelsRow = document.createElement('div');
            labelsRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const labelsCheckbox = document.createElement('input');
            labelsCheckbox.type = 'checkbox';
            labelsCheckbox.checked = showLabels;
            labelsCheckbox.id = 'showLabelsCheckbox';
            labelsCheckbox.style.cssText = 'cursor: pointer;';
            labelsCheckbox.addEventListener('change', () => {
                showLabels = labelsCheckbox.checked;
                updateChart();
            });

            const labelsLabel = document.createElement('label');
            labelsLabel.textContent = 'Show Labels on Slices';
            labelsLabel.htmlFor = 'showLabelsCheckbox';
            labelsLabel.style.cssText = 'font-size: 12px; cursor: pointer;';

            labelsRow.appendChild(labelsCheckbox);
            labelsRow.appendChild(labelsLabel);
            labelsSection.appendChild(labelsRow);
            chartConfigPanel.appendChild(labelsSection);

            // Update labels section visibility based on chart type
            const updateLabelsVisibility = () => {
                const isPieType = selectedChartType === 'pie' || selectedChartType === 'doughnut';
                labelsSection.style.display = isPieType ? 'block' : 'none';
            };

            // ============ CHART OPTIONS SECTION ============
            const optionsSection = document.createElement('div');
            optionsSection.style.cssText = 'border-top: 1px solid var(--vscode-panel-border); padding-top: 10px;';

            const optionsHeader = document.createElement('div');
            optionsHeader.textContent = '⚙️ Options';
            optionsHeader.style.cssText = 'font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase; opacity: 0.8; cursor: pointer;';
            optionsSection.appendChild(optionsHeader);

            const optionsContainer = document.createElement('div');
            optionsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

            // State variables for options
            let chartTitle = '';
            let legendPosition: 'top' | 'bottom' | 'left' | 'right' | 'hidden' = 'bottom';
            let showGridX = true;
            let showGridY = true;
            let enableAnimation = true;
            let yAxisMin: number | null = null;
            let yAxisMax: number | null = null;
            let useLogScale = false;
            let sortBy: 'none' | 'label-asc' | 'label-desc' | 'value-asc' | 'value-desc' = 'none';
            let limitRows: number | null = null;
            let horizontalBars = false;
            let lineStyle: 'solid' | 'dashed' | 'dotted' = 'solid';
            let pointStyle: 'circle' | 'triangle' | 'rect' | 'cross' = 'circle';
            let curveTension = 0.4;
            let showDataLabels = false;
            let blurEffect = false;

            // Helper to create option row
            const createOptionRow = (label: string, control: HTMLElement): HTMLDivElement => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 6px;';
                const lbl = document.createElement('span');
                lbl.textContent = label;
                lbl.style.cssText = 'font-size: 11px; flex-shrink: 0;';
                row.appendChild(lbl);
                control.style.cssText = (control.style.cssText || '') + 'flex: 1; max-width: 100px;';
                row.appendChild(control);
                return row;
            };

            // Chart Title
            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.placeholder = 'Chart title...';
            titleInput.style.cssText = 'padding: 4px 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 11px;';
            titleInput.addEventListener('input', () => { chartTitle = titleInput.value; updateChart(); });
            optionsContainer.appendChild(createOptionRow('Title', titleInput));

            // Legend Position
            const legendSelect = document.createElement('select');
            legendSelect.style.cssText = 'padding: 3px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 11px;';
            ['top', 'bottom', 'left', 'right', 'hidden'].forEach(pos => {
                const opt = document.createElement('option');
                opt.value = pos;
                opt.textContent = pos.charAt(0).toUpperCase() + pos.slice(1);
                if (pos === legendPosition) opt.selected = true;
                legendSelect.appendChild(opt);
            });
            legendSelect.addEventListener('change', () => { legendPosition = legendSelect.value as any; updateChart(); });
            optionsContainer.appendChild(createOptionRow('Legend', legendSelect));

            // Grid Lines
            const gridContainer = document.createElement('div');
            gridContainer.style.cssText = 'display: flex; gap: 8px;';
            const gridXLabel = document.createElement('label');
            gridXLabel.style.cssText = 'font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer;';
            const gridXCheck = document.createElement('input');
            gridXCheck.type = 'checkbox';
            gridXCheck.checked = showGridX;
            gridXCheck.addEventListener('change', () => { showGridX = gridXCheck.checked; updateChart(); });
            gridXLabel.appendChild(gridXCheck);
            gridXLabel.appendChild(document.createTextNode('X'));
            const gridYLabel = document.createElement('label');
            gridYLabel.style.cssText = 'font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer;';
            const gridYCheck = document.createElement('input');
            gridYCheck.type = 'checkbox';
            gridYCheck.checked = showGridY;
            gridYCheck.addEventListener('change', () => { showGridY = gridYCheck.checked; updateChart(); });
            gridYLabel.appendChild(gridYCheck);
            gridYLabel.appendChild(document.createTextNode('Y'));
            gridContainer.appendChild(gridXLabel);
            gridContainer.appendChild(gridYLabel);
            optionsContainer.appendChild(createOptionRow('Grid', gridContainer));

            // Animation Toggle
            const animCheck = document.createElement('input');
            animCheck.type = 'checkbox';
            animCheck.checked = enableAnimation;
            animCheck.style.cssText = 'cursor: pointer;';
            animCheck.addEventListener('change', () => { enableAnimation = animCheck.checked; updateChart(); });
            optionsContainer.appendChild(createOptionRow('Animation', animCheck));

            // Y-Axis Range & Log Scale
            const yRangeContainer = document.createElement('div');
            yRangeContainer.style.cssText = 'display: flex; gap: 4px; align-items: center;';
            const yMinInput = document.createElement('input');
            yMinInput.type = 'number';
            yMinInput.placeholder = 'Min';
            yMinInput.style.cssText = 'width: 35px; padding: 3px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 10px;';
            yMinInput.addEventListener('input', () => { yAxisMin = yMinInput.value ? parseFloat(yMinInput.value) : null; updateChart(); });
            const yMaxInput = document.createElement('input');
            yMaxInput.type = 'number';
            yMaxInput.placeholder = 'Max';
            yMaxInput.style.cssText = 'width: 35px; padding: 3px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 10px;';
            yMaxInput.addEventListener('input', () => { yAxisMax = yMaxInput.value ? parseFloat(yMaxInput.value) : null; updateChart(); });

            yRangeContainer.appendChild(yMinInput);
            yRangeContainer.appendChild(yMaxInput);
            optionsContainer.appendChild(createOptionRow('Y Range', yRangeContainer));

            // Log Scale
            const logCheck = document.createElement('input');
            logCheck.type = 'checkbox';
            logCheck.checked = useLogScale;
            logCheck.style.cssText = 'cursor: pointer;';
            logCheck.addEventListener('change', () => { useLogScale = logCheck.checked; updateChart(); });
            optionsContainer.appendChild(createOptionRow('Log Scale', logCheck));

            // Blur Effect
            const blurCheck = document.createElement('input');
            blurCheck.type = 'checkbox';
            blurCheck.checked = blurEffect;
            blurCheck.style.cssText = 'cursor: pointer;';
            blurCheck.addEventListener('change', () => { blurEffect = blurCheck.checked; updateChart(); });
            optionsContainer.appendChild(createOptionRow('Blur Effect', blurCheck));

            // Sort By
            const sortSelect = document.createElement('select');
            sortSelect.style.cssText = 'padding: 3px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 10px;';
            [['none', 'None'], ['label-asc', 'Label ↑'], ['label-desc', 'Label ↓'], ['value-asc', 'Value ↑'], ['value-desc', 'Value ↓']].forEach(([val, text]) => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = text;
                sortSelect.appendChild(opt);
            });
            sortSelect.addEventListener('change', () => { sortBy = sortSelect.value as any; updateChart(); });
            optionsContainer.appendChild(createOptionRow('Sort', sortSelect));

            // Limit Rows
            const limitInput = document.createElement('input');
            limitInput.type = 'number';
            limitInput.placeholder = 'All';
            limitInput.min = '1';
            limitInput.style.cssText = 'padding: 3px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 11px;';
            limitInput.addEventListener('input', () => { limitRows = limitInput.value ? parseInt(limitInput.value) : null; updateChart(); });
            optionsContainer.appendChild(createOptionRow('Limit', limitInput));

            // Horizontal Bars (for bar charts)
            const hBarCheck = document.createElement('input');
            hBarCheck.type = 'checkbox';
            hBarCheck.checked = horizontalBars;
            hBarCheck.style.cssText = 'cursor: pointer;';
            hBarCheck.addEventListener('change', () => { horizontalBars = hBarCheck.checked; updateChart(); });
            const hBarRow = createOptionRow('Horizontal', hBarCheck);
            hBarRow.className = 'bar-option';
            optionsContainer.appendChild(hBarRow);

            // Line Style (for line/area charts)
            const lineStyleSelect = document.createElement('select');
            lineStyleSelect.style.cssText = 'padding: 3px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 11px;';
            ['solid', 'dashed', 'dotted'].forEach(style => {
                const opt = document.createElement('option');
                opt.value = style;
                opt.textContent = style.charAt(0).toUpperCase() + style.slice(1);
                lineStyleSelect.appendChild(opt);
            });
            lineStyleSelect.addEventListener('change', () => { lineStyle = lineStyleSelect.value as any; updateChart(); });
            const lineStyleRow = createOptionRow('Line Style', lineStyleSelect);
            lineStyleRow.className = 'line-option';
            optionsContainer.appendChild(lineStyleRow);

            // Point Style (for line charts)
            const pointStyleSelect = document.createElement('select');
            pointStyleSelect.style.cssText = 'padding: 3px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 11px;';
            [['circle', '●'], ['triangle', '▲'], ['rect', '■'], ['cross', '✕']].forEach(([val, text]) => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = text;
                pointStyleSelect.appendChild(opt);
            });
            pointStyleSelect.addEventListener('change', () => { pointStyle = pointStyleSelect.value as any; updateChart(); });
            const pointStyleRow = createOptionRow('Points', pointStyleSelect);
            pointStyleRow.className = 'line-option';
            optionsContainer.appendChild(pointStyleRow);

            // Curve Tension (for line/area)
            const tensionInput = document.createElement('input');
            tensionInput.type = 'range';
            tensionInput.min = '0';
            tensionInput.max = '1';
            tensionInput.step = '0.1';
            tensionInput.value = String(curveTension);
            tensionInput.style.cssText = 'cursor: pointer;';
            tensionInput.addEventListener('input', () => { curveTension = parseFloat(tensionInput.value); updateChart(); });
            const tensionRow = createOptionRow('Curve', tensionInput);
            tensionRow.className = 'line-option';
            optionsContainer.appendChild(tensionRow);

            // Data Labels
            const dataLabelsCheck = document.createElement('input');
            dataLabelsCheck.type = 'checkbox';
            dataLabelsCheck.checked = showDataLabels;
            dataLabelsCheck.style.cssText = 'cursor: pointer;';
            dataLabelsCheck.addEventListener('change', () => { showDataLabels = dataLabelsCheck.checked; updateChart(); });
            optionsContainer.appendChild(createOptionRow('Data Labels', dataLabelsCheck));

            optionsSection.appendChild(optionsContainer);
            chartConfigPanel.appendChild(optionsSection);

            // Update chart-specific option visibility
            const updateChartOptionVisibility = () => {
                const isBar = selectedChartType === 'bar' || selectedChartType === 'stackedBar';
                const isLine = selectedChartType === 'line' || selectedChartType === 'area';
                optionsContainer.querySelectorAll('.bar-option').forEach((el: any) => el.style.display = isBar ? 'flex' : 'none');
                optionsContainer.querySelectorAll('.line-option').forEach((el: any) => el.style.display = isLine ? 'flex' : 'none');
            };
            updateChartOptionVisibility();
            const exportSection = document.createElement('div');
            exportSection.style.cssText = 'margin-top: auto; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border);';
            const exportPngBtn = createButton('💾 Export PNG', true);
            exportPngBtn.style.width = '100%';
            exportPngBtn.addEventListener('click', () => {
                if (!chartInstance) return;
                const link = document.createElement('a');
                link.download = `chart_${Date.now()}.png`;
                link.href = chartCanvas.toDataURL('image/png');
                link.click();
            });
            exportSection.appendChild(exportPngBtn);
            chartConfigPanel.appendChild(exportSection);

            chartPanel.appendChild(chartConfigPanel);

            // Chart canvas container
            const chartCanvasContainer = document.createElement('div');
            chartCanvasContainer.style.cssText = 'flex: 1; padding: 12px; display: flex; align-items: center; justify-content: center; background: var(--vscode-editor-background); min-height: 300px;';

            const chartCanvas = document.createElement('canvas');
            chartCanvas.style.cssText = 'max-width: 100%; max-height: 400px;';
            chartCanvasContainer.appendChild(chartCanvas);
            chartPanel.appendChild(chartCanvasContainer);

            // Chart update function
            const updateChart = () => {
                if (chartInstance) {
                    chartInstance.destroy();
                    chartInstance = null;
                }

                if (selectedYAxes.length === 0 || !currentRows || currentRows.length === 0) return;

                // Apply sorting and limiting to the data
                let chartData = [...currentRows];

                // Sort data
                if (sortBy !== 'none') {
                    const firstYCol = selectedYAxes[0];
                    chartData.sort((a, b) => {
                        if (sortBy === 'label-asc') return String(a[selectedXAxis]).localeCompare(String(b[selectedXAxis]));
                        if (sortBy === 'label-desc') return String(b[selectedXAxis]).localeCompare(String(a[selectedXAxis]));
                        if (sortBy === 'value-asc') return (parseFloat(a[firstYCol]) || 0) - (parseFloat(b[firstYCol]) || 0);
                        if (sortBy === 'value-desc') return (parseFloat(b[firstYCol]) || 0) - (parseFloat(a[firstYCol]) || 0);
                        return 0;
                    });
                }

                // Limit rows
                if (limitRows && limitRows > 0 && chartData.length > limitRows) {
                    chartData = chartData.slice(0, limitRows);
                }

                // Create labels with date formatting if applicable
                const isXAxisDate = isDateColumn(selectedXAxis);
                const labels = chartData.map(row => {
                    const value = row[selectedXAxis];
                    if (isXAxisDate && value) {
                        return formatDate(value, dateFormat);
                    }
                    return String(value ?? '');
                });

                // Get computed foreground color for text (Chart.js can't use CSS variables)
                const computedStyle = getComputedStyle(document.documentElement);
                const textColor = computedStyle.getPropertyValue('--vscode-foreground').trim() || '#cccccc';

                let chartType: 'bar' | 'line' | 'pie' | 'doughnut' = 'bar';
                let datasets: any[] = [];
                let options: any = {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: horizontalBars && (selectedChartType === 'bar' || selectedChartType === 'stackedBar') ? 'y' : 'x',
                    animation: enableAnimation ? { duration: 750 } : false,
                    plugins: {
                        title: {
                            display: !!chartTitle,
                            text: chartTitle,
                            color: textColor,
                            font: { size: 14, weight: 'bold' }
                        },
                        legend: {
                            display: legendPosition !== 'hidden',
                            position: legendPosition === 'hidden' ? 'top' : legendPosition,
                            labels: {
                                color: textColor,
                                font: { size: 11 }
                            }
                        },
                        datalabels: showDataLabels ? {
                            color: textColor,
                            font: { size: 10, weight: 'bold' },
                            anchor: 'end',
                            align: 'top',
                            formatter: (value: number) => value.toLocaleString()
                        } : false
                    },
                    scales: {
                        x: {
                            ticks: { color: textColor, font: { size: 10 } },
                            grid: { display: showGridX, color: 'rgba(128, 128, 128, 0.2)' }
                        },
                        y: {
                            type: useLogScale ? 'logarithmic' : 'linear',
                            ticks: { color: textColor, font: { size: 10 } },
                            grid: { display: showGridY, color: 'rgba(128, 128, 128, 0.2)' },
                            beginAtZero: !useLogScale && yAxisMin === null,
                            min: yAxisMin !== null ? yAxisMin : undefined,
                            max: yAxisMax !== null ? yAxisMax : undefined,
                            grace: showDataLabels ? '10%' : '0%'
                        }
                    }
                };

                if (selectedChartType === 'bar') {
                    chartType = 'bar';
                    const ctx = chartCanvas.getContext('2d');
                    datasets = selectedYAxes.map((col, i) => {
                        const colorIdx = numericCols.indexOf(col);
                        const customColor = seriesColors.get(col);
                        const bgColor = customColor || defaultColors[colorIdx % defaultColors.length];
                        const border = customColor ? darkenColor(customColor) : borderColors[colorIdx % borderColors.length];
                        return {
                            label: col,
                            data: chartData.map(row => parseFloat(row[col]) || 0),
                            backgroundColor: ctx ? createGradient(ctx, colorIdx, customColor, !horizontalBars) : bgColor,
                            borderColor: border,
                            borderWidth: 2,
                            borderRadius: 6,
                            borderSkipped: false,
                        };
                    });
                    options.plugins.tooltip = {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleFont: { size: 12, weight: 'bold' },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        boxPadding: 4
                    };
                } else if (selectedChartType === 'line') {
                    chartType = 'line';
                    // Convert line style to borderDash array
                    const lineDash = lineStyle === 'dashed' ? [8, 4] : lineStyle === 'dotted' ? [2, 2] : [];
                    datasets = selectedYAxes.map((col, i) => {
                        const colorIdx = numericCols.indexOf(col);
                        const lineColor = seriesColors.get(col) || borderColors[colorIdx % borderColors.length];
                        return {
                            label: col,
                            data: chartData.map(row => parseFloat(row[col]) || 0),
                            borderColor: lineColor,
                            backgroundColor: 'transparent',
                            borderWidth: 3,
                            borderDash: lineDash,
                            tension: curveTension,
                            pointRadius: 4,
                            pointHoverRadius: 7,
                            pointStyle: pointStyle,
                            pointBackgroundColor: lineColor,
                            pointBorderColor: 'rgba(255, 255, 255, 0.9)',
                            pointBorderWidth: 2,
                            pointHoverBackgroundColor: 'white',
                            pointHoverBorderColor: lineColor,
                            pointHoverBorderWidth: 3
                        };
                    });
                    options.plugins.tooltip = {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleFont: { size: 12, weight: 'bold' },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        boxPadding: 4,
                        intersect: false,
                        mode: 'index'
                    };
                } else if (selectedChartType === 'area') {
                    chartType = 'line';
                    const ctx = chartCanvas.getContext('2d');
                    datasets = selectedYAxes.map((col, i) => {
                        const colorIdx = numericCols.indexOf(col);
                        const customColor = seriesColors.get(col);
                        const lineColor = customColor ? darkenColor(customColor) : borderColors[colorIdx % borderColors.length];
                        const fillColor = customColor || defaultColors[colorIdx % defaultColors.length];
                        return {
                            label: col,
                            data: chartData.map(row => parseFloat(row[col]) || 0),
                            borderColor: lineColor,
                            backgroundColor: ctx ? (() => {
                                const grad = ctx.createLinearGradient(0, 0, 0, 400);
                                grad.addColorStop(0, fillColor);
                                grad.addColorStop(1, fillColor.replace(/0\.\d+\)$/, '0.05)'));
                                return grad;
                            })() : fillColor,
                            fill: true,
                            borderWidth: 3,
                            tension: curveTension,
                            pointRadius: 0,
                            pointHoverRadius: 6,
                            pointHoverBackgroundColor: 'white',
                            pointHoverBorderColor: lineColor,
                            pointHoverBorderWidth: 3
                        };
                    });
                    options.plugins.tooltip = {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleFont: { size: 12, weight: 'bold' },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 8,
                        intersect: false,
                        mode: 'index'
                    };
                } else if (selectedChartType === 'stackedBar') {
                    chartType = 'bar';
                    const ctx = chartCanvas.getContext('2d');
                    datasets = selectedYAxes.map((col, i) => {
                        const colorIdx = numericCols.indexOf(col);
                        const customColor = seriesColors.get(col);
                        const bgColor = customColor || defaultColors[colorIdx % defaultColors.length];
                        const border = customColor ? darkenColor(customColor) : borderColors[colorIdx % borderColors.length];
                        return {
                            label: col,
                            data: chartData.map(row => parseFloat(row[col]) || 0),
                            backgroundColor: ctx ? createGradient(ctx, colorIdx, customColor, !horizontalBars) : bgColor,
                            borderColor: border,
                            borderWidth: 1,
                            borderRadius: 4,
                        };
                    });
                    options.scales.x.stacked = true;
                    options.scales.y.stacked = true;
                    options.plugins.tooltip = {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleFont: { size: 12, weight: 'bold' },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 8
                    };
                } else if (selectedChartType === 'pie' || selectedChartType === 'doughnut') {
                    chartType = selectedChartType as 'pie' | 'doughnut';

                    // Aggregate data by category (same logic as rebuildSlicesUI)
                    const aggregatedData: Map<string, { value: number; count: number }> = new Map();
                    currentRows.forEach((row) => {
                        // Apply date formatting if X-axis is a date column
                        const rawValue = row[selectedXAxis];
                        const sliceLabel = isXAxisDate && rawValue
                            ? formatDate(rawValue, dateFormat)
                            : String(rawValue ?? 'Unknown');
                        const existing = aggregatedData.get(sliceLabel) || { value: 0, count: 0 };

                        if (selectedPieValueColumn) {
                            existing.value += parseFloat(row[selectedPieValueColumn]) || 0;
                        }
                        existing.count += 1;
                        aggregatedData.set(sliceLabel, existing);
                    });

                    // Build visible data array, filtering hidden slices
                    const visibleData: { label: string; value: number; color: string; border: string }[] = [];
                    let colorIndex = 0;
                    aggregatedData.forEach((data, sliceLabel) => {
                        if (!hiddenSlices.has(sliceLabel)) {
                            const value = selectedPieValueColumn ? data.value : data.count;
                            const color = sliceColors.get(sliceLabel) || defaultColors[colorIndex % defaultColors.length];
                            visibleData.push({
                                label: sliceLabel,
                                value,
                                color,
                                border: darkenColor(color)
                            });
                        }
                        colorIndex++;
                    });

                    const filteredLabels = visibleData.map(d => d.label);
                    const dataValues = visibleData.map(d => d.value);
                    const bgColors = visibleData.map(d => d.color);
                    const bdColors = visibleData.map(d => d.border);
                    const total = dataValues.reduce((a, b) => a + b, 0);

                    // Override labels for pie/doughnut
                    labels.length = 0;
                    filteredLabels.forEach(l => labels.push(l));

                    datasets = [{
                        data: dataValues,
                        backgroundColor: bgColors,
                        borderColor: bdColors,
                        borderWidth: 2,
                        hoverOffset: 8,
                        hoverBorderWidth: 3,
                        hoverBorderColor: 'rgba(255, 255, 255, 0.8)'
                    }];
                    delete options.scales;
                    options.plugins.tooltip = {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleFont: { size: 12, weight: 'bold' },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (context: any) => {
                                const value = context.raw;
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ${value.toLocaleString()} (${percentage}%)`;
                            }
                        }
                    };
                    if (selectedChartType === 'doughnut') {
                        options.cutout = '60%';
                    }

                    // Add labels on slices if enabled
                    if (showLabels) {
                        options.plugins.legend = {
                            display: true,
                            position: 'right',
                            labels: {
                                color: textColor,
                                font: { size: 11 },
                                padding: 12,
                                usePointStyle: true,
                                generateLabels: (chart: any) => {
                                    const data = chart.data;
                                    if (data.labels && data.labels.length && data.datasets.length) {
                                        return data.labels.map((label: string, i: number) => {
                                            const value = data.datasets[0].data[i];
                                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                                            return {
                                                text: `${label}: ${percentage}%`,
                                                fillStyle: data.datasets[0].backgroundColor[i],
                                                strokeStyle: data.datasets[0].borderColor[i],
                                                fontColor: textColor,
                                                lineWidth: 1,
                                                hidden: false,
                                                index: i
                                            };
                                        });
                                    }
                                    return [];
                                }
                            }
                        };
                    }
                }

                // Custom data labels plugin
                const dataLabelsPlugin = {
                    id: 'customDataLabels',
                    afterDatasetsDraw: (chart: any) => {
                        if (!showDataLabels) return;

                        const ctx = chart.ctx;
                        const totalPoints = chart.data.labels?.length || 0;

                        // Hide labels if too many data points
                        if (totalPoints > 50) return;

                        // Show every Nth label based on data count to avoid overlap
                        const skipInterval = totalPoints > 30 ? 3 : totalPoints > 15 ? 2 : 1;

                        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
                            const meta = chart.getDatasetMeta(datasetIndex);
                            if (!meta.hidden) {
                                meta.data.forEach((element: any, index: number) => {
                                    // Skip labels based on interval
                                    if (index % skipInterval !== 0) return;

                                    const value = dataset.data[index];
                                    if (value === null || value === undefined) return;

                                    // Use border color of the dataset/element
                                    const borderColor = Array.isArray(dataset.borderColor)
                                        ? dataset.borderColor[index]
                                        : dataset.borderColor || textColor;

                                    ctx.save();
                                    ctx.fillStyle = borderColor;
                                    ctx.font = 'bold 10px sans-serif';
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'bottom';

                                    const position = element.tooltipPosition();
                                    const yOffset = chart.config.type === 'bar' ? -5 : -10;
                                    ctx.fillText(
                                        typeof value === 'number' ? value.toLocaleString() : String(value),
                                        position.x,
                                        position.y + yOffset
                                    );
                                    ctx.restore();
                                });
                            }
                        });
                    }
                };
                // Blur/Glow effect plugin
                const blurPlugin = {
                    id: 'blurEffect',
                    beforeDatasetsDraw: (chart: any) => {
                        if (!blurEffect) return;
                        const ctx = chart.ctx;
                        ctx.save();
                        ctx.shadowBlur = 15;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        // Use a generic glow color or specific logic
                    },
                    afterDatasetsDraw: (chart: any) => {
                        if (!blurEffect) return;
                        chart.ctx.restore();
                    },
                    beforeDatasetDraw: (chart: any, args: any) => {
                        if (!blurEffect) return;
                        const ctx = chart.ctx;
                        const dataset = args.event ? null : chart.data.datasets[args.index];
                        if (dataset) {
                            // Use the dataset color for the glow
                            const color = dataset.borderColor || dataset.backgroundColor;
                            // Check if color is an array (for pie charts)
                            ctx.shadowColor = Array.isArray(color) ? color[0] : color;
                        }
                    }
                };

                // Combine plugins
                const plugins = [dataLabelsPlugin, blurPlugin];

                chartInstance = new Chart(chartCanvas, {
                    type: chartType,
                    data: { labels, datasets },
                    options,
                    plugins
                });
            };

            // Switch tab function
            const switchTab = (tab: 'table' | 'chart') => {
                activeTab = tab;

                // Update tab styles
                [tableTab, chartTab].forEach(t => {
                    const isActive = t.dataset.tabId === tab;
                    t.style.background = isActive ? 'var(--vscode-tab-activeBackground)' : 'transparent';
                    t.style.color = isActive ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)';
                    t.style.borderBottom = isActive ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent';
                });

                // Show/hide panels
                tablePanel.style.display = tab === 'table' ? 'flex' : 'none';
                chartPanel.style.display = tab === 'chart' ? 'flex' : 'none';

                // Render chart when switching to chart tab
                if (tab === 'chart' && numericCols.length > 0) {
                    setTimeout(() => updateChart(), 50);
                }
            };

            // Only show chart tab if there are numeric columns
            if (numericCols.length === 0) {
                chartTab.style.display = 'none';
            }

            tabPanelsContainer.appendChild(tablePanel);
            tabPanelsContainer.appendChild(chartPanel);

            actionsBar.appendChild(deleteBtn);

            // Save Changes button (hidden by default)
            const saveBtn = createButton('💾 Save Changes', true);
            saveBtn.style.display = 'none';
            saveBtn.style.backgroundColor = 'var(--vscode-debugIcon-startForeground)';
            saveBtn.addEventListener('click', () => {
                if (!tableInfo || modifiedCells.size === 0) return;

                // Generate UPDATE statements for modified rows
                const updates: string[] = [];
                const modifiedRowIndices = new Set<number>();

                modifiedCells.forEach((change, key) => {
                    const dashIndex = key.indexOf('-');
                    const rowIndexStr = key.substring(0, dashIndex);
                    modifiedRowIndices.add(parseInt(rowIndexStr));
                });

                modifiedRowIndices.forEach(rowIndex => {
                    const row = currentRows[rowIndex];
                    const setClauses: string[] = [];

                    // Get all modified columns for this row
                    columns.forEach((col: string) => {
                        const cellKey = `${rowIndex}-${col}`;
                        if (modifiedCells.has(cellKey)) {
                            const { newValue } = modifiedCells.get(cellKey)!;
                            const formattedValue = formatValueForSQL(newValue, columnTypes?.[col]);
                            setClauses.push(`"${col}" = ${formattedValue}`);
                        }
                    });

                    if (setClauses.length > 0) {
                        // Build WHERE clause using primary keys
                        const whereClauses = tableInfo.primaryKeys.map((pk: string) => {
                            const pkValue = originalRows[rowIndex][pk]; // Use original row value for PK
                            const formattedPkValue = formatValueForSQL(pkValue, columnTypes?.[pk]);
                            return `"${pk}" = ${formattedPkValue}`;
                        });

                        const tableName = `"${tableInfo.schema}"."${tableInfo.table}"`;
                        updates.push(`UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')};`);
                    }
                });

                if (updates.length > 0 && context.postMessage) {
                    // Show saving state
                    saveBtn.textContent = '⏳ Saving...';
                    saveBtn.style.opacity = '0.7';
                    (saveBtn as HTMLButtonElement).disabled = true;

                    console.log('Renderer: Sending execute_update_background message', { updates, cellIndex: (json as any).cellIndex });
                    console.log('Renderer: context.postMessage is available:', !!context.postMessage);

                    const messageData = {
                        type: 'execute_update_background',
                        statements: updates,
                        cellIndex: (json as any).cellIndex
                    };
                    console.log('Renderer: Message data:', JSON.stringify(messageData));

                    try {
                        context.postMessage(messageData);
                        console.log('Renderer: postMessage called successfully');
                    } catch (err: any) {
                        console.error('Renderer: postMessage error:', err);
                    }

                    // Clear modifications after sending (kernel will handle execution)
                    modifiedCells.clear();

                    // Reset button after a short delay
                    setTimeout(() => {
                        saveBtn.textContent = '💾 Save Changes';
                        saveBtn.style.opacity = '1';
                        (saveBtn as HTMLButtonElement).disabled = false;
                        updateSaveButtonVisibility();
                        updateTable();
                    }, 1500);
                } else if (updates.length > 0) {
                    console.error('Renderer: postMessage not available');
                    // Fallback: copy to clipboard
                    const query = updates.join('\n');
                    navigator.clipboard.writeText(query).then(() => {
                        alert('postMessage not available. UPDATE statements copied to clipboard. Please execute manually.');
                    });
                }
            });
            actionsBar.appendChild(saveBtn);

            // Discard Changes button (hidden by default)
            const discardBtn = createButton('✕ Discard', false);
            discardBtn.style.display = 'none';
            discardBtn.addEventListener('click', () => {
                // Restore original values
                modifiedCells.forEach((change, key) => {
                    const dashIndex = key.indexOf('-');
                    const rowIndexStr = key.substring(0, dashIndex);
                    const colName = key.substring(dashIndex + 1);
                    const rowIndex = parseInt(rowIndexStr);
                    currentRows[rowIndex][colName] = change.originalValue;
                });
                modifiedCells.clear();
                updateSaveButtonVisibility();
                updateTable();
            });
            actionsBar.appendChild(discardBtn);

            // Helper to format value for SQL
            const formatValueForSQL = (val: any, colType?: string): string => {
                if (val === null || val === undefined || val === 'NULL') return 'NULL';
                if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
                if (typeof val === 'number') return String(val);
                if (colType) {
                    const lowerType = colType.toLowerCase();

                    // Handle UUID type
                    if (lowerType === 'uuid') {
                        return `'${String(val).replace(/'/g, "''")}'::uuid`;
                    }

                    // Handle JSON/JSONB types - need to cast explicitly
                    if (lowerType === 'json' || lowerType === 'jsonb') {
                        const jsonStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
                        return `'${jsonStr.replace(/'/g, "''")}'::${lowerType}`;
                    }

                    // Handle array types (e.g., _int4, _text, integer[], text[])
                    if (lowerType.startsWith('_') || lowerType.includes('[]')) {
                        if (Array.isArray(val)) {
                            // Format as PostgreSQL array literal: '{1,2,3}'
                            const arrayStr = val.map(v => {
                                if (v === null) return 'NULL';
                                if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
                                return String(v);
                            }).join(',');
                            return `'{${arrayStr}}'`;
                        }
                        // If it's a string representation of array, pass through
                        if (typeof val === 'string') {
                            // Convert JSON array notation to PostgreSQL array
                            if (val.startsWith('[')) {
                                try {
                                    const arr = JSON.parse(val);
                                    const arrayStr = arr.map((v: any) => {
                                        if (v === null) return 'NULL';
                                        if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
                                        return String(v);
                                    }).join(',');
                                    return `'{${arrayStr}}'`;
                                } catch {
                                    return `'${val.replace(/'/g, "''")}'`;
                                }
                            }
                            // Already in PostgreSQL format like {1,2,3}
                            if (val.startsWith('{')) {
                                return `'${val.replace(/'/g, "''")}'`;
                            }
                        }
                    }

                    // Handle numeric types
                    if (lowerType.includes('int') || lowerType === 'numeric' || lowerType === 'decimal' || lowerType === 'real' || lowerType.includes('float') || lowerType.includes('double')) {
                        const num = parseFloat(val);
                        if (!isNaN(num)) return String(num);
                    }

                    // Handle boolean types
                    if (lowerType === 'bool' || lowerType === 'boolean') {
                        return val === 'true' || val === true ? 'TRUE' : 'FALSE';
                    }
                }
                // Handle arrays without type info
                if (Array.isArray(val)) {
                    const arrayStr = val.map(v => {
                        if (v === null) return 'NULL';
                        if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
                        return String(v);
                    }).join(',');
                    return `'{${arrayStr}}'`;
                }
                // Handle objects (likely JSON) without explicit type
                if (typeof val === 'object') {
                    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
                }
                // Default: treat as string
                return `'${String(val).replace(/'/g, "''")}'`;
            };

            // Update save button visibility
            const updateSaveButtonVisibility = () => {
                const hasChanges = modifiedCells.size > 0 && tableInfo;
                saveBtn.style.display = hasChanges ? 'block' : 'none';
                discardBtn.style.display = hasChanges ? 'block' : 'none';
                if (hasChanges) {
                    saveBtn.textContent = `💾 Save Changes (${modifiedCells.size})`;
                }
            };

            contentContainer.appendChild(actionsBar);

            // Add tab bar only if there are rows
            if (currentRows.length > 0) {
                contentContainer.appendChild(tabBar);
            }

            const tableContainer = document.createElement('div');
            tableContainer.style.overflow = 'auto';
            tableContainer.style.flex = '1';
            tableContainer.style.position = 'relative';
            tableContainer.style.maxHeight = '500px'; // Limit height for scrolling within the block

            // Add tableContainer to tablePanel instead of contentContainer directly
            tablePanel.appendChild(tableContainer);

            // Add panels to container and then to contentContainer
            if (currentRows.length > 0) {
                contentContainer.appendChild(tabPanelsContainer);
            } else {
                contentContainer.appendChild(tableContainer);
            }

            const updateActionsVisibility = () => {
                actionsBar.style.display = currentRows.length > 0 ? 'flex' : 'none';
                copyBtn.style.display = selectedIndices.size > 0 ? 'block' : 'none';
                deleteBtn.style.display = selectedIndices.size > 0 ? 'block' : 'none';

                if (selectedIndices.size === currentRows.length && currentRows.length > 0) {
                    selectAllBtn.textContent = 'Deselect All';
                } else {
                    selectAllBtn.textContent = 'Select All';
                }
            };

            // Helper to get timezone abbreviation
            const getTimezoneAbbr = (date: Date): string => {
                // Try to get timezone abbreviation from toLocaleString
                const parts = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ');
                return parts[parts.length - 1] || '';
            };

            const formatValue = (val: any, colType?: string): { text: string, isNull: boolean, type: string } => {
                if (val === null) return { text: 'NULL', isNull: true, type: 'null' };
                if (typeof val === 'boolean') return { text: val ? 'TRUE' : 'FALSE', isNull: false, type: 'boolean' };
                if (typeof val === 'number') return { text: String(val), isNull: false, type: 'number' };
                if (val instanceof Date) {
                    const tz = getTimezoneAbbr(val);
                    return { text: `${val.toLocaleString()} ${tz}`, isNull: false, type: 'date' };
                }

                // Handle date/timestamp strings based on column type or string pattern
                if (typeof val === 'string' && colType) {
                    const lowerType = colType.toLowerCase();
                    // Check if it's a timestamp or date type
                    if (lowerType.includes('timestamp') || lowerType === 'timestamptz') {
                        const date = new Date(val);
                        if (!isNaN(date.getTime())) {
                            const tz = getTimezoneAbbr(date);
                            return { text: `${date.toLocaleString()} ${tz}`, isNull: false, type: 'timestamp' };
                        }
                    } else if (lowerType === 'date') {
                        const date = new Date(val);
                        if (!isNaN(date.getTime())) {
                            const tz = getTimezoneAbbr(date);
                            return { text: `${date.toLocaleDateString()} ${tz}`, isNull: false, type: 'date' };
                        }
                    } else if (lowerType === 'time' || lowerType === 'timetz') {
                        // For time-only fields, just format as time
                        // Time strings like "14:30:00" should be displayed as local time format
                        const today = new Date();
                        const timeDate = new Date(`${today.toDateString()} ${val}`);
                        if (!isNaN(timeDate.getTime())) {
                            const tz = getTimezoneAbbr(timeDate);
                            return { text: `${timeDate.toLocaleTimeString()} ${tz}`, isNull: false, type: 'time' };
                        }
                    }
                }

                // Handle JSON/JSONB types
                if (colType && (colType.toLowerCase() === 'json' || colType.toLowerCase() === 'jsonb')) {
                    return { text: JSON.stringify(val), isNull: false, type: 'json' };
                }

                if (typeof val === 'object') return { text: JSON.stringify(val), isNull: false, type: 'object' };
                return { text: String(val), isNull: false, type: 'string' };
            };

            // JSON Modal viewer
            const showJsonModal = (jsonValue: any, columnName: string) => {
                // Remove existing modal if any
                const existingModal = mainContainer.querySelector('.json-modal-overlay');
                if (existingModal) existingModal.remove();

                const overlay = document.createElement('div');
                overlay.className = 'json-modal-overlay';
                overlay.style.position = 'absolute';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.right = '0';
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
                overlay.style.zIndex = '100';
                overlay.style.padding = '8px';

                const modal = document.createElement('div');
                modal.style.backgroundColor = 'var(--vscode-editor-background)';
                modal.style.border = '1px solid var(--vscode-widget-border)';
                modal.style.borderRadius = '8px';
                modal.style.width = '100%';
                modal.style.maxHeight = '400px';
                modal.style.display = 'flex';
                modal.style.flexDirection = 'column';
                modal.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';

                // Header
                const header = document.createElement('div');
                header.style.display = 'flex';
                header.style.justifyContent = 'space-between';
                header.style.alignItems = 'center';
                header.style.padding = '12px 16px';
                header.style.borderBottom = '1px solid var(--vscode-widget-border)';
                header.style.backgroundColor = 'var(--vscode-sideBar-background)';
                header.style.borderRadius = '8px 8px 0 0';

                const titleSpan = document.createElement('span');
                titleSpan.textContent = `📋 ${columnName}`;
                titleSpan.style.fontWeight = '600';
                titleSpan.style.fontSize = '14px';

                const buttonContainer = document.createElement('div');
                buttonContainer.style.display = 'flex';
                buttonContainer.style.gap = '8px';

                const copyBtn = document.createElement('button');
                copyBtn.textContent = 'Copy';
                copyBtn.style.background = 'var(--vscode-button-background)';
                copyBtn.style.color = 'var(--vscode-button-foreground)';
                copyBtn.style.border = 'none';
                copyBtn.style.padding = '4px 12px';
                copyBtn.style.borderRadius = '4px';
                copyBtn.style.cursor = 'pointer';
                copyBtn.style.fontSize = '12px';
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(JSON.stringify(jsonValue, null, 2)).then(() => {
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => copyBtn.textContent = 'Copy', 2000);
                    });
                });

                const closeBtn = document.createElement('button');
                closeBtn.textContent = '✕';
                closeBtn.style.background = 'transparent';
                closeBtn.style.color = 'var(--vscode-foreground)';
                closeBtn.style.border = 'none';
                closeBtn.style.padding = '4px 8px';
                closeBtn.style.cursor = 'pointer';
                closeBtn.style.fontSize = '16px';
                closeBtn.style.opacity = '0.7';
                closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
                closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.7');
                closeBtn.addEventListener('click', () => overlay.remove());

                buttonContainer.appendChild(copyBtn);
                buttonContainer.appendChild(closeBtn);
                header.appendChild(titleSpan);
                header.appendChild(buttonContainer);

                // Content
                const content = document.createElement('div');
                content.style.padding = '16px';
                content.style.overflow = 'auto';
                content.style.flex = '1';

                const pre = document.createElement('pre');
                pre.style.margin = '0';
                pre.style.fontFamily = 'var(--vscode-editor-font-family)';
                pre.style.fontSize = '13px';
                pre.style.lineHeight = '1.5';
                pre.style.whiteSpace = 'pre-wrap';
                pre.style.wordBreak = 'break-word';

                // Syntax highlight the JSON
                const formattedJson = JSON.stringify(jsonValue, null, 2);
                const highlighted = formattedJson
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"([^"]+)":/g, '<span style="color: var(--vscode-symbolIcon-propertyForeground);">"$1"</span>:')
                    .replace(/: "([^"]*)"/g, ': <span style="color: var(--vscode-symbolIcon-stringForeground);">"$1"</span>')
                    .replace(/: (\d+\.?\d*)/g, ': <span style="color: var(--vscode-symbolIcon-numberForeground);">$1</span>')
                    .replace(/: (true|false)/g, ': <span style="color: var(--vscode-symbolIcon-booleanForeground);">$1</span>')
                    .replace(/: (null)/g, ': <span style="color: var(--vscode-descriptionForeground);">$1</span>');

                pre.innerHTML = highlighted;
                content.appendChild(pre);

                modal.appendChild(header);
                modal.appendChild(content);
                overlay.appendChild(modal);

                // Close on overlay click
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) overlay.remove();
                });

                // Close on Escape key
                const escHandler = (e: KeyboardEvent) => {
                    if (e.key === 'Escape') {
                        overlay.remove();
                        document.removeEventListener('keydown', escHandler);
                    }
                };
                document.addEventListener('keydown', escHandler);

                // Insert at the top of mainContainer
                mainContainer.style.position = 'relative';
                mainContainer.insertBefore(overlay, mainContainer.firstChild);
            };

            const updateTable = () => {
                tableContainer.innerHTML = '';
                // countSpan.textContent = `${currentRows.length} rows`; // Moved to header summary

                if (currentRows.length === 0) {
                    const empty = document.createElement('div');
                    empty.textContent = 'No results found';
                    empty.style.fontStyle = 'italic';
                    empty.style.opacity = '0.7';
                    empty.style.padding = '20px';
                    empty.style.textAlign = 'center';
                    tableContainer.appendChild(empty);
                    return;
                }

                const table = document.createElement('table');
                table.style.width = '100%';
                table.style.borderCollapse = 'separate';
                table.style.borderSpacing = '0';
                table.style.fontSize = '13px';
                table.style.whiteSpace = 'nowrap';
                table.style.lineHeight = '1.5';

                const thead = document.createElement('thead');
                const tbody = document.createElement('tbody');

                // Header
                const headerRow = document.createElement('tr');

                // Selection Header
                const selectTh = document.createElement('th');
                selectTh.style.width = '30px';
                selectTh.style.position = 'sticky';
                selectTh.style.top = '0';
                selectTh.style.background = 'var(--vscode-editor-background)';
                selectTh.style.borderBottom = '1px solid var(--vscode-widget-border)';
                selectTh.style.zIndex = '10';
                headerRow.appendChild(selectTh);

                columns.forEach((col: string) => {
                    const th = document.createElement('th');
                    th.style.textAlign = 'left';
                    th.style.padding = '8px 12px';
                    th.style.borderBottom = '1px solid var(--vscode-widget-border)';
                    th.style.borderRight = '1px solid var(--vscode-widget-border)';
                    th.style.fontWeight = '600';
                    th.style.color = 'var(--vscode-editor-foreground)';
                    th.style.position = 'sticky';
                    th.style.top = '0';
                    th.style.background = 'var(--vscode-editor-background)';
                    th.style.zIndex = '10';
                    th.style.userSelect = 'none';

                    // Column name container
                    const colNameContainer = document.createElement('div');
                    colNameContainer.style.display = 'flex';
                    colNameContainer.style.alignItems = 'center';
                    colNameContainer.style.gap = '4px';

                    // Column name
                    const colName = document.createElement('span');
                    colName.textContent = col;
                    colNameContainer.appendChild(colName);

                    th.appendChild(colNameContainer);

                    // Column type container (with icons and toggle for date/time)
                    if (columnTypes && columnTypes[col]) {
                        const colTypeContainer = document.createElement('div');
                        colTypeContainer.style.display = 'flex';
                        colTypeContainer.style.alignItems = 'center';
                        colTypeContainer.style.gap = '4px';
                        colTypeContainer.style.marginTop = '2px';

                        const colType = document.createElement('span');
                        colType.textContent = columnTypes[col];
                        colType.style.fontSize = '0.8em';
                        colType.style.fontWeight = '500';
                        colType.style.color = 'var(--vscode-descriptionForeground)';
                        colType.style.opacity = '0.7';
                        colTypeContainer.appendChild(colType);

                        // Primary key icon
                        const isPrimaryKey = tableInfo?.primaryKeys?.includes(col);
                        if (isPrimaryKey) {
                            const pkIcon = document.createElement('span');
                            pkIcon.textContent = '🔑';
                            pkIcon.style.fontSize = '0.85em';
                            pkIcon.title = 'Primary Key';
                            colTypeContainer.appendChild(pkIcon);
                        }

                        // Unique key icon (only if not already a primary key)
                        const isUniqueKey = tableInfo?.uniqueKeys?.includes(col);
                        if (isUniqueKey && !isPrimaryKey) {
                            const ukIcon = document.createElement('span');
                            ukIcon.textContent = '🔐';
                            ukIcon.style.fontSize = '0.85em';
                            ukIcon.title = 'Unique Key';
                            colTypeContainer.appendChild(ukIcon);
                        }

                        // Add toggle button for date/time columns
                        const lowerColType = columnTypes[col].toLowerCase();
                        const isDateTimeCol = lowerColType.includes('timestamp') || lowerColType === 'timestamptz' ||
                            lowerColType === 'date' || lowerColType === 'time' || lowerColType === 'timetz';

                        if (isDateTimeCol) {
                            // Initialize display mode if not set
                            if (!dateTimeDisplayMode.has(col)) {
                                dateTimeDisplayMode.set(col, true); // true = local time
                            }

                            const toggleBtn = document.createElement('button');
                            const isLocal = dateTimeDisplayMode.get(col);
                            toggleBtn.textContent = isLocal ? '🌐' : '🏠';
                            toggleBtn.style.background = 'var(--vscode-button-secondaryBackground)';
                            toggleBtn.style.color = 'var(--vscode-button-secondaryForeground)';
                            toggleBtn.style.border = 'none';
                            toggleBtn.style.borderRadius = '3px';
                            toggleBtn.style.padding = '1px 4px';
                            toggleBtn.style.cursor = 'pointer';
                            toggleBtn.style.fontSize = '10px';
                            toggleBtn.style.lineHeight = '1';
                            toggleBtn.title = isLocal ? 'Showing local time - Click to show original' : 'Showing original - Click to show local time';

                            toggleBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                const currentMode = dateTimeDisplayMode.get(col) ?? true;
                                dateTimeDisplayMode.set(col, !currentMode);
                                updateTable(); // Re-render the table
                            });

                            colTypeContainer.appendChild(toggleBtn);
                        }

                        th.appendChild(colTypeContainer);
                    }

                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);

                // Body
                currentRows.forEach((row: any, index: number) => {
                    const tr = document.createElement('tr');
                    tr.style.cursor = 'pointer';

                    const updateRowStyle = () => {
                        if (selectedIndices.has(index)) {
                            tr.style.background = 'var(--vscode-list-activeSelectionBackground)';
                            tr.style.color = 'var(--vscode-list-activeSelectionForeground)';
                        } else {
                            tr.style.background = index % 2 === 0 ? 'transparent' : 'var(--vscode-keybindingTable-rowsBackground)'; // Alternating colors if available, or just transparent
                            tr.style.color = 'var(--vscode-editor-foreground)';
                        }
                    };
                    updateRowStyle();

                    tr.addEventListener('click', (e) => {
                        if (e.ctrlKey || e.metaKey) {
                            if (selectedIndices.has(index)) {
                                selectedIndices.delete(index);
                            } else {
                                selectedIndices.add(index);
                            }
                        } else {
                            selectedIndices.clear();
                            selectedIndices.add(index);
                        }
                        // Re-render all rows to update selection styles (inefficient but simple for now)
                        // Optimization: just update this row and previously selected rows
                        Array.from(tbody.children).forEach((child: any, i) => {
                            const isSelected = selectedIndices.has(i);
                            if (isSelected) {
                                child.style.background = 'var(--vscode-list-activeSelectionBackground)';
                                child.style.color = 'var(--vscode-list-activeSelectionForeground)';
                            } else {
                                child.style.background = i % 2 === 0 ? 'transparent' : 'rgba(128, 128, 128, 0.04)';
                                child.style.color = 'var(--vscode-editor-foreground)';
                            }
                        });
                        updateActionsVisibility();
                    });

                    tr.addEventListener('mouseenter', () => {
                        if (!selectedIndices.has(index)) {
                            tr.style.background = 'var(--vscode-list-hoverBackground)';
                        }
                    });

                    tr.addEventListener('mouseleave', () => {
                        if (!selectedIndices.has(index)) {
                            tr.style.background = index % 2 === 0 ? 'transparent' : 'rgba(128, 128, 128, 0.04)';
                        }
                    });

                    // Selection Cell
                    const selectTd = document.createElement('td');
                    selectTd.style.borderBottom = '1px solid var(--vscode-widget-border)';
                    selectTd.style.borderRight = '1px solid var(--vscode-widget-border)';
                    selectTd.style.textAlign = 'center';
                    selectTd.style.fontSize = '10px';
                    selectTd.style.color = 'var(--vscode-descriptionForeground)';
                    selectTd.textContent = String(index + 1);
                    tr.appendChild(selectTd);

                    columns.forEach((col: string) => {
                        const td = document.createElement('td');
                        const val = row[col];
                        const colType = columnTypes ? columnTypes[col] : undefined;
                        const { text, isNull, type } = formatValue(val, colType);
                        const cellKey = `${index}-${col}`;
                        const isModified = modifiedCells.has(cellKey);

                        // Debug: Log modified cell detection
                        if (isModified) {
                            console.log('Renderer: Rendering modified cell with highlight:', cellKey);
                        }

                        td.style.padding = '6px 12px';
                        td.style.borderBottom = '1px solid var(--vscode-widget-border)';
                        td.style.borderRight = '1px solid var(--vscode-widget-border)';
                        td.style.textAlign = 'left'; // Ensure left alignment for all cells

                        // Set cursor based on editability
                        const isPrimaryKey = tableInfo?.primaryKeys?.includes(col);
                        td.style.cursor = tableInfo && !isPrimaryKey ? 'text' : 'default';
                        if (isPrimaryKey) {
                            td.style.backgroundColor = 'rgba(128, 128, 128, 0.1)';
                            td.title = 'Primary key - cannot be edited';
                        }

                        // Highlight modified cells - apply AFTER base styles and make more visible
                        if (isModified) {
                            td.style.backgroundColor = '#fff3cd'; // Brighter yellow background
                            td.style.borderLeft = '4px solid #ffc107';
                            td.style.color = '#856404'; // Darker text for contrast
                            td.setAttribute('data-modified', 'true');
                        }

                        // Function to enable editing
                        const enableEditing = (e: Event) => {
                            e.stopPropagation();
                            if (!tableInfo) return; // Only allow editing if we have table info
                            if (currentlyEditingCell === td) return; // Already editing this cell

                            // Don't allow editing primary key columns
                            if (tableInfo.primaryKeys && tableInfo.primaryKeys.includes(col)) {
                                console.log('Renderer: Cannot edit primary key column:', col);
                                return;
                            }

                            // Close any other editing cell
                            if (currentlyEditingCell) {
                                const existingInput = currentlyEditingCell.querySelector('input, textarea');
                                if (existingInput) {
                                    (existingInput as HTMLElement).blur();
                                }
                            }

                            currentlyEditingCell = td;
                            const currentValue = currentRows[index][col];
                            const isJsonType = type === 'json' || type === 'object';
                            const isBoolType = type === 'boolean';

                            td.innerHTML = '';

                            if (isBoolType) {
                                // For boolean, use a checkbox
                                const checkbox = document.createElement('input');
                                checkbox.type = 'checkbox';
                                checkbox.checked = currentValue === true;
                                checkbox.style.width = '18px';
                                checkbox.style.height = '18px';
                                checkbox.style.cursor = 'pointer';

                                checkbox.addEventListener('change', () => {
                                    const newValue = checkbox.checked;
                                    if (newValue !== originalRows[index][col]) {
                                        modifiedCells.set(cellKey, { originalValue: originalRows[index][col], newValue });
                                    } else {
                                        modifiedCells.delete(cellKey);
                                    }
                                    currentRows[index][col] = newValue;
                                    updateSaveButtonVisibility();
                                    currentlyEditingCell = null;
                                    updateTable();
                                });

                                td.appendChild(checkbox);
                                checkbox.focus();
                            } else if (isJsonType) {
                                // For JSON, use textarea
                                const textarea = document.createElement('textarea');
                                textarea.value = typeof currentValue === 'object' ? JSON.stringify(currentValue, null, 2) : (currentValue || '');
                                textarea.style.width = '100%';
                                textarea.style.minWidth = '200px';
                                textarea.style.minHeight = '80px';
                                textarea.style.padding = '4px';
                                textarea.style.border = '1px solid var(--vscode-focusBorder)';
                                textarea.style.borderRadius = '3px';
                                textarea.style.backgroundColor = 'var(--vscode-input-background)';
                                textarea.style.color = 'var(--vscode-input-foreground)';
                                textarea.style.fontFamily = 'var(--vscode-editor-font-family)';
                                textarea.style.fontSize = '12px';
                                textarea.style.resize = 'both';

                                const saveEdit = () => {
                                    let newValue: any;
                                    try {
                                        newValue = JSON.parse(textarea.value);
                                    } catch {
                                        newValue = textarea.value;
                                    }

                                    const originalValue = originalRows[index][col];
                                    if (JSON.stringify(newValue) !== JSON.stringify(originalValue)) {
                                        modifiedCells.set(cellKey, { originalValue, newValue });
                                    } else {
                                        modifiedCells.delete(cellKey);
                                    }
                                    currentRows[index][col] = newValue;
                                    updateSaveButtonVisibility();
                                    currentlyEditingCell = null;
                                    updateTable();
                                };

                                textarea.addEventListener('blur', saveEdit);
                                textarea.addEventListener('keydown', (e) => {
                                    if (e.key === 'Escape') {
                                        currentlyEditingCell = null;
                                        updateTable();
                                    }
                                });

                                td.appendChild(textarea);
                                textarea.focus();
                            } else {
                                // For other types, use input
                                const input = document.createElement('input');
                                input.type = 'text';
                                input.value = currentValue === null ? '' : String(currentValue);
                                input.style.width = '100%';
                                input.style.minWidth = '50px';
                                input.style.padding = '4px';
                                input.style.border = '1px solid var(--vscode-focusBorder)';
                                input.style.borderRadius = '3px';
                                input.style.backgroundColor = 'var(--vscode-input-background)';
                                input.style.color = 'var(--vscode-input-foreground)';
                                input.style.fontFamily = 'inherit';
                                input.style.fontSize = 'inherit';
                                input.placeholder = 'NULL';

                                const saveEdit = () => {
                                    let newValue: any = input.value;

                                    // Handle NULL
                                    if (newValue === '' || newValue.toUpperCase() === 'NULL') {
                                        newValue = null;
                                    } else if (colType) {
                                        // Try to parse based on type
                                        const lowerType = colType.toLowerCase();
                                        if (lowerType.includes('int') || lowerType === 'numeric' || lowerType === 'decimal' || lowerType === 'real' || lowerType.includes('float') || lowerType.includes('double')) {
                                            const num = parseFloat(newValue);
                                            if (!isNaN(num)) newValue = num;
                                        }
                                    }

                                    const originalValue = originalRows[index][col];
                                    // Use string comparison to handle type coercion issues
                                    const strNew = newValue === null ? 'null' : String(newValue);
                                    const strOrig = originalValue === null ? 'null' : String(originalValue);
                                    console.log('Renderer: Comparing values', { cellKey, newValue, originalValue, strNew, strOrig, isEqual: strNew === strOrig });

                                    if (strNew !== strOrig) {
                                        console.log('Renderer: Cell modified, adding to modifiedCells:', cellKey);
                                        modifiedCells.set(cellKey, { originalValue, newValue });
                                    } else {
                                        console.log('Renderer: Cell unchanged, removing from modifiedCells:', cellKey);
                                        modifiedCells.delete(cellKey);
                                    }
                                    currentRows[index][col] = newValue;
                                    console.log('Renderer: modifiedCells now has', modifiedCells.size, 'entries:', Array.from(modifiedCells.keys()));
                                    updateSaveButtonVisibility();
                                    currentlyEditingCell = null;
                                    updateTable();
                                };

                                input.addEventListener('blur', saveEdit);
                                input.addEventListener('keydown', (e) => {
                                    if (e.key === 'Enter') {
                                        saveEdit();
                                    } else if (e.key === 'Escape') {
                                        currentlyEditingCell = null;
                                        updateTable();
                                    }
                                });

                                td.appendChild(input);
                                input.focus();
                                input.select();
                            }
                        };

                        if (isNull) {
                            td.textContent = text;
                            td.style.color = 'var(--vscode-descriptionForeground)';
                            td.style.fontStyle = 'italic';
                            td.style.fontSize = '0.9em';
                            if (tableInfo) td.addEventListener('dblclick', enableEditing);
                        } else if (type === 'number') {
                            td.textContent = text;
                            td.style.fontFamily = 'var(--vscode-editor-font-family)'; // Monospace for numbers
                            if (tableInfo) td.addEventListener('dblclick', enableEditing);
                        } else if (type === 'boolean') {
                            // Custom styled checkbox for better visibility
                            const checkboxContainer = document.createElement('span');
                            checkboxContainer.style.display = 'inline-flex';
                            checkboxContainer.style.alignItems = 'center';
                            checkboxContainer.style.justifyContent = 'center';
                            checkboxContainer.style.width = '16px';
                            checkboxContainer.style.height = '16px';
                            checkboxContainer.style.borderRadius = '3px';
                            checkboxContainer.style.border = '2px solid';
                            checkboxContainer.style.fontSize = '14px';
                            checkboxContainer.style.fontWeight = 'bold';
                            checkboxContainer.style.cursor = tableInfo ? 'pointer' : 'default';

                            if (val) {
                                checkboxContainer.style.backgroundColor = '#498f56ff';
                                checkboxContainer.style.borderColor = '#51aa61ff';
                                checkboxContainer.style.color = '#ffffff';
                                checkboxContainer.textContent = '✓';
                            } else {
                                checkboxContainer.style.backgroundColor = 'transparent';
                                checkboxContainer.style.borderColor = '#6e7681';
                                checkboxContainer.style.color = 'transparent';
                                checkboxContainer.textContent = '';
                            }

                            // Allow clicking to toggle boolean
                            if (tableInfo) {
                                checkboxContainer.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const newValue = !val;
                                    if (newValue !== originalRows[index][col]) {
                                        modifiedCells.set(cellKey, { originalValue: originalRows[index][col], newValue });
                                    } else {
                                        modifiedCells.delete(cellKey);
                                    }
                                    currentRows[index][col] = newValue;
                                    updateSaveButtonVisibility();
                                    updateTable();
                                });
                            }

                            td.appendChild(checkboxContainer);
                        } else if (type === 'json' || type === 'object') {
                            // Create a clickable JSON preview
                            const jsonContainer = document.createElement('div');
                            jsonContainer.style.display = 'flex';
                            jsonContainer.style.alignItems = 'center';
                            jsonContainer.style.gap = '6px';

                            const jsonIcon = document.createElement('span');
                            jsonIcon.textContent = '{ }';
                            jsonIcon.style.backgroundColor = 'var(--vscode-badge-background)';
                            jsonIcon.style.color = 'var(--vscode-badge-foreground)';
                            jsonIcon.style.padding = '2px 6px';
                            jsonIcon.style.borderRadius = '4px';
                            jsonIcon.style.fontSize = '10px';
                            jsonIcon.style.fontWeight = '600';
                            jsonIcon.style.fontFamily = 'var(--vscode-editor-font-family)';
                            jsonIcon.style.cursor = 'pointer';
                            jsonIcon.title = 'Click to view JSON';

                            // Only the icon opens the modal
                            jsonIcon.addEventListener('click', (e) => {
                                e.stopPropagation();
                                showJsonModal(val, col);
                            });

                            // Hover effect for icon
                            jsonIcon.addEventListener('mouseenter', () => {
                                jsonIcon.style.opacity = '0.8';
                            });
                            jsonIcon.addEventListener('mouseleave', () => {
                                jsonIcon.style.opacity = '1';
                            });

                            const preview = document.createElement('span');
                            // Create a truncated preview
                            const jsonStr = typeof val === 'string' ? val : JSON.stringify(val);
                            const maxLen = 50;
                            preview.textContent = jsonStr.length > maxLen ? jsonStr.substring(0, maxLen) + '...' : jsonStr;
                            preview.style.fontFamily = 'var(--vscode-editor-font-family)';
                            preview.style.fontSize = '12px';
                            preview.style.color = 'var(--vscode-editor-foreground)';
                            preview.style.overflow = 'hidden';
                            preview.style.textOverflow = 'ellipsis';
                            preview.style.whiteSpace = 'nowrap';
                            preview.style.maxWidth = '200px';

                            jsonContainer.appendChild(jsonIcon);
                            jsonContainer.appendChild(preview);

                            td.appendChild(jsonContainer);

                            // Double-click on the cell (not just container) to edit
                            if (tableInfo) {
                                td.addEventListener('dblclick', enableEditing);
                                td.title = 'Double-click to edit';
                            }
                        } else if (type === 'timestamp' || type === 'date' || type === 'time') {
                            // Date/Time - use column-level display mode
                            const showLocal = dateTimeDisplayMode.get(col) ?? true;
                            const originalValue = String(val); // The raw value from database

                            td.textContent = showLocal ? text : originalValue;
                            td.style.fontFamily = 'var(--vscode-editor-font-family)';

                            if (tableInfo) td.addEventListener('dblclick', enableEditing);
                        } else {
                            td.textContent = text;
                            if (tableInfo) td.addEventListener('dblclick', enableEditing);
                        }

                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });

                table.appendChild(thead);
                table.appendChild(tbody);
                tableContainer.appendChild(table);
            };

            updateTable();
            updateActionsVisibility(); // Ensure visibility is updated initially
            element.appendChild(mainContainer);
        }
    };
};
