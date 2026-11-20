import { Button } from 'primereact/button'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { OrderDetail } from './components/OrderDetail'
import { OrderForm } from './components/OrderForm'
import { OrderList } from './components/OrderList'
import { useOrders } from './hooks'
import styles from './components/orders.module.css'

/** Mockup v2, schermata 2: elenco a sinistra, commessa scelta a destra (/commesse/:orderId). */
export function OrdersPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const { data: orders } = useOrders()
  const selected = orders?.find((o) => o.id === orderId)

  // Senza commessa scelta si apre la prima aperta: il dettaglio non resta mai vuoto.
  if (orders && !orderId) {
    const first = orders.find((o) => o.status === 'OPEN') ?? orders[0]
    if (first) return <Navigate to={`/commesse/${first.id}`} replace />
  }

  return (
    <>
      <PageHeader
        title="Commesse"
        subtitle="I lavori da pianificare: scadenza, priorità e attività collegate da precedenze."
        actions={
          <Button label="Nuova commessa" icon="pi pi-plus" onClick={() => setCreating(true)} />
        }
      />
      {creating && (
        <OrderForm
          onClose={(saved) => {
            setCreating(false)
            if (saved) navigate(`/commesse/${saved.id}`)
          }}
        />
      )}
      <div className={styles.layout}>
        <OrderList />
        {selected && <OrderDetail order={selected} />}
        {orders && orderId && !selected && (
          <Card>
            <p className={styles.muted}>La commessa {orderId} non esiste o è stata eliminata.</p>
          </Card>
        )}
      </div>
    </>
  )
}
