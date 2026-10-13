import { linearTiming, TransitionSeries } from "@remotion/transitions"
import { fade } from "@remotion/transitions/fade"
import { useEffect, useState } from "react"
import { AbsoluteFill, Audio, continueRender, delayRender, getStaticFiles, Sequence, staticFile } from "remotion"
import roteiro from "../narracao/roteiro.json"
import { easeInOut } from "./lib/anim"
import { Intro } from "./scenes/Intro"
import { MapScene } from "./scenes/MapScene"
import { Outro } from "./scenes/Outro"
import { Permissions } from "./scenes/Permissions"
import { Conference } from "./scenes/Conference"
import { Deliveries } from "./scenes/Deliveries"
import { Overview } from "./scenes/Overview"
import { SCENES, TRANSITION } from "./timeline"
import { DemoSession } from "./ui/DemoSession"

const timing = linearTiming({ durationInFrames: TRANSITION, easing: easeInOut })

/** Aguarda as fontes Geist antes de capturar cada quadro. */
function useFonts() {
  const [handle] = useState(() => delayRender("Carregando fontes"))
  useEffect(() => {
    Promise.all([document.fonts.load('400 16px "Geist"'), document.fonts.load('800 16px "Geist"'), document.fonts.load('400 16px "Geist Mono"')])
      .then(() => document.fonts.ready)
      .finally(() => continueRender(handle))
  }, [handle])
}

const files = new Set(getStaticFiles().map((f) => f.name))

/** Trilha opcional: coloque um arquivo em public/trilha.mp3 para incluí-la no vídeo. */
const music = files.has("trilha.mp3")

/** Narração gerada por scripts/narrar.py (public/narracao/<id>.wav), posicionada pelo roteiro. */
const narration = roteiro.falas.filter((f) => files.has(`narracao/${f.id}.wav`))

export function OssalaDemo() {
  useFonts()
  return (
    <DemoSession>
      <AbsoluteFill style={{ background: "#070506", fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif" }}>
        <TransitionSeries>
          <TransitionSeries.Sequence durationInFrames={SCENES.intro}>
            <Intro duration={SCENES.intro} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={timing} />
          <TransitionSeries.Sequence durationInFrames={SCENES.overview}>
            <Overview duration={SCENES.overview} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={timing} />
          <TransitionSeries.Sequence durationInFrames={SCENES.deliveries}>
            <Deliveries duration={SCENES.deliveries} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={timing} />
          <TransitionSeries.Sequence durationInFrames={SCENES.map}>
            <MapScene duration={SCENES.map} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={timing} />
          <TransitionSeries.Sequence durationInFrames={SCENES.conference}>
            <Conference duration={SCENES.conference} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={timing} />
          <TransitionSeries.Sequence durationInFrames={SCENES.permissions}>
            <Permissions duration={SCENES.permissions} />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={timing} />
          <TransitionSeries.Sequence durationInFrames={SCENES.outro}>
            <Outro duration={SCENES.outro} />
          </TransitionSeries.Sequence>
        </TransitionSeries>
        {narration.map((f) => (
          <Sequence key={f.id} from={Math.round(f.inicio * 30)} layout="none">
            <Audio src={staticFile(`narracao/${f.id}.wav`)} />
          </Sequence>
        ))}
        {/* Com narração, a trilha fica baixa para não competir com a voz. */}
        {music && <Audio src={staticFile("trilha.mp3")} volume={(f) => Math.min(1, f / 30) * (narration.length ? 0.15 : 0.6)} />}
      </AbsoluteFill>
    </DemoSession>
  )
}
