import React, { useContext, useEffect, useState } from 'react'

import styled from 'styled-components'

import {
  FoundationContext,
  LinerContext,
  useDraggable,
} from 'media-stream-library/overlay'

const SvgCircleCorner = styled.circle`
  fill: rgb(0.5, 0.5, 0.5);
  stroke: grey;
`

const SvgCircleHandle = styled.circle`
  fill: rgb(0.5, 0.5, 0.5, 0);

  &:hover {
    fill: rgb(0.5, 0.5, 0.5, 0.6);
  }
`

const SvgPolygon = styled.polygon`
  fill: rgb(0.5, 0.5, 0.5, 0.2);
  stroke: grey;
`

export const Polygon = ({ pos, onChangePos }) => {
  const { toSvgBasis, toUserBasis } = useContext(FoundationContext)
  const { clampCoord, clampCoordArray } = useContext(LinerContext)

  const [svgPos, setSvgPos] = useState(pos.map(toSvgBasis))
  useEffect(() => {
    setSvgPos(pos.map(toSvgBasis))
  }, [pos, toSvgBasis])

  const { subscribe, unsubscribe, start: startDrag } = useDraggable()

  useEffect(() => {
    const initialSvgPos = pos.map(toSvgBasis)

    /**
     * Updates the coordinates when a draggable event is emitted.
     *
     * When the whole polygon is moved (`name` === 'g'), then we
     * translate all points, otherwise we just translated the point
     * that matches the `name`.
     */
    const updatePosition = (
      { name, vector: [tx, ty] },
      ended
    ) => {
      const newSvgPos =
        name === 'g'
          ? clampCoordArray(initialSvgPos.map(([x, y]) => [x + tx, y + ty]))
          : initialSvgPos.map(([x, y], index) =>
            name === `p${index}` ? clampCoord([x + tx, y + ty]) : [x, y]
          )

      if (ended) {
        onChangePos(newSvgPos.map(toUserBasis))
        return
      }
      setSvgPos(newSvgPos)
    }

    /**
     * Subscribe to draggable events with the update function.
     */
    subscribe(updatePosition)

    return () => {
      unsubscribe()
    }
  }, [
    clampCoord,
    clampCoordArray,
    onChangePos,
    pos,
    subscribe,
    toSvgBasis,
    toUserBasis,
    unsubscribe,
  ])

  return (
    <g name="g" onPointerDown={startDrag}>
      <SvgPolygon points={svgPos.map(([x, y]) => `${x},${y}`).join(' ')} />
      {svgPos.map(([x, y], index) => {
        // The visible corners
        return <SvgCircleCorner key={index} r={3} cx={x} cy={y} />
      })}
      {svgPos.map(([x, y], index) => {
        // The invisible handles
        return (
          <SvgCircleHandle
            key={index}
            name={`p${index}`}
            r={5}
            cx={x}
            cy={y}
            onPointerDown={startDrag}
          />
        )
      })}
    </g>
  )
}
