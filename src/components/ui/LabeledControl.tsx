import { cn } from "@/lib/utils";
import { Label } from "./Label";
import { Input } from "./Input";
import { Select } from "./Select";

/**
 * Server-safe label + control pairs for GET filter forms. (Field.tsx is a
 * client component with a render-prop — functions cannot cross the
 * server→client boundary, so server pages use these instead. Field stays the
 * right tool inside client forms, e.g. the notice form.)
 */

export interface LabeledSelectProps {
  id: string;
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  className?: string;
}

export function LabeledSelect({
  id,
  label,
  name,
  defaultValue,
  options,
  hint,
  className,
}: LabeledSelectProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} name={name} defaultValue={defaultValue}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export interface LabeledInputProps {
  id: string;
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  max?: string;
  hint?: string;
  className?: string;
}

export function LabeledInput({
  id,
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  max,
  hint,
  className,
}: LabeledInputProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        max={max}
      />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
