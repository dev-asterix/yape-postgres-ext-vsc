import { createButton } from '../components/ui';

export const createAiButtons = (
  context: any,
  columns: string[],
  rows: any[],
  query: string | undefined,
  command: string | undefined,
  executionTime: number | undefined
) => {
  const analyzeBtn = createButton('📊  Analyze Data with AI', true);
  analyzeBtn.title = 'Send data to AI for analysis';
  analyzeBtn.addEventListener('click', () => {
    // Automatically analyze first 50 rows to avoid UI complexity
    const limit = 50;
    const dataSample = rows.slice(0, limit);

    // Convert to CSV for AI
    const header = columns.join(',');
    const csvRows = dataSample.map((row: any) =>
      columns.map((col: string) => {
        const val = row[col];
        if (typeof val === 'object') return JSON.stringify(val).replace(/,/g, ';');
        return String(val).replace(/,/g, ';');
      }).join(',')
    ).join('\n');

    const csv = `${header}\n${csvRows}`;

    context.postMessage?.({
      type: 'analyzeData',
      data: csv,
      query: query || command || 'result set',
      rowCount: rows.length
    });
  });

  const optimizeBtn = createButton('⚡ Optimize', true);
  optimizeBtn.title = 'Get performance suggestions for this query';
  optimizeBtn.addEventListener('click', () => {
    context.postMessage?.({
      type: 'optimizeQuery',
      query: query || command || 'result set',
      executionTime: executionTime
    });
  });

  return { analyzeBtn, optimizeBtn };
};
