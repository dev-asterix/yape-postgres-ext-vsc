import { DEFAULT_COLORS, BORDER_COLORS } from './ChartRenderer';
import { ChartRenderOptions } from '../../../common/types';
import { isDateColumn, formatDate, rgbaToHex, hexToRgba, getNumericColumns } from '../../utils/formatting';

export interface ChartControlsProps {
  columns: string[];
  rows: any[];
  onConfigChange: (config: ChartRenderOptions) => void;
}

export class ChartControls {
  private container: HTMLElement;
  private props: ChartControlsProps;

  // State
  private selectedChartType: string = 'bar';
  private selectedXAxis: string;
  private selectedYAxis: string[] = [];
  private selectedPieValueCol: string = '';

  // Options
  private chartTitle = '';
  private legendPosition = 'bottom';
  private showGridX = true;
  private showGridY = true;
  private enableAnimation = true; // Not used in RenderOptions directly but useful for Renderer if we passed it? 
  // Actually Renderer has 'animation' option.
  private yAxisMin: number | null = null;
  private yAxisMax: number | null = null;
  private useLogScale = false;
  private sortBy = 'none';
  private limitRows: number | null = null;
  private horizontalBars = false;
  private lineStyle = 'solid';
  private pointStyle = 'circle';
  private curveTension = 0.4;
  private showDataLabels = false;
  private blurEffect = false;

  // Pie specific
  private hiddenSlices = new Set<string>();
  private sliceColors = new Map<string, string>();
  private seriesColors = new Map<string, string>(); // For bar/line/area

  // UI Refs
  private slicesContainer!: HTMLElement;
  private yAxisSection!: HTMLElement;
  private valuesSection!: HTMLElement;
  private slicesSection!: HTMLElement;

  constructor(container: HTMLElement, props: ChartControlsProps) {
    this.container = container;
    this.props = props;

    // Defaults
    this.selectedXAxis = props.columns[0] || '';
    const numericCols = getNumericColumns(props.columns, props.rows);
    if (numericCols.length > 0) {
      this.selectedYAxis = [numericCols[0]];
      this.selectedPieValueCol = numericCols[0];
    }

    this.createUI();
    this.emitConfig();
  }

  // Should be called if data changes
  public updateProps(newProps: Partial<ChartControlsProps>) {
    this.props = { ...this.props, ...newProps };
    // Re-validate selections
    if (!this.props.columns.includes(this.selectedXAxis)) this.selectedXAxis = this.props.columns[0] || '';
    // Re-render UI chunks if needed
    this.rebuildSlicesUI();
  }

  private createUI() {
    this.container.innerHTML = '';
    this.container.style.cssText = 'display: flex; flex-direction: column; gap: 12px; height: 100%; overflow-y: auto; padding-right: 4px;';

    // 1. Chart Type Selection
    const typeSection = this.createSection('Chart Type');
    const typeSelect = document.createElement('select');
    typeSelect.style.cssText = 'width: 100%; padding: 4px; margin-bottom: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 11px;';

    [['bar', '📊 Bar Chart'], ['line', '📈 Line Chart'], ['area', '🗻 Area Chart'],
    ['pie', '🥧 Pie Chart'], ['doughnut', '🍩 Doughnut'], ['stackedBar', '📚 Stacked Bar']]
      .forEach(([val, text]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = text;
        if (val === this.selectedChartType) opt.selected = true;
        typeSelect.appendChild(opt);
      });

    typeSelect.onchange = () => {
      this.selectedChartType = typeSelect.value;
      this.updateSectionsVisibility();
      this.emitConfig();
    };
    typeSection.appendChild(typeSelect);
    this.container.appendChild(typeSection);

    // 2. X-Axis Selection
    const axisSection = this.createSection('Axes');
    const xLabel = document.createElement('label');
    xLabel.textContent = 'X-Axis (Category/Time)';
    xLabel.style.cssText = 'font-size: 11px; display: block; margin-bottom: 3px; opacity: 0.8;';
    axisSection.appendChild(xLabel);

    const xSelect = document.createElement('select');
    xSelect.style.cssText = 'width: 100%; padding: 4px; margin-bottom: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 11px;';
    this.props.columns.forEach(col => {
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col;
      if (col === this.selectedXAxis) opt.selected = true;
      xSelect.appendChild(opt);
    });
    xSelect.onchange = () => {
      this.selectedXAxis = xSelect.value;
      this.rebuildSlicesUI(); // Slices depend on X-Axis labels
      this.emitConfig();
    };
    axisSection.appendChild(xSelect);
    this.container.appendChild(axisSection);

    // 3. Y-Axis Section (for non-pie)
    this.yAxisSection = document.createElement('div');
    const yLabel = document.createElement('label');
    yLabel.textContent = 'Y-Axis (Values)';
    yLabel.style.cssText = 'font-size: 11px; display: block; margin-bottom: 3px; opacity: 0.8;';
    this.yAxisSection.appendChild(yLabel);

    const numericCols = getNumericColumns(this.props.columns, this.props.rows);
    const yContainer = document.createElement('div');
    yContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px; max-height: 150px; overflow-y: auto; padding: 4px; border: 1px solid var(--vscode-widget-border); border-radius: 3px;';

    if (numericCols.length === 0) {
      yContainer.textContent = 'No numeric columns found';
      yContainer.style.padding = '8px';
      yContainer.style.fontStyle = 'italic';
      yContainer.style.opacity = '0.7';
    } else {
      numericCols.forEach((col, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 6px;';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this.selectedYAxis.includes(col);
        cb.onchange = () => {
          if (cb.checked) {
            if (!this.selectedYAxis.includes(col)) this.selectedYAxis.push(col);
          } else {
            this.selectedYAxis = this.selectedYAxis.filter(c => c !== col);
          }
          // Color picker visibility? 
          // For simplicity, re-render Y-axis list if we want to show/hide color pickers dynamically
          // or just always show them.
          this.emitConfig();
        };

        const span = document.createElement('span');
        span.textContent = col;
        span.style.flex = '1';

        // Color Picker for series
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        // Default color logic matching Renderer
        const defaultColor = DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
        colorPicker.value = rgbaToHex(this.seriesColors.get(col) || defaultColor);
        colorPicker.style.cssText = 'width: 16px; height: 16px; border: none; cursor: pointer; padding: 0;';
        colorPicker.oninput = () => {
          this.seriesColors.set(col, hexToRgba(colorPicker.value, 0.6));
          this.emitConfig();
        };

        row.appendChild(cb);
        row.appendChild(span);
        row.appendChild(colorPicker);
        yContainer.appendChild(row);
      });
    }
    this.yAxisSection.appendChild(yContainer);
    this.container.appendChild(this.yAxisSection);

    // 4. Values Section (for Pie)
    this.valuesSection = document.createElement('div');
    this.valuesSection.style.display = 'none'; // Hidden by default
    const vLabel = document.createElement('label');
    vLabel.textContent = 'Value Column (Size)';
    vLabel.style.cssText = 'font-size: 11px; display: block; margin-bottom: 3px; opacity: 0.8;';
    this.valuesSection.appendChild(vLabel);

    const vSelect = document.createElement('select');
    vSelect.style.cssText = 'width: 100%; padding: 4px; margin-bottom: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 11px;';

    // Option for "Count of Rows"
    const countOpt = document.createElement('option');
    countOpt.value = '';
    countOpt.textContent = 'Count of Rows';
    vSelect.appendChild(countOpt);

    numericCols.forEach(col => {
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col;
      if (col === this.selectedPieValueCol) opt.selected = true;
      vSelect.appendChild(opt);
    });
    vSelect.onchange = () => {
      this.selectedPieValueCol = vSelect.value;
      this.rebuildSlicesUI();
      this.emitConfig();
    };
    this.valuesSection.appendChild(vSelect);
    this.container.appendChild(this.valuesSection);

    // 5. Slices Section (Pie)
    this.slicesSection = this.createSection('Slices');
    this.slicesSection.style.display = 'none';
    this.slicesContainer = document.createElement('div');
    this.slicesContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto;';
    this.slicesSection.appendChild(this.slicesContainer);
    this.container.appendChild(this.slicesSection);

    // 6. General Options
    const optionsSection = this.createSection('⚙️ Options');
    const optsContainer = document.createElement('div');
    optsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    const createRow = (label: string, elem: HTMLElement) => {
      const r = document.createElement('div');
      r.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 6px;';
      const l = document.createElement('span');
      l.textContent = label;
      l.style.cssText = 'font-size: 11px; flex-shrink: 0;';
      r.appendChild(l);
      elem.style.cssText += 'flex: 1; max-width: 100px;';
      r.appendChild(elem);
      return r;
    };

    // Title
    const titleInput = document.createElement('input');
    titleInput.placeholder = 'Chart title...';
    titleInput.style.cssText = 'padding: 4px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 11px;';
    titleInput.oninput = () => { this.chartTitle = titleInput.value; this.emitConfig(); };
    optsContainer.appendChild(createRow('Title', titleInput));

    // Legend
    const legSelect = document.createElement('select');
    legSelect.style.cssText = 'padding: 3px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 11px;';
    ['top', 'bottom', 'left', 'right', 'hidden'].forEach(p => legSelect.add(new Option(p, p, p === this.legendPosition)));
    legSelect.onchange = () => { this.legendPosition = legSelect.value; this.emitConfig(); };
    optsContainer.appendChild(createRow('Legend', legSelect));

    // Sorting
    const sortSelect = document.createElement('select');
    sortSelect.style.cssText = 'padding: 3px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 10px;';
    [['none', 'None'], ['label-asc', 'Label ↑'], ['label-desc', 'Label ↓'], ['value-asc', 'Value ↑'], ['value-desc', 'Value ↓']].forEach(([v, t]) => sortSelect.add(new Option(t, v)));
    sortSelect.onchange = () => { this.sortBy = sortSelect.value; this.emitConfig(); };
    optsContainer.appendChild(createRow('Sort', sortSelect));

    optionsSection.appendChild(optsContainer);
    this.container.appendChild(optionsSection);

    this.updateSectionsVisibility();
  }

  // Helpers
  private createSection(title: string) {
    const div = document.createElement('div');
    div.style.cssText = 'border-top: 1px solid var(--vscode-panel-border); padding-top: 10px;';
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-weight: 600; margin-bottom: 8px; font-size: 11px; text-transform: uppercase; opacity: 0.8;';
    div.appendChild(h);
    return div;
  }

  private updateSectionsVisibility() {
    const isPie = this.selectedChartType === 'pie' || this.selectedChartType === 'doughnut';
    this.yAxisSection.style.display = isPie ? 'none' : 'block';
    this.valuesSection.style.display = isPie ? 'block' : 'none';
    this.slicesSection.style.display = isPie ? 'block' : 'none';
    if (isPie) this.rebuildSlicesUI();
  }

  private rebuildSlicesUI() {
    this.slicesContainer.innerHTML = '';
    if (this.props.rows.length === 0) return;

    const isXDate = isDateColumn(this.selectedXAxis);
    const aggregated = new Map<string, { value: number; count: number }>();
    this.props.rows.forEach(row => {
      const raw = row[this.selectedXAxis];
      const label = isXDate && raw ? formatDate(raw, 'YYYY-MM-DD') : String(raw ?? 'Unknown');
      const exist = aggregated.get(label) || { value: 0, count: 0 };
      if (this.selectedPieValueCol) exist.value += parseFloat(row[this.selectedPieValueCol]) || 0;
      exist.count++;
      aggregated.set(label, exist);
    });

    const sliceData: { label: string; value: number; index: number }[] = [];
    let i = 0;
    let total = 0;
    aggregated.forEach((val, label) => {
      const v = this.selectedPieValueCol ? val.value : val.count;
      sliceData.push({ label, value: v, index: i++ });
      if (!this.hiddenSlices.has(label)) total += v;
    });

    sliceData.forEach(({ label, value, index }) => {
      if (!this.sliceColors.has(label)) this.sliceColors.set(label, DEFAULT_COLORS[index % DEFAULT_COLORS.length]);

      const isHidden = this.hiddenSlices.has(label);
      const pct = total > 0 && !isHidden ? ((value / total) * 100).toFixed(1) : '0.0';

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 2px 0;';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !isHidden;
      cb.onchange = () => {
        if (cb.checked) this.hiddenSlices.delete(label); else this.hiddenSlices.add(label);
        this.rebuildSlicesUI(); // Update percentages
        this.emitConfig();
      };

      const span = document.createElement('span');
      span.textContent = isHidden ? label : `${label} (${pct}%)`;
      span.style.cssText = `flex: 1; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${isHidden ? 'opacity: 0.5' : ''}`;

      const color = document.createElement('input');
      color.type = 'color';
      color.value = rgbaToHex(this.sliceColors.get(label)!);
      color.style.cssText = 'width: 16px; height: 16px; border: none; padding: 0; cursor: pointer;';
      color.oninput = () => {
        this.sliceColors.set(label, hexToRgba(color.value, 0.85));
        this.emitConfig();
      };

      row.append(cb, span, color);
      this.slicesContainer.appendChild(row);
    });
  }

  private emitConfig() {
    const config: ChartRenderOptions = {
      type: this.selectedChartType,
      xAxisCol: this.selectedXAxis,
      yAxisCols: this.selectedYAxis,
      numericCols: getNumericColumns(this.props.columns, this.props.rows),
      sortBy: this.sortBy,
      limitRows: this.limitRows || undefined,
      dateFormat: 'YYYY-MM-DD',
      useLogScale: this.useLogScale,
      showGridX: this.showGridX,
      showGridY: this.showGridY,
      showDataLabels: this.showDataLabels,
      showLabels: true,
      chartTitle: this.chartTitle,
      legendPosition: this.legendPosition,
      horizontalBars: this.horizontalBars,
      curveTension: this.curveTension,
      lineStyle: this.lineStyle,
      pointStyle: this.pointStyle,
      blurEffect: this.blurEffect,
      hiddenSlices: this.hiddenSlices,
      selectedPieValueCol: this.selectedPieValueCol,
      seriesColors: this.seriesColors,
      sliceColors: this.sliceColors,
      textColor: '#ccc' // Ideally detect theme but defaulting for now
    };
    this.props.onConfigChange(config);
  }
}
