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
