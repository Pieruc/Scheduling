import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '@/app/layouts/AppLayout'
import { OperatorLayout } from '@/app/layouts/OperatorLayout'
import { RouteError } from '@/app/RouteError'
import { AuditPage } from '@/features/audit/AuditPage'
import { ConfigurationPage } from '@/features/configuration/ConfigurationPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { OperatorTodayPage } from '@/features/execution/OperatorTodayPage'
import { ModelInfoPage } from '@/features/model-info/ModelInfoPage'
import { OrdersPage } from '@/features/orders/OrdersPage'
import { PlanGanttPage } from '@/features/plan-review/PlanGanttPage'
import { NewPlanPage } from '@/features/planning/NewPlanPage'
import { CandidatesPage } from '@/features/plans/CandidatesPage'
import { PlansListPage } from '@/features/plans/PlansListPage'

/** Tutte le rotte dell'app (vedi FRONTEND_STRUTTURA.md §4). */
export const router = createBrowserRouter([
  {
    // pianificatore e amministratore
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'commesse', element: <OrdersPage /> },
      { path: 'commesse/:orderId', element: <OrdersPage /> },
      { path: 'pianifica', element: <NewPlanPage /> },
      { path: 'piani', element: <PlansListPage /> },
      { path: 'piani/richieste/:requestId', element: <CandidatesPage /> },
      { path: 'piani/:planId', element: <PlanGanttPage /> },
      { path: 'configurazione', element: <Navigate to="/configurazione/risorse" replace /> },
      { path: 'configurazione/:tab', element: <ConfigurationPage /> },
      { path: 'modello', element: <ModelInfoPage /> },
      { path: 'audit', element: <AuditPage /> },
    ],
  },
  {
    // operatore
    path: 'operatore',
    element: <OperatorLayout />,
    errorElement: <RouteError />,
    children: [{ index: true, element: <OperatorTodayPage /> }],
  },
])
