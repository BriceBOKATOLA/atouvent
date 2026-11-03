// Chargement de MapLibre (une seule fois, à la demande) avec son fichier de calcul en arrière-plan (worker).
// MapLibre 6 cherche ce fichier à côté de son propre module : une fois l'application assemblée par Vite, il n'y est plus.
// On le fait donc assembler par Vite (?worker&url) et on donne son adresse à MapLibre.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

let loading
export function loadMaplibre() {
  loading ??= import('maplibre-gl').then((mod) => {
    const maplibregl = mod.default ?? mod  // module ESM sans export par défaut
    maplibregl.setWorkerUrl(new URL(workerUrl, window.location.href).href)
    return maplibregl
  })
  return loading
}
