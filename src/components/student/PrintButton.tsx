"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Browser print trigger for the marksheet page. Printing is the user's own
 * action — the button is hidden in the printed output via print:hidden.
 */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" aria-hidden="true" />
      Print Marksheet
    </Button>
  );
}
