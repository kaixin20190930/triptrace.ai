"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center">
      <Button
        variant="outline"
        size="icon"
        aria-label="Toggle color theme"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        ◐
      </Button>
    </div>
  );
}
