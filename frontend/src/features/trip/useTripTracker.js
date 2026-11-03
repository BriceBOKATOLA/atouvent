// Suivi du trajet : GPS quand il y en a, horaires enregistrés sinon, recalage au retour du signal.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAnnouncer } from '../../context/AnnouncerContext.jsx'
import { usePrefs } from '../../context/PrefsContext.jsx'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useOnline } from '../../hooks/useOnline.js'
import { useI18n } from '../../i18n/index.jsx'
import { inIdf } from '../network.js'
import { MIN, dueAnnouncements, estimateProgress, recalibrate } from './estimate.js'
import { patchTrip } from './tripStore.js'

const TICK_MS = 15_000

export function useTripTracker(bundle) {
  const { t, time } = useI18n()
  const { announce } = useAnnouncer()
  const { prefs } = usePrefs()
  const online = useOnline()
  const gps = useGeolocation({ watch: Boolean(bundle), enabled: prefs.use_location })

  const [now, setNow] = useState(() => Date.now())
  const [delayMs, setDelay] = useState(bundle?.delayMs || 0)
  const [offRoute, setOffRoute] = useState(false)
  const done = useRef(new Set(bundle?.announced || []))
  const prevGps = useRef(gps.status)

  // Horloge : l'estimation avance même sans réseau
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const progress = useMemo(() => (bundle ? estimateProgress(bundle.trip, now, delayMs) : null), [bundle, now, delayMs])

  // Recalage à chaque position GPS reçue
  useEffect(() => {
    // Position hors Île-de-France (démonstration à distance) : on suit les horaires, sans recalage
    if (!bundle || gps.status !== 'ok' || !inIdf(gps.coords)) return
    const r = recalibrate(bundle.trip, Date.now(), gps.coords, delayMs)
    const back = prevGps.current === 'lost'
    if (back) announce(t('say.gps_back'))
    if (r.delayMs !== delayMs) {
      setDelay(r.delayMs)
      patchTrip({ delayMs: r.delayMs })
      if (back && r.delayMs >= 3 * MIN) announce(t('say.late', { n: Math.round(r.delayMs / MIN) }))
    }
    if (r.offRoute && !offRoute) announce(t('say.off_route'), { urgent: true })
    setOffRoute(r.offRoute)
    if (r.arrived) setNow(Date.parse(bundle.trip.end) + delayMs + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.coords, gps.status])

  useEffect(() => { prevGps.current = gps.status }, [gps.status])

  // Annonces faites avant chaque moment clé
  useEffect(() => {
    if (!bundle || !progress) return
    const due = dueAnnouncements(bundle, progress, now, done.current, { warnBefore: prefs.warn_before })
    if (!due.length) return
    // Une seule annonce groupée, pour ne pas couper la voix entre deux messages
    const text = due.map((a) => {
      const params = { ...a.params }
      if (params.eta) params.time = time(params.eta)
      if (params.hazard) params.hazard = t(`hazard.${params.hazard}`)
      done.current.add(a.id)
      return t(a.key, params)
    }).join(' ')
    announce(text, { urgent: due.some((a) => a.urgent) })
    patchTrip({ announced: [...done.current] })
  }, [bundle, progress, now, prefs.warn_before, announce, t, time])

  // Source de la position affichée
  const walking = progress?.phase === 'walking'
  const source = gps.status === 'ok' && inIdf(gps.coords) && walking ? 'gps' : 'schedule'

  return { progress, gps, online, source, delayMs, offRoute }
}
