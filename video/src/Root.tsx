import "./style.css"
import { Composition } from "remotion"
import { OssalaDemo } from "./Video"
import { TOTAL_FRAMES } from "./timeline"

export const RemotionRoot = () => (
  <Composition id="OssalaDemo" component={OssalaDemo} durationInFrames={TOTAL_FRAMES} fps={30} width={1920} height={1080} />
)
