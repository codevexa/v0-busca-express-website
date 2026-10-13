/** Duração de cada cena (em frames, 30 FPS) e das transições entre elas. */
export const SCENES = {
  intro: 150,
  overview: 240,
  deliveries: 380,
  map: 285,
  conference: 350,
  permissions: 300,
  outro: 200,
} as const

export const TRANSITION = 18

export const TOTAL_FRAMES =
  Object.values(SCENES).reduce((a, b) => a + b, 0) - TRANSITION * (Object.keys(SCENES).length - 1)
