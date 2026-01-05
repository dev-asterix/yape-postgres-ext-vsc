
/**
 * Detect numeric columns in the dataset
 */
export function getNumericColumns(columns: string[], rows: any[]): string[] {
  return columns.filter(col => {
    // Check first few non-null rows
    const sampleSize = Math.min(rows.length, 50);
    let isNumeric = true;
    let hasValue = false;

    for (let i = 0; i < sampleSize; i++) {
      const val = rows[i][col];
      if (val !== null && val !== undefined && val !== '') {
        hasValue = true;
        if (isNaN(Number(val))) {
          isNumeric = false;
          break;
        }
      }
    }

    return hasValue && isNumeric;
  });
}

/**
 * Check if a column name suggests it contains date/time data
 */
export function isDateColumn(col: string, columnTypes?: Record<string, string>): boolean {
  if (columnTypes && columnTypes[col]) {
    const type = columnTypes[col].toLowerCase();
    return type.includes('date') || type.includes('time') || type.includes('timestamp');
  }

  // Fallback to name heuristic
  const lower = col.toLowerCase();
  return lower.includes('date') ||
    lower.includes('time') ||
    lower.includes('created') ||
    lower.includes('updated') ||
    lower.includes('at') ||
    lower === 'day' ||
    lower === 'month' ||
    lower === 'year';
}

/**
 * Get timezone abbreviation from date
 */
export function getTimezoneAbbr(date: Date): string {
  try {
    const parts = date.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ');
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

/**
 * Format date value with custom format string
 */
export function formatDate(value: any, format: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);

  const pad = (n: number, len: number = 2) => String(n).padStart(len, '0');

  const formatMap: Record<string, string | number> = {
    'YYYY': date.getFullYear(),
    'MM': pad(date.getMonth() + 1),
    'DD': pad(date.getDate()),
    'HH': pad(date.getHours()),
    'mm': pad(date.getMinutes()),
    'ss': pad(date.getSeconds()),
    'SSS': pad(date.getMilliseconds(), 3),
    'TZ': getTimezoneAbbr(date)
  };

  return format.replace(/YYYY|MM|DD|HH|mm|ss|SSS|TZ/g, match => String(formatMap[match]));
}

/**
 * Format value for SQL statement usage
 */
export function formatValueForSQL(val: any, colType?: string): string {
  if (val === null) return 'NULL';

  // Handle specific types if known
  if (colType) {
    const type = colType.toLowerCase();
    if (type.includes('int') || type.includes('float') || type.includes('numeric') || type.includes('decimal')) {
      return String(val); // No quotes for numbers
    }
    if (type === 'boolean' || type === 'bool') {
      return String(val); // true/false
    }
  }

  // Default handling based on JS type
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);

  // String handling - escape single quotes
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Format value with detailed type info (for Table Renderer)
 */
export function formatValue(val: any, colType?: string): { text: string, isNull: boolean, type: string } {
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
}

/**
 * Helper helpers for color conversion
 */
export function rgbaToHex(rgba: string): string {
  const parts = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)/);
  if (parts) {
    const r = parseInt(parts[1]).toString(16).padStart(2, '0');
    const g = parseInt(parts[2]).toString(16).padStart(2, '0');
    const b = parseInt(parts[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return rgba; // Return as is if not matching format
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Create gradient for canvas
 */
export function createGradient(ctx: CanvasRenderingContext2D, colorIndex: number, customColor?: string, isVertical: boolean = true) {
  const colors = [
    ['rgba(54, 162, 235, 0.6)', 'rgba(54, 162, 235, 0.1)'], // Blue
    ['rgba(255, 99, 132, 0.6)', 'rgba(255, 99, 132, 0.1)'], // Red
    ['rgba(75, 192, 192, 0.6)', 'rgba(75, 192, 192, 0.1)'], // Teal
    ['rgba(255, 206, 86, 0.6)', 'rgba(255, 206, 86, 0.1)'], // Yellow
    ['rgba(153, 102, 255, 0.6)', 'rgba(153, 102, 255, 0.1)'], // Purple
    ['rgba(255, 159, 64, 0.6)', 'rgba(255, 159, 64, 0.1)']  // Orange
  ];

  const [startColor, endColor] = customColor
    ? [customColor, customColor.replace(/[\d.]+\)$/, '0.1)')]
    : colors[colorIndex % colors.length];

  const gradient = isVertical
    ? ctx.createLinearGradient(0, 0, 0, 400)
    : ctx.createLinearGradient(0, 0, 400, 0);

  gradient.addColorStop(0, startColor);
  gradient.addColorStop(1, endColor);

  return gradient;
}

export function darkenColor(rgba: string): string {
  return rgba.replace(/[\d.]+\)$/, '0.8)');
}
