/**
 * Indirizzo della pagina Ripianifica. Con `alertId` il problema è già noto (viene da una
 * segnalazione) e la pagina mostra direttamente l'impatto e come ricalcolare:
 * /piani/PLAN-0037/ripianifica?avviso=AL-31
 */
export function rescheduleHref(planId: string, alertId?: string) {
  const base = `/piani/${encodeURIComponent(planId)}/ripianifica`
  return alertId ? `${base}?avviso=${encodeURIComponent(alertId)}` : base
}
