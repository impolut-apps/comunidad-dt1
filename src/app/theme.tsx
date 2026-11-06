import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
const ThemeContext = createContext<{ theme: ThemePref; setTheme: (t: ThemePref) => void }>({
  theme: 'light',
  setTheme: () => {},
})

function read(): ThemePref {
  try {
    const t = localStorage.getItem('theme')
    return t === 'dark' || t === 'system' ? t : 'light' // light is the default
  } catch {
    return 'light'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(read)

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B1424' : '#1268D5')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const setTheme = (t: ThemePref) => {
    setThemeState(t)
    try {
      localStorage.setItem('theme', t)
    } catch {
      /* private mode: theme just won't persist */
    }
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
