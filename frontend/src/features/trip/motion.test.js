import { describe, expect, it } from 'vitest'
import { arrivalDetected, motionState, project, routeLine } from './motion.js'

// Trajet à pied tout droit vers l'est, sur environ 1 km (Nation → Porte de Vincennes)
const trip = { legs: [{ mode: 'WALK', from: { lat: 48.8484, lon: 2.3959 }, to: { lat: 48.8484, lon: 2.4095 }, stops: [] }] }
const line = routeLine(trip)
const at = (lon, t, accuracy = 10) => {
  const p = { lat: 48.8484, lon, t, accuracy }
  return { ...p, along: project(line, p).along }
}

describe('mouvement le long du trajet', () => {
  it('projette une position sur le tracé', () => {
    const p = project(line, { lat: 48.8486, lon: 2.4027 })
    expect(Math.round(p.along / 10) * 10).toBe(500)
    expect(p.offset).toBeLessThan(30)
  })

  it('avance, s\'arrête ou recule', () => {
    const fwd = [at(2.3990, 0), at(2.4000, 15_000), at(2.4010, 30_000)]
    expect(motionState(fwd, 30_000).state).toBe('moving_forward')
    const still = [at(2.4010, 0), at(2.40102, 15_000), at(2.40099, 30_000)]
    expect(motionState(still, 30_000).state).toBe('stopped')
    const back = [at(2.4010, 0), at(2.4000, 15_000), at(2.3990, 30_000)]
    expect(motionState(back, 30_000).state).toBe('moving_backward')
  })

  it('ne conclut pas sur une position imprécise ou trop récente', () => {
    expect(motionState([at(2.3990, 0, 200), at(2.4010, 30_000, 200)], 30_000).state).toBe('uncertain')
    expect(motionState([at(2.3990, 0), at(2.4010, 5_000)], 5_000).state).toBe('uncertain')
  })

  it('détecte l\'arrivée sans attendre l\'usager, mais pas en passant à 100 m', () => {
    const dest = trip.legs[0].to
    expect(arrivalDetected([at(2.40925, 0), at(2.40935, 10_000)], dest, { state: 'moving_forward' })).toBe(true)
    // À environ 100 m, en marchant : pas encore arrivé ; à l'arrêt à cette distance : arrivé
    const passing = [at(2.4081, 0), at(2.4082, 10_000)]
    expect(arrivalDetected(passing, dest, { state: 'moving_forward' })).toBe(false)
    expect(arrivalDetected(passing, dest, { state: 'stopped' })).toBe(true)
  })
})
