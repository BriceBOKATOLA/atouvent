// Assemblage : fournisseurs de contexte + routeur
import { Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Splash from './components/Splash.jsx'
import { AnnouncerProvider } from './context/AnnouncerContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { PrefsProvider } from './context/PrefsContext.jsx'
import { I18nProvider, useI18n } from './i18n/index.jsx'
import { routes } from './routes.jsx'

const router = createBrowserRouter(routes)

function Fallback() {
  const { t } = useI18n()
  return <p className="loading" role="status" style={{ padding: 24 }}>{t('app.loading')}</p>
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <PrefsProvider>
          <AnnouncerProvider>
            {/* Logo animé à chaque ouverture de l'application */}
            <Splash />
            <Suspense fallback={<Fallback />}>
              <RouterProvider router={router} />
            </Suspense>
          </AnnouncerProvider>
        </PrefsProvider>
      </AuthProvider>
    </I18nProvider>
  )
}
