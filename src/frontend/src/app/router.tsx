import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '@/app/layouts/AppLayout'
import { OperatorLayout } from '@/app/layouts/OperatorLayout'
import { RouteError } from '@/app/RouteError'
import { AuditPage } from '@/features/audit/AuditPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { ConfigurationPage } from '@/features/configuration/ConfigurationPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { OperatorTodayPage } from '@/features/execution/OperatorTodayPage'
import { ModelInfoPage } from '@/features/model-info/ModelInfoPage'
import { OrdersPage } from '@/features/orders/OrdersPage'
import { PlanGanttPage } from '@/features/plan-review/PlanGanttPage'
import { ReschedulePage } from '@/features/plan-review/ReschedulePage'
import { UsersPage } from '@/features/users/UsersPage'
import { NewPlanPage } from '@/features/planning/NewPlanPage'
import { CandidatesPage } from '@/features/plans/CandidatesPage'
import { PlansListPage } from '@/features/plans/PlansListPage'

/** Tutte le rotte dell'app (vedi FRONTEND_STRUTTURA.md §4). */
export const router = createBrowserRouter([
  { path: 'login', element: <LoginPage />, errorElement: <RouteError /> },
  { path: 'registrazione', element: <RegisterPage />, errorElement: <RouteError /> },
  {
    // pianificatore e amministratore
    element: (
      <RequireAuth permission="office">
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'commesse', element: <OrdersPage /> },
      { path: 'commesse/:orderId', element: <OrdersPage /> },
      {
        path: 'pianifica',
        element: (
          <RequireAuth permission="plan">
            <NewPlanPage />
          </RequireAuth>
        ),
      },
      { path: 'piani', element: <PlansListPage /> },
      { path: 'piani/richieste/:requestId', element: <CandidatesPage /> },
      { path: 'piani/:planId', element: <PlanGanttPage /> },
      {
        path: 'piani/:planId/ripianifica',
        element: (
          <RequireAuth permission="plan">
            <ReschedulePage />
          </RequireAuth>
        ),
      },
      { path: 'configurazione', element: <Navigate to="/configurazione/risorse" replace /> },
      { path: 'configurazione/:tab', element: <ConfigurationPage /> },
      { path: 'modello', element: <ModelInfoPage /> },
      {
        path: 'utenti',
        element: (
          <RequireAuth permission="admin">
            <UsersPage />
          </RequireAuth>
        ),
      },
      {
        path: 'audit',
        element: (
          <RequireAuth permission="admin">
            <AuditPage />
          </RequireAuth>
        ),
      },
    ],
  },
  {
    // operatore
    path: 'operatore',
    element: (
      <RequireAuth permission="operator">
        <OperatorLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [{ index: true, element: <OperatorTodayPage /> }],
  },
])
