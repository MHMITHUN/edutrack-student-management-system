"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import {
  publishMarkSheetAction,
  returnMarkSheetAction,
  type MarksFormState,
} from "@/app/actions/marks";

/**
 * Admin review actions for a submitted mark sheet: publish (students see the
 * result) or return it to the teacher with an optional note. The note is
 * recorded in the audit log, not on the sheet.
 */
export function AdminSheetActions({ sheetId }: { sheetId: string }) {
  const [publishState, publishAction, publishing] = useActionState(
    publishMarkSheetAction,
    {} as MarksFormState,
  );
  const [returnState, returnAction, returning] = useActionState(
    returnMarkSheetAction,
    {} as MarksFormState,
  );

  return (
    <div className="flex flex-col gap-4">
      {publishState.error && (
        <Alert tone="danger" title="Not published">{publishState.error}</Alert>
      )}
      {publishState.message && (
        <Alert tone="success" title="Published">{publishState.message}</Alert>
      )}
      {returnState.error && (
        <Alert tone="danger" title="Not returned">{returnState.error}</Alert>
      )}
      {returnState.message && (
        <Alert tone="info" title="Returned">{returnState.message}</Alert>
      )}

      <form action={publishAction} className="flex flex-col gap-2">
        <input type="hidden" name="sheetId" value={sheetId} />
        <Button type="submit" loading={publishing}>
          Publish Result
        </Button>
        <p className="text-xs text-muted">
          Publishing makes these marks visible to the students of this class
          and cannot be undone.
        </p>
      </form>

      <form action={returnAction} className="flex flex-col gap-2">
        <input type="hidden" name="sheetId" value={sheetId} />
        <Label htmlFor={`return-note-${sheetId}`}>Return with a note (optional)</Label>
        <Textarea
          id={`return-note-${sheetId}`}
          name="note"
          rows={2}
          maxLength={500}
          placeholder="e.g. Roll 7 has marks but was marked absent — please correct."
        />
        <Button type="submit" variant="outline" loading={returning}>
          Return for Correction
        </Button>
        <p className="text-xs text-muted">
          The sheet goes back to draft so the teacher can edit it again; your
          note is recorded in the audit log.
        </p>
      </form>
    </div>
  );
}
