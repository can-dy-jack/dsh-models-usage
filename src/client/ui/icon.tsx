/**
 * Left-rail entry icon; the sidebar owns the button around it.
 *
 * Two stacked coins; the front one carries the model sparkle. The mask
 * notches the back coin so a ring of space keeps the outlines apart; its
 * literal black/white content is mask geometry, not visible colour, and the
 * visible strokes follow `currentColor` so the rail's own states apply.
 */

import { React } from '../react'

const ICON_GAP_ID = 'dmu-icon-gap'

export function PanelIcon(props: { size?: number }) {
  const size = typeof props.size === 'number' ? props.size : 20
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden={true}
      style={{ display: 'block' }}
    >
      <mask id={ICON_GAP_ID} maskUnits="userSpaceOnUse" x={0} y={0} width={24} height={24}>
        <rect x={0} y={0} width={24} height={24} fill="#fff" />
        <circle cx={9} cy={15} r={8.35} fill="#000" />
      </mask>
      <g stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <circle mask={`url(#${ICON_GAP_ID})`} cx={15.5} cy={8.5} r={6} />
        <circle cx={9} cy={15} r={6.25} />
        <path
          fill="currentColor" strokeWidth={1}
          d="M9 11.4Q9.45 14.55 12.6 15Q9.45 15.45 9 18.6Q8.55 15.45 5.4 15Q8.55 14.55 9 11.4Z"
        />
      </g>
    </svg>
  )
}
