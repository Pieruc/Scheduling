import { useCan } from '@/features/auth/authContext'
import { NavLink, useParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import styles from './ConfigurationPage.module.css'
import { CalendarsTab } from './calendars/CalendarsTab'
import { ProfilesTab } from './profiles/ProfilesTab'
import { ResourcesTab } from './resources/ResourcesTab'
import { SkillsTab } from './skills/SkillsTab'

/** Le tab della configurazione: ognuna ha il suo URL (/configurazione/risorse, ...). */
const CONFIG_TABS = [
  { slug: 'risorse', label: 'Risorse' },
  { slug: 'calendari', label: 'Calendari' },
  { slug: 'competenze', label: 'Competenze' },
  { slug: 'profili', label: 'Profili di dominio' },
] as const

export function ConfigurationPage() {
  const canWrite = useCan('configWrite')
  const { tab } = useParams()
  const current = CONFIG_TABS.find((t) => t.slug === tab) ?? CONFIG_TABS[0]

  return (
    <>
      <PageHeader
        title="Configurazione"
        subtitle="Dati di base usati da ogni pianificazione. Modificabili solo dall’amministratore."
      />
      {!canWrite && (
        <p className={styles.readOnly} role="note">
          <i className="pi pi-lock" aria-hidden="true" /> Sola lettura: solo l’amministratore può
          modificare questi dati.
        </p>
      )}
      <nav className={styles.tabs} aria-label="Sezioni della configurazione">
        {CONFIG_TABS.map((t) => (
          <NavLink
            key={t.slug}
            to={`/configurazione/${t.slug}`}
            className={() => (t.slug === current.slug ? styles.active : undefined)}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {current.slug === 'risorse' && <ResourcesTab />}
      {current.slug === 'calendari' && <CalendarsTab />}
      {current.slug === 'competenze' && <SkillsTab />}
      {current.slug === 'profili' && <ProfilesTab />}
    </>
  )
}
