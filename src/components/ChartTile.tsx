/**
 * Sparse-line ASCII chart tile with a `Fig N.` caption.
 * Plots are abstract type, never precise data visualisation.
 */
export function ChartTile({
  fig,
  caption,
  plot,
}: {
  fig: string
  caption: string
  plot: string[]
}) {
  return (
    <figure className="p-4">
      <pre
        aria-hidden="true"
        className="overflow-hidden text-caption-md leading-4 text-body select-none"
      >
        {plot.join('\n')}
      </pre>
      <figcaption className="mt-4 text-caption-md text-mute">
        Fig {fig}. {caption}
      </figcaption>
    </figure>
  )
}
