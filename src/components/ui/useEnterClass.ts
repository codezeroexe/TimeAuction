import { useEffect, useRef } from 'react'
import { useRoute } from '../../state/useRoute.ts'

/** Adds `view-enter` to the returned element for 1s after the route changes (not on param-only changes). */
export function useEnterClass<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const { route } = useRoute()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.classList.add('view-enter')
    const t = setTimeout(() => el.classList.remove('view-enter'), 1000)
    return () => clearTimeout(t)
  }, [route])
  return ref
}
