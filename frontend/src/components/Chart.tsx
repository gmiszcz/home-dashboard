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
}: {
  option: Record<string, unknown>;
  height: number;
  onClick?: (params: ChartClickParams) => void;
}) {
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      lazyUpdate
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      onEvents={onClick ? { click: onClick } : undefined}
    />
  );
}
