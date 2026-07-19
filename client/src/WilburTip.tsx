interface Props {
  tip: string
}

/** Inline building-advice bubble shown during character creation. Deliberately
 * NOT the fixed-position WilburCompanion — that one is purely decorative and
 * hidden below 640px (it was overlapping real content), but this tip is real
 * content, so it renders in normal document flow and stays visible at every
 * width. */
export function WilburTip({ tip }: Props) {
  return (
    <div className="pixel-panel !p-3 flex items-start gap-3">
      <img
        src="/wilbur-pixel.png"
        alt=""
        aria-hidden="true"
        className="h-10 w-10 shrink-0"
        style={{ imageRendering: 'pixelated' }}
      />
      <p className="text-sm">
        <span className="pixel-label">Wilbur says:</span> {tip}
      </p>
    </div>
  )
}
