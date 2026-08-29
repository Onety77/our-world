/** The seam between shared section loudness and the live ambience graph. */

import { useEffect } from 'react'
import { useData } from '@/data/provider'
import { useOutdoors } from './outdoors'

/** Safe in both the Garden and dev7731; both listeners write the same store. */
export function usePublishedOutdoors(): void {
  const data = useData()
  useEffect(() => {
    return data.watchAmbienceTuning((values) => {
      useOutdoors.getState().receivePublished(values)
    })
  }, [data])
}
