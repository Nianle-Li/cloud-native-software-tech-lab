import { useEffect, useState } from 'react'

export function useCurrentMinute(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: number
    function refresh() {
      window.clearTimeout(timer)
      setNow(new Date())
      timer = window.setTimeout(refresh, 60_000 - Date.now() % 60_000 + 20)
    }
    timer = window.setTimeout(refresh, 60_000 - Date.now() % 60_000 + 20)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return now
}
