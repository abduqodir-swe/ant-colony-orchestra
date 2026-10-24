// Host metrics for the office "System" card: CPU, RAM and disk of the machine running the agents.

import { statfsSync } from 'node:fs';
import { cpus, freemem, totalmem } from 'node:os';

let prev = cpuTimes();

function cpuTimes() {
  return cpus().reduce(
    (acc, c) => {
      const t = c.times;
      acc.idle += t.idle;
      acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
      return acc;
    },
    { idle: 0, total: 0 },
  );
}

export function sampleHost(diskPath: string) {
  const cur = cpuTimes();
  const dTotal = cur.total - prev.total;
  const cpu = dTotal > 0 ? 100 * (1 - (cur.idle - prev.idle) / dTotal) : 0;
  prev = cur;
  const ram = 100 * (1 - freemem() / totalmem());
  let disk = 0;
  try {
    const s = statfsSync(diskPath);
    disk = 100 * (1 - s.bavail / s.blocks);
  } catch {
    // statfs is unavailable on some platforms; report 0 rather than failing the whole sample
  }
  const round = (v: number) => Math.round(v * 10) / 10;
  return { cpu: round(cpu), ram: round(ram), disk: round(disk) };
}
