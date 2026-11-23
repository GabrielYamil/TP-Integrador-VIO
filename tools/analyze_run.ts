import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { analyzeRunJsonl, rowsToCsv } from '../packages/server/src/run-analyzer';
import type { RunCheckpoint } from '../packages/server/src/run-analyzer';

interface CliOptions {
  input: string;
  output: string;
  checkpoints?: string;
  visibilityMs: number;
}

function usage(): string {
  return [
    'Uso:',
    '  pnpm analyze -- data/runs/<corrida>.jsonl [opciones]',
    '',
    'Opciones:',
    '  --output <directorio>       Directorio de resultados',
    '  --checkpoints <archivo>     JSON con [{name, t, expected:[x,y,z]}]',
    '  --visibility-ms <número>    Ventana de visibilidad de marcador (250 ms)',
  ].join('\n');
}

function parseArgs(argv: readonly string[]): CliOptions {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    console.log(usage());
    process.exit(argv.length === 0 ? 1 : 0);
  }
  const input = resolve(argv[0] ?? '');
  let output = resolve(dirname(input), `${basename(input, extname(input))}-analysis`);
  let checkpoints: string | undefined;
  let visibilityMs = 250;
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!value) {
      throw new Error(`Falta el valor de ${option}`);
    }
    if (option === '--output') {
      output = resolve(value);
    } else if (option === '--checkpoints') {
      checkpoints = resolve(value);
    } else if (option === '--visibility-ms') {
      visibilityMs = Number(value);
    } else {
      throw new Error(`Opción desconocida: ${option}`);
    }
    index += 1;
  }
  return { input, output, checkpoints, visibilityMs };
}

function validateCheckpoints(value: unknown): RunCheckpoint[] {
  if (!Array.isArray(value)) {
    throw new Error('El archivo de checkpoints debe contener un array');
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Checkpoint ${index + 1} inválido`);
    }
    const point = item as Record<string, unknown>;
    if (
      typeof point.name !== 'string' ||
      typeof point.t !== 'number' ||
      !Array.isArray(point.expected) ||
      point.expected.length !== 3 ||
      !point.expected.every(
        (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
      )
    ) {
      throw new Error(`Checkpoint ${index + 1} inválido`);
    }
    return {
      name: point.name,
      t: point.t,
      expected: point.expected as [number, number, number],
    };
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const text = await readFile(options.input, 'utf8');
  const checkpoints = options.checkpoints
    ? validateCheckpoints(JSON.parse(await readFile(options.checkpoints, 'utf8')))
    : [];
  const analysis = analyzeRunJsonl(text, {
    markerVisibilityWindowMs: options.visibilityMs,
    checkpoints,
  });
  const { trajectory, ...metrics } = analysis;

  await mkdir(options.output, { recursive: true });
  await Promise.all([
    writeFile(join(options.output, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`),
    writeFile(join(options.output, 'trajectory.csv'), rowsToCsv(trajectory)),
    writeFile(join(options.output, 'checkpoints.csv'), rowsToCsv(analysis.checkpoints)),
  ]);

  console.table({
    duración_s: analysis.duration_s.toFixed(2),
    poses: analysis.messages.pose,
    frecuencia_hz: analysis.update_rate_hz?.toFixed(2) ?? 'n/d',
    cierre_crudo_m: analysis.closure_error_m.raw?.toFixed(4) ?? 'n/d',
    cierre_corregido_m: analysis.closure_error_m.corrected?.toFixed(4) ?? 'n/d',
    latencia_media_ms: analysis.latency_ms.mean?.toFixed(2) ?? 'n/d',
    latencia_p95_ms: analysis.latency_ms.p95?.toFixed(2) ?? 'n/d',
    marcadores_visibles_pct: analysis.marker_visibility.percent.toFixed(2),
  });
  console.log(`Resultados escritos en ${options.output}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
