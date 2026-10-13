import { linearTiming, TransitionSeries } from "@remotion/transitions"
import { fade } from "@remotion/transitions/fade"
import { useEffect, useState } from "react"
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, getStaticFiles } from "remotion"
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

/** Trilha opcional: coloque um arquivo em public/trilha.mp3 para incluí-la no vídeo. */
const music = getStaticFiles().find((f) => f.name === "trilha.mp3")

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
        {music && <Audio src={staticFile(music.name)} volume={(f) => Math.min(1, f / 30) * 0.6} />}
      </AbsoluteFill>
    </DemoSession>
  )
}
