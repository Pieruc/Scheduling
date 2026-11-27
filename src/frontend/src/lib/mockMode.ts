/**
 * Quali aree del backend sono simulate dal mock (MSW) in questo avvio.
 * - VITE_USE_MOCKS=false: nessuna, tutto va al backend vero;
 * - VITE_USE_MOCKS=true: tutte, tranne quelle in VITE_REAL_AREAS (es. "auth,config" o "all").
 * Se almeno un'area è vera, anche "auth" lo è: il backend vero accetta solo i suoi token.
 * Sta qui, fuori da mocks/, così le pagine possono chiederlo senza includere il mock nella build.
 */
export const MOCK_AREA_NAMES = [
  'auth',
  'config',
  'orders',
  'planning',
  'operator',
  'models',
  'audit',
] as const

export type MockArea = (typeof MOCK_AREA_NAMES)[number]

export function realAreas(): Set<MockArea> {
  if (!import.meta.env.DEV || import.meta.env.VITE_USE_MOCKS !== 'true') {
    return new Set(MOCK_AREA_NAMES)
  }
  const raw = (import.meta.env.VITE_REAL_AREAS ?? '').trim()
  const set = new Set<MockArea>(
    raw === 'all'
      ? MOCK_AREA_NAMES
      : raw
          .split(',')
          .map((a) => a.trim())
          .filter((a): a is MockArea => (MOCK_AREA_NAMES as readonly string[]).includes(a)),
  )
  if (set.size > 0) set.add('auth')
  return set
}

/** true se l'area è simulata dal mock */
export const isMocked = (area: MockArea) => !realAreas().has(area)
