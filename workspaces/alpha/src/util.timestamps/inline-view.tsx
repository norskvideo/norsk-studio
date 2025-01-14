import { useEffect, useRef, useState } from "react";
import type { TimestampOutputState, TimestampOutputSettings } from "./runtime";

import Chart from 'chart.js/auto';

function InlineView({ state, config: _2 }: { state: TimestampOutputState, config: TimestampOutputSettings }) {
  const chartContainer = useRef<HTMLCanvasElement>(null);

  const [chartControl, setChartControl] = useState<Chart | undefined>(undefined);

  useEffect(() => {
    if (!chartContainer.current) return;
    if (state.timestamps.length < 2) return;
    // if (state.timestamps.find((i) => i.timestamps.length < 200)) return;


    Chart.defaults.color = "#FFF";

    // console.log("Creating chart");
    const chart = new Chart(chartContainer.current, {
      type: 'line',
      options: {
        plugins: {
          legend: {
            display: false
          },
        },
        // spanGaps: true,
        animation: false,
        // backgroundColor: 'rgba(0,0,0, 255)',
        color: '#FFF',
        // borderColor: '#FFF',
        // aspectRatio: 1,
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
            max: 5000,
            grid: {
              display: false,
            }
          }
        }
      },
      data: {
        labels: new Array(200).fill(0).map((_, i) => i).map((_) => ""),
        datasets: state.timestamps.map((t) => {
          const mapped = (t.timestamps.map((f) => {
            const elapsedWall = (f.wall - t.startTimeMs)
            const elapsedTime = (f.ts - t.startTimestamp) * 1000.0;
            return Math.abs(elapsedTime - elapsedWall);
          }))
          return {
            label: t.key,
            fill: false,
            borderColor: 'rgba(255, 0, 0, 255)',
            borderWidth: 1,
            pointStyle: 'dash',
            // backgroundColor: 'rgba(255, 128, 128, 255)',
            data: mapped
          }
        })
      }
    })
    setChartControl(chart);

    setInterval(() => {
      chart.update()
    }, 100)
  }, [chartContainer])


  useEffect(() => {
    if (!chartControl) return;
    chartControl.data = {
      labels: new Array(200).fill(0).map((_, i) => i).map((_) => ""),
      datasets: state.timestamps.map((t) => {
        const mapped = (t.timestamps.map((f) => {
          const elapsedWall = (f.wall - t.startTimeMs)
          const elapsedTime = (f.ts - t.startTimestamp) * 1000.0;
          return Math.abs(elapsedTime - elapsedWall);
        }))
        return {
          label: t.key,
          fill: false,
          borderColor: 'rgba(255, 0, 0, 255)',
          borderWidth: 1,
          pointStyle: 'dash',
          // backgroundColor: 'rgba(255, 128, 128, 255)',
          data: mapped
        }
      })
    }
  }, [state])

  return <div className="bg-gray-50 dark:bg-gray-700 rounded" style={{ width: "360px", height: '200px', padding: '10px' }}>
    <canvas className="bg-gray-50 dark:bg-gray-700 rounded" ref={chartContainer} >

    </canvas>
  </div>
}

export default InlineView;
