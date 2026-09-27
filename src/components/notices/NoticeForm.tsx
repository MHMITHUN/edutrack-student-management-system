"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import {
  createNoticeAction,
  type NoticeFormState,
} from "@/app/actions/notices";

/**
 * Notice creation form (admin + teacher). The class selector only appears
 * for audience "class"; teachers additionally get their audience choices
 * restricted by the server (staff notices are admin-only). The Field helper
 * wires labels/errors — each control carries its own form name.
 */

export interface NoticeClassOption {
  id: string;
  label: string;
}

export function NoticeForm({
  classes,
  allowTeachersAudience,
}: {
  classes: NoticeClassOption[];
  allowTeachersAudience: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    createNoticeAction,
    {} as NoticeFormState,
  );
  const [audience, setAudience] = useState("all");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <Alert tone="danger" title="Not published">{state.error}</Alert>}
      {state.message && <Alert tone="success" title="Published">{state.message}</Alert>}

      <Field label="Title" name="notice-title" error={state.fieldErrors?.title}>
        {(ids) => (
          <Input {...ids} name="title" placeholder="e.g. Half Yearly exam routine published" />
        )}
      </Field>

      <Field
        label="Notice body"
        name="notice-body"
        hint="Plain text. Keep it short and factual — it is published immediately."
        error={state.fieldErrors?.bodyMd}
      >
        {(ids) => <Textarea {...ids} name="bodyMd" rows={5} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Audience" name="notice-audience" error={state.fieldErrors?.audience}>
          {(ids) => (
            <Select
              {...ids}
              name="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            >
              <option value="all">Everyone</option>
              <option value="students">All students</option>
              <option value="class">Specific class</option>
              {allowTeachersAudience && <option value="teachers">Teachers only</option>}
            </Select>
          )}
        </Field>

        <Field label="Priority" name="notice-priority">
          {(ids) => (
            <Select {...ids} name="priority" defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="important">Important</option>
            </Select>
          )}
        </Field>
      </div>

      {audience === "class" && (
        <Field
          label="Class"
          name="notice-class"
          hint="Only classes you are allowed to post for are listed."
          error={state.fieldErrors?.classId}
        >
          {(ids) => (
            <Select {...ids} name="classId">
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <div>
        <Button type="submit" loading={isPending}>
          Publish Notice
        </Button>
      </div>
    </form>
  );
}
