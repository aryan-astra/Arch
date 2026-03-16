type ProgressiveBlurProps = {
  className?: string
  backgroundColor?: string
  position?: "top" | "bottom"
  height?: string
  blurAmount?: string
}

const ProgressiveBlur = ({
  className = "",
  backgroundColor = "#f5f4f3",
  position = "top",
  height = "150px",
  blurAmount = "2px",
}: ProgressiveBlurProps) => {
  const isTop = position === "top"

  return (
    <div
      className={`progressive-blur ${className}`}
      style={{
        position: "absolute",
        left: 0,
        width: "100%",
        pointerEvents: "none",
        [isTop ? "top" : "bottom"]: 0,
        height,
        background: isTop
          ? `linear-gradient(to top, transparent, ${backgroundColor})`
          : `linear-gradient(to bottom, transparent, ${backgroundColor})`,
        // Keep mask high-luminance so the blur works even on dark backgrounds.
        maskImage: isTop
          ? "linear-gradient(to bottom, rgba(255,255,255,1) 50%, transparent)"
          : "linear-gradient(to top, rgba(255,255,255,1) 50%, transparent)",
        WebkitBackdropFilter: `blur(${blurAmount})`,
        backdropFilter: `blur(${blurAmount})`,
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    />
  )
}

export { ProgressiveBlur }
export type { ProgressiveBlurProps }

