import { DashboardStats } from './DashboardData';

export function getLoadingHtml() {
    return `<!DOCTYPE html>
    <html>
        <body style="background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); display: flex; justify-content: center; align-items: center; height: 100vh;">
            <h2>Loading Dashboard...</h2>
        </body>
    </html>`;
}

export function getErrorHtml(error: string) {
    return `<!DOCTYPE html>
    <html>
        <body style="background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 20px;">
            <h2>Error Loading Dashboard</h2>
            <p>${error}</p>
        </body>
    </html>`;
}

export function getHtmlForWebview(stats: DashboardStats) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            :root {
                --bg-color: var(--vscode-editor-background);
                --text-color: var(--vscode-editor-foreground);
                --card-bg: var(--vscode-editor-background);
                --border-color: var(--vscode-widget-border);
                --accent-color: var(--vscode-textLink-foreground);
                --hover-bg: var(--vscode-list-hoverBackground);
                --danger-color: var(--vscode-errorForeground);
                --secondary-text: var(--vscode-descriptionForeground);
                --font-family: var(--vscode-font-family);
                --shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
                --card-radius: 16px;
                --card-border: 1px solid rgba(128, 128, 128, 0.15);
            }
            body {
                background-color: var(--bg-color);
                color: var(--text-color);
                font-family: var(--font-family);
                padding: 40px;
                margin: 0;
                line-height: 1.6;
            }
            
            /* Fluid Layout */
            .header {
                margin-bottom: 48px;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
            }
            .header-title h1 {
                font-size: 2em;
                font-weight: 300;
                margin: 0 0 8px 0;
                letter-spacing: -0.5px;
                background: linear-gradient(120deg, var(--text-color), var(--secondary-text));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                font-weight: 500;
            }
            .header-meta {
                color: var(--secondary-text);
                font-size: 0.95em;
                display: flex;
                gap: 24px;
                font-weight: 400;
            }
            
            /* Controls */
            .header-controls {
                display: flex;
                align-items: center;
                gap: 16px;
            }

            .btn-icon {
                background: var(--card-bg);
                color: var(--text-color);
                border: var(--card-border);
                padding: 8px 16px;
                border-radius: 20px;
                cursor: pointer;
                font-family: var(--font-family);
                font-size: 0.9em;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: var(--shadow);
            }
            .btn-icon:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.1);
                border-color: var(--accent-color);
            }
            
            select.minimal-select {
                background-color: var(--card-bg);
                color: var(--text-color);
                border: var(--card-border);
                padding: 8px 16px;
                border-radius: 20px;
                font-family: var(--font-family);
                font-size: 0.9em;
                outline: none;
                cursor: pointer;
                appearance: none;
                -webkit-appearance: none;
                box-shadow: var(--shadow);
                transition: all 0.3s ease;
            }
            select.minimal-select:hover {
                border-color: var(--accent-color);
                transform: translateY(-2px);
            }

            /* Cards */
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 32px;
                margin-bottom: 56px;
            }
            
            .card {
                border: var(--card-border);
                border-radius: var(--card-radius);
                background: var(--card-bg);
                padding: 28px;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: var(--shadow);
                position: relative;
                overflow: hidden;
            }
            /* Stylish partial border effect */
            .card::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                border-radius: var(--card-radius);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
                pointer-events: none;
            }
            .card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 4px;
                background: linear-gradient(90deg, var(--accent-color), transparent);
                opacity: 0.5;
            }
            .card.clickable {
                cursor: pointer;
            }
            .card.clickable:hover {
                transform: translateY(-4px);
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
                border-color: var(--accent-color);
            }
            .card h3 {
                margin: 0 0 16px 0;
                font-size: 0.8em;
                font-weight: 600;
                color: var(--secondary-text);
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .card .value {
                font-size: 2.5em;
                font-weight: 400;
                color: var(--text-color);
                letter-spacing: -1px;
            }

            /* Charts */
            .charts-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
                gap: 32px;
                margin-bottom: 56px;
            }
            .chart-container {
                background-color: var(--card-bg);
                padding: 32px;
                border-radius: var(--card-radius);
                height: 350px;
                border: var(--card-border);
                box-shadow: var(--shadow);
                position: relative;
            }
            .chart-title {
                font-size: 1em;
                color: var(--secondary-text);
                margin-bottom: 24px;
                font-weight: 500;
                letter-spacing: 0.5px;
            }

            /* Tables */
            .section {
                margin-bottom: 56px;
            }
            .section-header {
                font-size: 1.2em;
                font-size: 1.2em;
                font-weight: 500;
                margin-bottom: 32px;
                color: var(--text-color);
                letter-spacing: -0.5px;
            }

            table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 0.95em;
            }
            th {
                text-align: left;
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color);
                color: var(--secondary-text);
                font-weight: 500;
                font-size: 0.85em;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            td {
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color);
                color: var(--text-color);
                transition: background-color 0.2s;
            }
            tr:last-child td {
                border-bottom: none;
            }
            tr:hover td {
                background-color: var(--hover-bg);
            }

            .btn-small {
                background: color-mix(in srgb, var(--danger-color), transparent 85%);
                color: var(--danger-color);
                border: 1px solid var(--danger-color);
                padding: 6px 12px;
                border-radius: 12px;
                cursor: pointer;
                font-size: 0.85em;
                transition: all 0.2s;
                font-weight: 500;
            }
            .btn-small:hover {
                opacity: 1;
                background-color: var(--danger-color);
                color: var(--bg-color);
            }

            .query-text {
                font-family: 'Courier New', monospace;
                color: var(--secondary-text);
                max-width: 450px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            /* Detail View */
            #detail-view {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: var(--bg-color);
                padding: 40px;
                z-index: 100;
                overflow-y: auto;
            }
            /* Media Queries */
            @media (max-width: 768px) {
                body {
                    padding: 24px;
                }
                .header {
                    flex-direction: column;
                    gap: 16px;
                }
                .header-controls {
                    width: 100%;
                    justify-content: flex-start;
                }
                .grid {
                    gap: 16px;
                    margin-bottom: 32px;
                }
                .charts-grid {
                    grid-template-columns: 1fr;
                    gap: 24px;
                }
                .chart-container {
                    padding: 16px;
                    height: 300px;
                }
            }
            .back-link {
                color: var(--secondary-text);
                cursor: pointer;
                font-size: 1em;
                margin-bottom: 32px;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                text-decoration: none;
                border: none;
                background: none;
                padding: 0;
                transition: color 0.2s;
            }
            .back-link:hover {
                color: var(--text-color);
            }
        </style>
    </head>
    <body>
        <div id="main-view">
            <div class="header">
                <div class="header-title">
                    <h1>${stats.dbName}</h1>
                    <div class="header-meta">
                        <span>Owner: ${stats.owner}</span>
                        <span>Size: ${stats.size}</span>
                    </div>
                </div>
                <div class="header-controls">
                    <button id="refresh-btn" class="btn-icon" onclick="manualRefresh()">
                        <span>↻</span> Refresh
                    </button>
                    <select id="refresh-interval" class="minimal-select" onchange="updateRefreshInterval()">
                        <option value="5000">5s</option>
                        <option value="10000">10s</option>
                        <option value="30000">30s</option>
                        <option value="60000" selected>60s</option>
                        <option value="0">Off</option>
                    </select>
                </div>
            </div>

            <div class="grid">
                <div class="card">
                    <h3>Active Connections</h3>
                    <div class="value">${stats.activeConnections}</div>
                </div>
                <div class="card">
                    <h3>Total Connections</h3>
                    <div class="value">${stats.totalConnections}</div>
                </div>
                <div class="card">
                    <h3>Extensions</h3>
                    <div class="value">${stats.extensionCount}</div>
                </div>
                <div class="card">
                    <h3>Commit Ratio</h3>
                    <div class="value">${stats.metrics.xact_commit > 0 ? Math.round((stats.metrics.xact_commit / (stats.metrics.xact_commit + stats.metrics.xact_rollback)) * 100) : 0}%</div>
                </div>
            </div>

            <div class="grid">
                <div class="card clickable" onclick="showDetails('tables')">
                    <h3>Tables</h3>
                    <div class="value">${stats.objectCounts.tables}</div>
                </div>
                <div class="card clickable" onclick="showDetails('views')">
                    <h3>Views</h3>
                    <div class="value">${stats.objectCounts.views}</div>
                </div>
                <div class="card clickable" onclick="showDetails('functions')">
                    <h3>Functions</h3>
                    <div class="value">${stats.objectCounts.functions}</div>
                </div>
                <div class="card">
                    <h3>Schemas</h3>
                    <div class="value">${stats.objectCounts.schemas}</div>
                </div>
            </div>

            <div class="charts-grid">
                <div class="chart-container">
                    <div class="chart-title">Connections History</div>
                    <canvas id="connectionsHistoryChart"></canvas>
                </div>
                <div class="chart-container">
                    <div class="chart-title">Throughput (TPS)</div>
                    <canvas id="throughputChart"></canvas>
                </div>
            </div>

            <div class="charts-grid">
                <div class="chart-container">
                    <div class="chart-title">I/O Operations</div>
                    <canvas id="ioChart"></canvas>
                </div>
            </div>

            <div class="section">
                <div class="section-header">Active Queries</div>
                <div style="overflow-x: auto;">
                    <table id="active-queries-table">
                        <thead>
                            <tr>
                                <th>PID</th>
                                <th>User</th>
                                <th>State</th>
                                <th>Start Time</th>
                                <th>Duration</th>
                                <th>Query</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${stats.activeQueries.length > 0 ? stats.activeQueries.map(q => `
                                <tr>
                                    <td>${q.pid}</td>
                                    <td>${q.usename}</td>
                                    <td>${q.state}</td>
                                    <td>${q.startTime}</td>
                                    <td>${q.duration}</td>
                                    <td class="query-text" title="${q.query.replace(/"/g, '&quot;')}">${q.query.substring(0, 100)}${q.query.length > 100 ? '...' : ''}</td>
                                    <td style="text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                                        <button class="btn-small" onclick="cancelQuery(${q.pid})">Cancel</button>
                                        <button class="btn-small" onclick="terminateQuery(${q.pid})">Kill</button>
                                    </td>
                                </tr>
                            `).join('') : '<tr><td colspan="7" style="text-align:center; color: var(--secondary-text);">No active queries</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="section">
                <div class="section-header">Locks & Blocking</div>
                <div style="overflow-x: auto;">
                    <table id="locks-table">
                        <thead>
                            <tr>
                                <th>Blocked PID</th>
                                <th>Blocked User</th>
                                <th>Blocking PID</th>
                                <th>Blocking User</th>
                                <th>Lock Mode</th>
                                <th>Object</th>
                                <th>Blocked Query</th>
                                <th>Blocking Query</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${stats.blockingLocks.length > 0 ? stats.blockingLocks.map(l => `
                                <tr>
                                    <td>${l.blocked_pid}</td>
                                    <td>${l.blocked_user}</td>
                                    <td>${l.blocking_pid}</td>
                                    <td>${l.blocking_user}</td>
                                    <td>${l.lock_mode}</td>
                                    <td>${l.locked_object}</td>
                                    <td class="query-text" title="${l.blocked_query.replace(/"/g, '&quot;')}">${l.blocked_query.substring(0, 100)}...</td>
                                    <td class="query-text" title="${l.blocking_query.replace(/"/g, '&quot;')}">${l.blocking_query.substring(0, 100)}...</td>
                                </tr>
                            `).join('') : '<tr><td colspan="8" style="text-align:center; color: var(--secondary-text);">No blocking locks detected</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <div id="detail-view">
            <button class="back-link" onclick="hideDetails()">← Back to Dashboard</button>
            <h2 id="detail-title" style="font-weight: 500; font-size: 1.5em; margin-bottom: 32px;">Details</h2>
            <div id="detail-content"></div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            
            // Theme colors
            const style = getComputedStyle(document.body);
            const textColor = style.getPropertyValue('--text-color').trim();
            const secondaryText = style.getPropertyValue('--secondary-text').trim();
            const borderColor = style.getPropertyValue('--border-color').trim();
            const accentColor = style.getPropertyValue('--accent-color').trim();
            
            // Pastel Color Palette
            const colors = {
                primary: 'rgba(96, 165, 250, 0.8)',   // Blue 400
                success: 'rgba(52, 211, 153, 0.8)',   // Emerald 400
                warning: 'rgba(251, 191, 36, 0.8)',   // Amber 400
                danger: 'rgba(248, 113, 113, 0.8)',   // Red 400
                info: 'rgba(34, 211, 238, 0.8)',      // Cyan 400
                purple: 'rgba(167, 139, 250, 0.8)',   // Violet 400
                grid: 'rgba(128, 128, 128, 0.05)'
            };

            const fills = {
                primary: 'rgba(96, 165, 250, 0.15)',
                success: 'rgba(52, 211, 153, 0.15)',
                warning: 'rgba(251, 191, 36, 0.15)',
                danger: 'rgba(248, 113, 113, 0.15)',
                info: 'rgba(34, 211, 238, 0.15)',
                purple: 'rgba(167, 139, 250, 0.15)'
            };

            Chart.defaults.color = secondaryText;
            Chart.defaults.borderColor = colors.grid;
            Chart.defaults.font.family = 'var(--font-family)';
            
            // Common Chart Options
            const commonOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: textColor,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 20,
                            font: {
                                size: 12,
                                weight: 500
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        boxPadding: 4,
                        titleFont: {
                            weight: 'bold'
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxTicksLimit: 8,
                            color: secondaryText
                        }
                    },
                    y: {
                        grid: {
                            borderDash: [4, 4],
                            color: colors.grid
                        },
                        beginAtZero: true,
                        ticks: {
                            color: secondaryText
                        }
                    }
                },
                elements: {
                    line: {
                        tension: 0.4,
                        borderWidth: 2
                    },
                    point: {
                        radius: 0,
                        hitRadius: 20,
                        hoverRadius: 6,
                        hoverBorderWidth: 2
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                }
            };

            // Initialize Charts
            
            // History Data
            const maxHistory = 30;
            const initialTime = new Date().toLocaleTimeString();
            let historyLabels = [initialTime];
            let activeConnHistory = [${stats.activeConnections}];
            let idleConnHistory = [${stats.idleConnections}];
            // Initialize rates with 0 as we need a delta for real values
            let tpsCommitHistory = [0];
            let tpsRollbackHistory = [0];
            let ioReadHistory = [0];
            let ioHitHistory = [0];
            
            let lastMetrics = {
                timestamp: Date.now(),
                xact_commit: ${stats.metrics.xact_commit},
                xact_rollback: ${stats.metrics.xact_rollback},
                blks_read: ${stats.metrics.blks_read},
                blks_hit: ${stats.metrics.blks_hit}
            };

            // Connections History Chart
            const connectionsHistoryChart = new Chart(document.getElementById('connectionsHistoryChart'), {
                type: 'line',
                data: {
                    labels: historyLabels,
                    datasets: [
                        { 
                            label: 'Active', 
                            data: activeConnHistory, 
                            borderColor: colors.success,
                            backgroundColor: fills.success,
                            fill: true 
                        },
                        { 
                            label: 'Idle', 
                            data: idleConnHistory, 
                            borderColor: colors.warning,
                            backgroundColor: fills.warning,
                            fill: true 
                        }
                    ]
                },
                options: commonOptions
            });

            // Throughput Chart
            const throughputChart = new Chart(document.getElementById('throughputChart'), {
                type: 'line',
                data: {
                    labels: historyLabels,
                    datasets: [
                        { 
                            label: 'Commit/s', 
                            data: tpsCommitHistory, 
                            borderColor: colors.primary,
                            backgroundColor: fills.primary,
                            fill: true
                        },
                        { 
                            label: 'Rollback/s', 
                            data: tpsRollbackHistory, 
                            borderColor: colors.danger,
                            backgroundColor: fills.danger,
                            fill: true
                        }
                    ]
                },
                options: commonOptions
            });

            // I/O Chart
            const ioChart = new Chart(document.getElementById('ioChart'), {
                type: 'line',
                data: {
                    labels: historyLabels,
                    datasets: [
                        { 
                            label: 'Reads/s', 
                            data: ioReadHistory, 
                            borderColor: colors.purple,
                            backgroundColor: fills.purple,
                            fill: true
                        },
                        { 
                            label: 'Hits/s', 
                            data: ioHitHistory, 
                            borderColor: colors.info,
                            backgroundColor: fills.info,
                            fill: true
                        }
                    ]
                },
                options: commonOptions
            });

            let refreshIntervalId;
            
            function startAutoRefresh(interval) {
                if (refreshIntervalId) clearInterval(refreshIntervalId);
                if (interval > 0) {
                    refreshIntervalId = setInterval(() => {
                        vscode.postMessage({ command: 'refresh' });
                    }, interval);
                }
            }

            function manualRefresh() {
                vscode.postMessage({ command: 'refresh' });
            }

            function updateRefreshInterval() {
                const select = document.getElementById('refresh-interval');
                const interval = parseInt(select.value);
                startAutoRefresh(interval);
            }

            // Start with default 60s
            startAutoRefresh(60000);

            // Handle messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'updateStats':
                        updateDashboard(message.stats);
                        break;
                    case 'showDetails':
                        renderDetails(message.type, message.data, message.columns);
                        break;
                }
            });

            function escapeHtml(text) {
                if (!text) return '';
                return text.replace(/"/g, '&quot;');
            }

            function updateDashboard(stats) {
                // Update History Charts
                const now = new Date().toLocaleTimeString();
                const currentTimestamp = Date.now();
                const timeDiff = (currentTimestamp - lastMetrics.timestamp) / 1000; // seconds

                if (timeDiff > 0) {
                    // Calculate rates
                    const commitRate = (stats.metrics.xact_commit - lastMetrics.xact_commit) / timeDiff;
                    const rollbackRate = (stats.metrics.xact_rollback - lastMetrics.xact_rollback) / timeDiff;
                    const readRate = (stats.metrics.blks_read - lastMetrics.blks_read) / timeDiff;
                    const hitRate = (stats.metrics.blks_hit - lastMetrics.blks_hit) / timeDiff;

                    // Update History Arrays
                    if (historyLabels.length >= maxHistory) {
                        historyLabels.shift();
                        activeConnHistory.shift();
                        idleConnHistory.shift();
                        tpsCommitHistory.shift();
                        tpsRollbackHistory.shift();
                        ioReadHistory.shift();
                        ioHitHistory.shift();
                    }

                    historyLabels.push(now);
                    activeConnHistory.push(stats.activeConnections);
                    idleConnHistory.push(stats.idleConnections);
                    // Ensure rates aren't negative (e.g. if DB restarted)
                    tpsCommitHistory.push(Math.max(0, commitRate));
                    tpsRollbackHistory.push(Math.max(0, rollbackRate));
                    ioReadHistory.push(Math.max(0, readRate));
                    ioHitHistory.push(Math.max(0, hitRate));

                    // Update Charts
                    connectionsHistoryChart.update();
                    throughputChart.update();
                    ioChart.update();

                    // Update Last Metrics
                    lastMetrics = {
                        timestamp: currentTimestamp,
                        xact_commit: stats.metrics.xact_commit,
                        xact_rollback: stats.metrics.xact_rollback,
                        blks_read: stats.metrics.blks_read,
                        blks_hit: stats.metrics.blks_hit
                    };
                }
                
                // Update Active Queries Table
                const queriesTbody = document.querySelector('#active-queries-table tbody');
                if (stats.activeQueries && stats.activeQueries.length > 0) {
                    queriesTbody.innerHTML = stats.activeQueries.map(q => 
                        '<tr>' +
                        '<td>' + q.pid + '</td>' +
                        '<td>' + q.usename + '</td>' +
                        '<td>' + q.state + '</td>' +
                        '<td>' + q.startTime + '</td>' +
                        '<td>' + q.duration + '</td>' +
                        '<td class="query-text" title="' + escapeHtml(q.query) + '">' + q.query.substring(0, 100) + (q.query.length > 100 ? '...' : '') + '</td>' +
                        '<td style="text-align: right; display: flex; justify-content: flex-end; gap: 8px;">' +
                            '<button class="btn-small" onclick="cancelQuery(' + q.pid + ')">Cancel</button>' +
                            '<button class="btn-small" onclick="terminateQuery(' + q.pid + ')">Kill</button>' +
                        '</td>' +
                        '</tr>'
                    ).join('');
                } else {
                    queriesTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--secondary-text);">No active queries</td></tr>';
                }

                // Update Locks Table
                const locksTbody = document.querySelector('#locks-table tbody');
                if (stats.blockingLocks && stats.blockingLocks.length > 0) {
                    locksTbody.innerHTML = stats.blockingLocks.map(l => 
                        '<tr>' +
                        '<td>' + l.blocked_pid + '</td>' +
                        '<td>' + l.blocked_user + '</td>' +
                        '<td>' + l.blocking_pid + '</td>' +
                        '<td>' + l.blocking_user + '</td>' +
                        '<td>' + l.lock_mode + '</td>' +
                        '<td>' + l.locked_object + '</td>' +
                        '<td class="query-text" title="' + escapeHtml(l.blocked_query) + '">' + l.blocked_query.substring(0, 100) + '...</td>' +
                        '<td class="query-text" title="' + escapeHtml(l.blocking_query) + '">' + l.blocking_query.substring(0, 100) + '...</td>' +
                        '</tr>'
                    ).join('');
                } else {
                    locksTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--secondary-text);">No blocking locks detected</td></tr>';
                }
            }

            function showDetails(type) {
                vscode.postMessage({ command: 'showDetails', type });
            }

            function hideDetails() {
                document.getElementById('detail-view').style.display = 'none';
                document.getElementById('main-view').style.display = 'block';
            }

            function renderDetails(type, data, columns) {
                const container = document.getElementById('detail-content');
                document.getElementById('detail-title').textContent = type.charAt(0).toUpperCase() + type.slice(1);
                
                let html = '<table><thead><tr>';
                columns.forEach(col => html += '<th>' + col + '</th>');
                html += '</tr></thead><tbody>';
                
                data.forEach(row => {
                    html += '<tr>';
                    Object.values(row).forEach(val => html += '<td>' + (val || '') + '</td>');
                    html += '</tr>';
                });
                html += '</tbody></table>';
                
                container.innerHTML = html;
                document.getElementById('main-view').style.display = 'none';
                document.getElementById('detail-view').style.display = 'block';
            }

            function terminateQuery(pid) {
                console.log('Terminating query:', pid);
                vscode.postMessage({ command: 'terminateQuery', pid });
            }

            function cancelQuery(pid) {
                console.log('Cancelling query:', pid);
                vscode.postMessage({ command: 'cancelQuery', pid });
            }
        </script>
    </body>
    </html>`;
}
