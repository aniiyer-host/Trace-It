import * as React from "react"

type Theme = "light" | "dark" | "system"

interface ThemeProviderProps {
  defaultTheme: Theme;
  storageKey: string;
  children: React.ReactNode;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

export { ThemeContext };

export function ThemeProvider({
  defaultTheme = "system",
  storageKey = "traceit-theme",
  children,
}: ThemeProviderProps) {
  const [theme, setTheme] = React.useState<Theme>(() => {
    // Read from localStorage
    const savedTheme = window.localStorage.getItem(storageKey) as Theme | null;
    if (savedTheme) {
      return savedTheme;
    }

    // Check system preference
    if (defaultTheme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      return prefersDark ? "dark" : "light";
    }

    return defaultTheme;
  });

  // Update the theme when it changes
  React.useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    let themeToApply = theme;
    if (themeToApply === "system") {
      themeToApply = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    root.classList.add(themeToApply);
    window.localStorage.setItem(storageKey, theme);
  }, [theme, storageKey]);

  const setThemeValue = (theme: Theme) => {
    setTheme(theme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeValue }}>
      {children}
    </ThemeContext.Provider>
  );
}