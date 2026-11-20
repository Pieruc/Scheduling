import type { ModelComponent, ModelVersionStatus } from '@/api/types/models'
import type { Tone } from '@/lib/labels'

const pct = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 1 })
const num = new Intl.NumberFormat('it-IT')
const sec = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 })

/** 35 -> "35 ms", 420 -> "0,42 s" */
const formatMs = (ms: number) => (ms < 100 ? `${num.format(ms)} ms` : `${sec.format(ms / 1000)} s`)

type MetricInfo = { label: string; hint: string; format: (v: number) => string }

/**
 * Le metriche che il backend può mandare, spiegate a parole. Quelle sconosciute non si
 * mostrano; quelle note ma assenti nemmeno (il contratto ne garantisce solo alcune).
 */
export const METRICS: Record<ModelComponent, Record<string, MetricInfo>> = {
  POLICY: {
    gapVsCpSat: {
      label: 'Scarto dall’ottimo',
      hint: 'Quanto i piani dell’AI sono peggiori di quelli ottimi calcolati da CP-SAT. Meno è meglio.',
      format: pct.format,
    },
    winRateVsAtc: {
      label: 'Meglio della regola ATC',
      hint: 'Casi di prova in cui il piano dell’AI batte quello della regola ATC.',
      format: pct.format,
    },
    winRateVsEdd: {
      label: 'Meglio della regola EDD',
      hint: 'Casi di prova in cui il piano dell’AI batte quello della regola EDD.',
      format: pct.format,
    },
    avgInferenceMs: {
      label: 'Tempo medio',
      hint: 'Per costruire un piano.',
      format: formatMs,
    },
  },
  CONTEXT: {
    durationMape: {
      label: 'Errore medio delle stime',
      hint: 'Di quanto sbaglia in media la durata stimata rispetto a quella registrata. Meno è meglio.',
      format: pct.format,
    },
    weeklyEstimates: {
      label: 'Stime a settimana',
      hint: 'Durate e setup mancanti completati dall’AI.',
      format: num.format,
    },
    intervalCoverage: {
      label: 'Copertura dell’intervallo',
      hint: 'Volte in cui la durata reale cade nell’intervallo stimato.',
      format: pct.format,
    },
    avgInferenceMs: {
      label: 'Tempo medio',
      hint: 'Per stimare le durate di una richiesta.',
      format: formatMs,
    },
  },
}

/** La metrica che riassume una versione nello storico */
export const MAIN_METRIC: Record<ModelComponent, string> = {
  POLICY: 'gapVsCpSat',
  CONTEXT: 'durationMape',
}

export const COMPONENT_LABEL: Record<ModelComponent, string> = {
  POLICY: 'M2 · Policy',
  CONTEXT: 'M1 · Context',
}

export const VERSION_STATUS: Record<ModelVersionStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Attivo', tone: 'green' },
  CANDIDATE: { label: 'In valutazione', tone: 'blue' },
  RETIRED: { label: 'Ritirato', tone: 'grey' },
}
