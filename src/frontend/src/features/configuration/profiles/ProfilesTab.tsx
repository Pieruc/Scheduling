import { Button } from 'primereact/button'
import { Skeleton } from 'primereact/skeleton'
import { Slider } from 'primereact/slider'
import { useState } from 'react'
import { errorMessage } from '@/api/errors'
import type { DomainProfile, ObjectiveDefaults } from '@/api/types/config'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { StatusTag } from '@/components/StatusTag'
import shared from '../resources/resources.module.css'
import { useDomainProfiles, useSaveProfile } from '../hooks'
import styles from './profiles.module.css'

const OBJECTIVES: { key: keyof ObjectiveDefaults; label: string; hint: string }[] = [
  {
    key: 'weightedTardiness',
    label: 'Rispettare le scadenze',
    hint: 'Ritardo pesato per la priorità delle commesse.',
  },
  { key: 'makespan', label: 'Finire prima', hint: 'Durata totale del piano.' },
  { key: 'setup', label: 'Ridurre i cambi di setup', hint: 'Tempo perso a riattrezzare.' },
]

/** Vincoli che un profilo può attivare. Quelli sconosciuti si mostrano con il codice */
const FEATURES: Record<string, string> = {
  SEQUENCE_DEPENDENT_SETUP: 'Setup che dipendono dall’attività precedente',
  ALTERNATIVE_RESOURCES: 'Risorse alternative per la stessa attività',
  OVERTIME: 'Straordinari ammessi',
  HARD_DEADLINES: 'Scadenze non superabili',
  PRECEDENCE_LAGS: 'Attese minime e massime tra attività',
  MULTI_RESOURCE: 'Attività che occupano più risorse insieme',
}

const pct = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 0 })

/** Editor di un profilo. Gli slider vanno da 0 a 100; si salvano normalizzati a somma 1 */
function ProfileEditor({ profile }: { profile: DomainProfile }) {
  const toast = useToast()
  const save = useSaveProfile()
  const initial = {
    weights: Object.fromEntries(
      OBJECTIVES.map((o) => [o.key, Math.round(profile.defaultObjectiveWeights[o.key] * 100)]),
    ) as Record<keyof ObjectiveDefaults, number>,
    features: profile.features,
  }
  const [weights, setWeights] = useState(initial.weights)
  const [features, setFeatures] = useState(initial.features)
  const total = OBJECTIVES.reduce((s, o) => s + weights[o.key], 0)
  const dirty =
    OBJECTIVES.some((o) => weights[o.key] !== initial.weights[o.key]) ||
    features.length !== initial.features.length ||
    features.some((f) => !initial.features.includes(f))
  const allFeatures = [...new Set([...Object.keys(FEATURES), ...profile.features])]

  const submit = () => {
    if (total === 0) return
    const normalized = Object.fromEntries(
      OBJECTIVES.map((o) => [o.key, Math.round((weights[o.key] / total) * 1000) / 1000]),
    ) as unknown as ObjectiveDefaults
    // Gli arrotondamenti non devono rompere la somma 1: il resto va al primo obiettivo
    const rest = 1 - (normalized.makespan + normalized.weightedTardiness + normalized.setup)
    normalized.weightedTardiness = Math.round((normalized.weightedTardiness + rest) * 1000) / 1000
    save.mutate(
      { code: profile.code, input: { defaultObjectiveWeights: normalized, features } },
      {
        onSuccess: () => toast.success('Profilo salvato', profile.name ?? profile.code),
        onError: (e) => toast.error('Profilo non salvato', errorMessage(e)),
      },
    )
  }

  return (
    <Card>
      <div className={styles.editorHead}>
        <div>
          <h2 className={shared.formTitle}>{profile.name ?? profile.code}</h2>
          <p className={shared.hint}>{profile.description}</p>
        </div>
        {profile.inUse && <StatusTag label="In uso" tone="green" />}
      </div>

      <fieldset className={shared.fieldset}>
        <legend className={shared.legend}>Cosa conta di più (valori di partenza)</legend>
        <p className={shared.hint}>
          Il pianificatore li può cambiare a ogni richiesta. Contano le proporzioni, non i numeri.
        </p>
        {OBJECTIVES.map((o) => (
          <div key={o.key} className={styles.weight}>
            <div className={styles.weightHead}>
              <span id={`pw-${o.key}`} className={styles.weightLabel}>
                {o.label}
              </span>
              <span className={styles.share}>
                {total > 0 ? pct.format(weights[o.key] / total) : '—'}
              </span>
            </div>
            <Slider
              value={weights[o.key]}
              onChange={(e) => setWeights({ ...weights, [o.key]: e.value as number })}
              min={0}
              max={100}
              step={5}
              aria-labelledby={`pw-${o.key}`}
              className={styles.slider}
            />
            <span className={shared.hint}>{o.hint}</span>
          </div>
        ))}
        {total === 0 && (
          <p className={styles.error} role="alert">
            Almeno un obiettivo deve contare qualcosa.
          </p>
        )}
      </fieldset>

      <fieldset className={shared.fieldset}>
        <legend className={shared.legend}>Vincoli attivi</legend>
        <div className={styles.features}>
          {allFeatures.map((f) => (
            <label key={f} className={styles.feature}>
              <input
                type="checkbox"
                checked={features.includes(f)}
                onChange={(e) =>
                  setFeatures(e.target.checked ? [...features, f] : features.filter((x) => x !== f))
                }
              />
              <span>{FEATURES[f] ?? f}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={shared.actions}>
        <Button
          label="Salva profilo"
          loading={save.isPending}
          disabled={!dirty || total === 0}
          onClick={submit}
        />
        <Button
          label="Annulla modifiche"
          outlined
          disabled={!dirty}
          onClick={() => {
            setWeights(initial.weights)
            setFeatures(initial.features)
          }}
        />
      </div>
    </Card>
  )
}

/** Configurazione → Profili di dominio: obiettivi e vincoli di partenza per tipo di realtà */
export function ProfilesTab() {
  const { data, isPending, isError, error, refetch } = useDomainProfiles()
  const [code, setCode] = useState<string | null>(null)

  if (isPending) return <Skeleton height="420px" />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const selected = data.find((p) => p.code === code) ?? data.find((p) => p.inUse) ?? data[0]

  return (
    <div className={styles.layout}>
      <div className={styles.list} role="group" aria-label="Profili di dominio">
        {data.map((p) => (
          <button
            key={p.code}
            type="button"
            className={`${styles.profile} ${p.code === selected?.code ? styles.profileActive : ''}`}
            aria-pressed={p.code === selected?.code}
            onClick={() => setCode(p.code)}
          >
            <span className={styles.profileTop}>
              <span className={styles.profileName}>{p.name ?? p.code}</span>
              {p.inUse && <StatusTag label="In uso" tone="green" />}
            </span>
            <span className={`mono ${styles.profileCode}`}>{p.code}</span>
            <span className={styles.profileDesc}>{p.description}</span>
          </button>
        ))}
      </div>
      {/* key: cambiando profilo (o dopo il salvataggio) l'editor riparte dai valori salvati */}
      {selected && (
        <ProfileEditor
          key={`${selected.code}-${JSON.stringify(selected.defaultObjectiveWeights)}-${selected.features.join()}`}
          profile={selected}
        />
      )}
    </div>
  )
}
