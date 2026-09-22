import * as React from "react"

import { ThemeContext } from "@/components/theme-provider"

// Hook to use theme context
export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}