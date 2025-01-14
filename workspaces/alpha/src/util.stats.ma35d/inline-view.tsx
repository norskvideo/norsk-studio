import { useEffect, useRef, useState } from "react";
import type { Ma35DStatsOutputState, Ma35DStatsOutputSettings } from "./runtime";

import Chart from 'chart.js/auto';

function InlineView({ state, config: _2 }: { state: Ma35DStatsOutputState, config: Ma35DStatsOutputSettings }) {
  const chartContainer = useRef<HTMLCanvasElement>(null);

  const [chartControl, setChartControl] = useState<Chart | undefined>(undefined);

  function makeDataSet(key: string, color: string, values: number[]) {
    return {
      label: key,
      fill: false,
      borderColor: color,
      borderWidth: 1,
      pointStyle: 'dash',
      data: values
    }
  }

  function makeData(state: Ma35DStatsOutputState) {
    return {
      labels: new Array(state.decoder.length).fill(0).map((_, i) => i).map((_) => ""),
      datasets: [makeDataSet("decoder", 'rgba(255, 0, 0, 255)', state.decoder),
      makeDataSet("scaler", 'rgba(0, 255, 0, 255)', state.scaler),
      makeDataSet("encoder", 'rgba(0, 0, 255, 255)', state.encoder)]
    }
  }

  useEffect(() => {
    if (!chartContainer.current) return;

    Chart.defaults.color = "#FFF";

    const chart = new Chart(chartContainer.current, {
      type: 'line',
      options: {
        plugins: {
          legend: {
            display: true
          },
        },
        animation: false,
        color: '#FFF',
        scales: {
          x: {
            min: 0,
            max: 200,
            grid: {
              display: false,
            }
          },
          y: {
            min: 0,
            max: 100,
            grid: {
              display: false,
            }
          }
        }
      },
      data: makeData(state)
    })
    setChartControl(chart);

    setInterval(() => {
      chart.update()
    }, 100)
  }, [chartContainer])

  useEffect(() => {
    if (!chartControl) return;
    chartControl.data = makeData(state);
  }, [state])

  return <div className="bg-gray-50 dark:bg-gray-700 rounded" style={{ width: "360px", height: '200px', padding: '10px' }}>
    <canvas className="bg-gray-50 dark:bg-gray-700 rounded" ref={chartContainer} >

    </canvas>
  </div>
}

export default InlineView;
