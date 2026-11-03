// Application Android (Capacitor) : comportements propres au téléphone. Sans effet dans le navigateur.
// - Bouton « Retour » d'Android : revient à l'écran précédent, et ne quitte l'application que depuis l'accueil.
// - Autorisation de localisation demandée par Android au premier usage (le GPS du navigateur passe ensuite par elle).
import { Capacitor } from '@capacitor/core'

export async function setupNative(navigate) {
  if (!Capacitor.isNativePlatform()) return
  const { App } = await import('@capacitor/app')
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack && window.location.pathname !== '/') navigate(-1)
    else App.exitApp()
  })
  try {
    const { Geolocation } = await import('@capacitor/geolocation')
    const perm = await Geolocation.checkPermissions()
    if (perm.location !== 'granted') await Geolocation.requestPermissions()
  } catch { /* refus : l'application reste utilisable avec une adresse saisie */ }
}
