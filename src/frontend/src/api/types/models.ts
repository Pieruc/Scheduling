import type { IsoDateTime } from '@/api/types/common'

/** Una versione attiva di un modello AI (contratti, A.7) */
export type ActiveModel = {
  version: string
  publishedAt: IsoDateTime
  metrics: Record<string, number>
}

/** Risposta di GET /models/active (contratti, A.7) */
export type ActiveModels = {
  policy: ActiveModel
  context: ActiveModel
}
