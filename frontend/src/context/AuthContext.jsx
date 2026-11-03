// Session utilisateur : jeton, profil et préférences synchronisées avec le serveur
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, TOKEN_KEY } from '../api/client.js'
import { clearTrip } from '../features/trip/tripStore.js'
import { storage } from '../utils/storage.js'

// Données de la session gardées sur l'appareil : effacées à la déconnexion
function forgetDevice() {
  storage.remove(TOKEN_KEY)
  storage.remove('atv.user')
  clearTrip().catch(() => {})
  // Réponses API mises en cache par le service worker (contiennent des positions GPS)
  if ('caches' in window) caches.delete('api').catch(() => {})
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(!storage.get(TOKEN_KEY))

  // Au démarrage : relit le compte si un jeton existe (hors ligne, on garde la copie locale)
  useEffect(() => {
    if (!storage.get(TOKEN_KEY)) return
    api.me.get()
      .then((u) => { setUser(u); storage.setJSON('atv.user', u) })
      .catch((e) => {
        if (e.status === 401) { storage.remove(TOKEN_KEY); storage.remove('atv.user') }
        else setUser(storage.getJSON('atv.user', null))
      })
      .finally(() => setReady(true))
  }, [])

  const open = useCallback(({ token, user: u }) => {
    storage.set(TOKEN_KEY, token)
    storage.setJSON('atv.user', u)
    setUser(u)
    return u
  }, [])

  const value = useMemo(() => ({
    user, ready,
    login: async (body) => open(await api.auth.login(body)),
    register: async (body) => open(await api.auth.register(body)),
    resetPassword: async (token, password) => open(await api.auth.reset(token, password)),
    // Les autres appareils sont déconnectés ; celui-ci reçoit un nouveau jeton
    changePassword: async (body) => open(await api.me.password(body)),
    update: async (body) => {
      const u = await api.me.update(body)
      storage.setJSON('atv.user', u)
      setUser(u)
      return u
    },
    // Destinations enregistrées
    addPlace: async (body) => { const u = await api.me.addPlace(body); storage.setJSON('atv.user', u); setUser(u); return u },
    removePlace: async (id) => { const u = await api.me.removePlace(id); storage.setJSON('atv.user', u); setUser(u); return u },
    logout: () => {
      forgetDevice()
      setUser(null)
    },
  }), [user, ready, open])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export const isAdmin = (user) => user?.role === 'admin' || user?.role === 'superadmin'

// Écran d'arrivée après inscription, selon la réponse sur le handicap
export function firstScreenPath(user) {
  return user?.first_screen === 'trajet_accessible' ? '/itineraires?sans-marche=1' : '/'
}
