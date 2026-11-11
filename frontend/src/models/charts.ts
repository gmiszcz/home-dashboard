import { formatMoney } from '../format';

/** Matches the dashboard tokens in index.css (amber, teal, cream on ink). */
export const chartTheme = {
  text: '#f3efe6',
  muted: '#b7b1a6',
  amber: '#e2a53a',
  teal: '#7dcea0',
  ink: '#151c25',
  edge: 'rgba(243, 239, 230, 0.12)',
  out: '#e2a53a',
  in: '#7dcea0',
};

const CATEGORY_COLORS: Record<string, string> = {
  spożywcze: '#7dcea0',
  drogeria: '#c4b5fd',
  paliwo: '#e07a5f',
  'jedzenie na mieście': '#e2a53a',
  'zakupy online': '#7eb6d6',
  subskrypcje: '#f2cc8f',
  przelewy: '#81b29a',
  'dom i dziecko': '#e9c46a',
  inne: '#b7b1a6',
};

const PALETTE = ['#e2a53a', '#7dcea0', '#7eb6d6', '#e07a5f', '#c4b5fd', '#f2cc8f', '#81b29a', '#e9c46a', '#b7b1a6'];

export function categoryColor(category: string, index: number): string {
  return CATEGORY_COLORS[category] ?? PALETTE[index % PALETTE.length];
}

export function chartTooltip(currency?: string) {
  return {
    backgroundColor: chartTheme.ink,
    borderColor: chartTheme.edge,
    textStyle: { color: chartTheme.text, fontSize: 12 },
    valueFormatter: (value: number) =>
      currency && Number.isFinite(value) ? formatMoney(value, currency) : String(value),
  };
}

export function expensePieOption(
  slices: { category: string; amount: number; color: string }[],
  currency: string,
) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', ...chartTooltip(currency) },
    series: [
      {
        type: 'pie',
        radius: ['44%', '88%'],
        center: ['50%', '50%'],
        label: { show: false },
        labelLine: { show: false },
        data: slices.map((slice) => ({
          name: slice.category,
          value: slice.amount,
          itemStyle: { color: slice.color },
        })),
      },
    ],
  };
}

/** Polish text alternative for an expenses chart: the total plus the largest category or day. */
export function expenseChartLabel(
  mode: 'category' | 'day',
  week: {
    total: number | null;
    byCategory: { category: string; amount: number }[];
    byDay: { label: string; amount: number }[];
  },
  currency: string,
): string {
  const parts = [mode === 'category' ? 'Wydatki według kategorii' : 'Wydatki według dni'];
  if (week.total !== null) parts.push(`razem ${formatMoney(week.total, currency)}`);
  const rows =
    mode === 'category'
      ? week.byCategory.map((slice) => ({ name: slice.category, amount: slice.amount }))
      : week.byDay.map((day) => ({ name: day.label, amount: day.amount }));
  const top = rows.reduce<(typeof rows)[number] | null>(
    (best, row) => (best && best.amount >= row.amount ? best : row),
    null,
  );
  if (top) {
    const noun = mode === 'category' ? 'największa kategoria' : 'największy dzień';
    parts.push(`${noun}: ${top.name} ${formatMoney(top.amount, currency)}`);
  }
  return `${parts.join(', ')}.`;
}

export function expenseBarOption(
  days: { label: string; amount: number }[],
  currency: string,
) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...chartTooltip(currency) },
    grid: { left: 4, right: 4, top: 16, bottom: 22 },
    xAxis: {
      type: 'category',
      data: days.map((day) => day.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: chartTheme.edge } },
      axisLabel: { color: chartTheme.muted, fontSize: 11 },
    },
    yAxis: { type: 'value', show: false },
    series: [
      {
        type: 'bar',
        data: days.map((day) => day.amount),
        itemStyle: { color: chartTheme.amber, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 28,
      },
    ],
  };
}

export function financeBarOption(
  days: { label: string; out: number; in: number }[],
  currency: string,
) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...chartTooltip(currency) },
    legend: {
      show: true,
      top: 0,
      right: 0,
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: chartTheme.muted, fontSize: 11 },
    },
    grid: { left: 4, right: 4, top: 28, bottom: 22 },
    xAxis: {
      type: 'category',
      data: days.map((day) => day.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: chartTheme.edge } },
      axisLabel: { color: chartTheme.muted, fontSize: 10 },
    },
    yAxis: { type: 'value', show: false },
    series: [
      {
        name: 'wydatki',
        type: 'bar',
        data: days.map((day) => day.out),
        itemStyle: { color: chartTheme.out, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 14,
      },
      {
        name: 'wpływy',
        type: 'bar',
        data: days.map((day) => day.in),
        itemStyle: { color: chartTheme.in, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 14,
      },
    ],
  };
}

/** `horizontal` draws bars sideways. `vertical` (and false) keeps the payslip columns. */
export type BarOrientation = 'vertical' | 'horizontal';

export function isHorizontalBar(orientation: BarOrientation | boolean): boolean {
  return orientation === true || orientation === 'horizontal';
}

/** Tooltip text for a column. `note` is appended, for example the electricity estimate marker. */
export function formatBarTooltip(value: number, asPercent: boolean, currency: string, note?: string): string {
  const text = asPercent ? `${value.toFixed(1).replace('.', ',')}%` : formatMoney(value, currency);
  return note ? `${text} · ${note}` : text;
}

export function payslipBarOption(
  lines: { label: string; amount: number; color: string }[],
  currency: string,
  asPercent: boolean,
  whole: number,
  orientation: BarOrientation | boolean = 'vertical',
  tooltipNote?: string,
) {
  const horizontal = isHorizontalBar(orientation);
  const valueOf = (amount: number) => (asPercent ? (whole ? (amount / whole) * 100 : 0) : amount);
  const values = lines.map((line) => ({
    value: valueOf(line.amount),
    itemStyle: {
      color: line.color,
      borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
    },
  }));
  const valueAxis = {
    type: 'value' as const,
    show: false,
    ...(asPercent ? { max: Math.max(100, ...values.map((row) => row.value), 0) } : {}),
  };
  const categoryAxis = {
    type: 'category' as const,
    data: lines.map((line) => line.label),
    inverse: horizontal,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: chartTheme.edge } },
    axisLabel: {
      color: chartTheme.muted,
      fontSize: horizontal ? 11 : 10,
      interval: 0,
      rotate: !horizontal && lines.length > 6 ? 40 : 0,
      width: horizontal ? 108 : undefined,
      overflow: horizontal ? 'truncate' : 'none',
    },
  };
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      ...chartTooltip(asPercent ? undefined : currency),
      confine: true,
      valueFormatter: (value: number) => formatBarTooltip(value, asPercent, currency, tooltipNote),
    },
    grid: horizontal
      ? { left: 116, right: 12, top: 8, bottom: 8 }
      : { left: 4, right: 8, top: 16, bottom: lines.length > 6 ? 64 : 28 },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: [
      {
        type: 'bar',
        data: values,
        barMaxWidth: horizontal ? 16 : 36,
      },
    ],
  };
}

export function payslipHistoryOption(
  points: { label: string; gross: number | null; net: number | null }[],
  currency: string,
) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', ...chartTooltip(currency) },
    legend: {
      show: true,
      top: 0,
      right: 0,
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: chartTheme.muted, fontSize: 11 },
    },
    grid: { left: 4, right: 8, top: 26, bottom: 22 },
    xAxis: {
      type: 'category',
      data: points.map((point) => point.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: chartTheme.edge } },
      axisLabel: { color: chartTheme.muted, fontSize: 10 },
    },
    yAxis: { type: 'value', show: false, scale: true },
    series: [
      {
        name: 'brutto',
        type: 'line',
        data: points.map((point) => point.gross),
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: chartTheme.amber, width: 2 },
        itemStyle: { color: chartTheme.amber },
      },
      {
        name: 'na konto',
        type: 'line',
        data: points.map((point) => point.net),
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: chartTheme.teal, width: 2 },
        itemStyle: { color: chartTheme.teal },
      },
    ],
  };
}

export interface TrendTooltipRow {
  seriesName?: string;
  axisValueLabel?: string;
  value?: number | null;
}

function formatKwhNumber(value: number): string {
  return `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(value)} kWh`;
}

/** Dual-axis month chart: kWh bars and cost line. The text includes the estimate marker. */
export function energyTrendTooltip(params: unknown): string {
  const rows: TrendTooltipRow[] = Array.isArray(params) ? params : params ? [params as TrendTooltipRow] : [];
  const title = rows[0]?.axisValueLabel ?? '';
  const body = rows.map((row) => {
    const value = typeof row.value === 'number' ? row.value : null;
    if (value === null) return `${row.seriesName ?? 'seria'}: —`;
    if (row.seriesName === 'kWh') return `kWh: ${formatKwhNumber(value)}`;
    return `koszt: ${formatMoney(value)}`;
  });
  return [`${title} · szacunek`, ...body].join('<br/>');
}

export function energyTrendOption(
  months: { label: string; kwh: number; total: number }[],
  currency: string,
) {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: chartTheme.ink,
      borderColor: chartTheme.edge,
      textStyle: { color: chartTheme.text, fontSize: 12 },
      confine: true,
      formatter: (params: unknown) => energyTrendTooltip(params),
    },
    legend: {
      show: true,
      top: 0,
      right: 0,
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: chartTheme.muted, fontSize: 11 },
    },
    grid: { left: 42, right: 48, top: 28, bottom: months.length > 8 ? 52 : 28 },
    xAxis: {
      type: 'category',
      data: months.map((month) => month.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: chartTheme.edge } },
      axisLabel: {
        color: chartTheme.muted,
        fontSize: 10,
        interval: 0,
        rotate: months.length > 8 ? 40 : 0,
      },
    },
    yAxis: [
      {
        type: 'value',
        name: 'kWh',
        nameTextStyle: { color: chartTheme.muted, fontSize: 10 },
        axisLabel: { color: chartTheme.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: chartTheme.edge } },
      },
      {
        type: 'value',
        name: currency === 'PLN' ? 'zł' : currency,
        nameTextStyle: { color: chartTheme.muted, fontSize: 10 },
        axisLabel: { color: chartTheme.muted, fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'kWh',
        type: 'bar',
        yAxisIndex: 0,
        data: months.map((month) => month.kwh),
        itemStyle: { color: chartTheme.teal, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 18,
      },
      {
        name: 'koszt',
        type: 'line',
        yAxisIndex: 1,
        data: months.map((month) => month.total),
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: chartTheme.amber, width: 2 },
        itemStyle: { color: chartTheme.amber },
      },
    ],
  };
}

/** Axis around the invoice prices so a move from 1,20 to 1,46 is visible, not a flat line above zero. */
export function energyPriceScale(prices: number[]): { min: number; max: number } {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = Math.max((max - min) * 0.45, 0.04);
  return {
    min: Math.round((min - pad) * 100) / 100,
    max: Math.round((max + pad) * 100) / 100,
  };
}

/** Unit price per invoice period. Not an estimate: gross total divided by kWh. */
export function energyPriceOption(points: { label: string; price: number }[]) {
  const scale = energyPriceScale(points.map((point) => point.price));
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: chartTheme.ink,
      borderColor: chartTheme.edge,
      textStyle: { color: chartTheme.text, fontSize: 12 },
      confine: true,
      valueFormatter: (value: number) => `${value.toFixed(2).replace('.', ',')} zł/kWh`,
    },
    grid: { left: 8, right: 8, top: 28, bottom: points.length > 5 ? 48 : 24 },
    xAxis: {
      type: 'category',
      data: points.map((point) => point.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: chartTheme.edge } },
      axisLabel: {
        color: chartTheme.muted,
        fontSize: 10,
        interval: 0,
        rotate: points.length > 4 ? 30 : 0,
      },
    },
    yAxis: { type: 'value', show: false, min: scale.min, max: scale.max },
    series: [
      {
        name: 'zł/kWh',
        type: 'line',
        data: points.map((point) => point.price),
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { color: chartTheme.amber, width: 2 },
        itemStyle: { color: chartTheme.amber },
        label: {
          show: true,
          position: 'top',
          color: chartTheme.muted,
          fontSize: 10,
          formatter: (params: { value?: number }) =>
            typeof params.value === 'number' ? params.value.toFixed(2).replace('.', ',') : '',
        },
      },
    ],
  };
}

export function sparklineOption(prices: number[], threshold: number | null) {
  const bounds = threshold === null ? prices : [...prices, threshold];
  const min = Math.min(...bounds);
  const max = Math.max(...bounds);
  const pad = (max - min) * 0.2 || 1;
  return {
    animation: false,
    grid: { left: 0, right: 0, top: 6, bottom: 4 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: prices.map((_, index) => index) },
    yAxis: { type: 'value', show: false, min: min - pad, max: max + pad },
    tooltip: { show: false },
    series: [
      {
        type: 'line',
        data: prices,
        symbol: prices.length === 1 ? 'circle' : 'none',
        symbolSize: 6,
        lineStyle: { color: chartTheme.teal, width: 1.5 },
        itemStyle: { color: chartTheme.teal },
        areaStyle: { color: 'rgba(125, 206, 160, 0.16)' },
        markLine:
          threshold === null
            ? undefined
            : {
                silent: true,
                symbol: 'none',
                label: { show: false },
                lineStyle: { type: 'dashed', color: chartTheme.amber, width: 1 },
                data: [{ yAxis: threshold }],
              },
      },
    ],
  };
}
