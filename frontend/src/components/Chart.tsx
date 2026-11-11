import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/esm/core';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export interface ChartClickParams {
  name?: string;
  dataIndex?: number;
  seriesType?: string;
}

export function Chart({
  option,
  height,
  onClick,
  ariaLabel,
}: {
  option: Record<string, unknown>;
  height: number;
  onClick?: (params: ChartClickParams) => void;
  /** Text alternative for the canvas, read by screen readers. */
  ariaLabel?: string;
}) {
  // ReactEChartsCore does not forward aria props to its div, so the wrapper carries them.
  // pan-y keeps a vertical swipe on the canvas as a page scroll. ZRender otherwise sets
  // touch-action: none, which would also block the long-press that lifts a tile.
  return (
    <div className="chart-pan" role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        notMerge
        lazyUpdate
        style={{ height, width: '100%', touchAction: 'pan-y' }}
        opts={{ renderer: 'canvas' }}
        onEvents={onClick ? { click: onClick } : undefined}
        onChartReady={(chart) => {
          const zr = chart.getZr() as { painter?: { getViewportRoot?: () => HTMLElement } };
          const root = zr.painter?.getViewportRoot?.();
          if (!root) return;
          root.style.touchAction = 'pan-y';
          root.querySelectorAll('canvas').forEach((canvas) => {
            canvas.style.touchAction = 'pan-y';
          });
        }}
      />
    </div>
  );
}
