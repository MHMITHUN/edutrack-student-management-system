/** Consistent page heading block used across the app's sections. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  /** Optional actions (buttons) rendered on the right. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-fg">
          {title}
        </h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}
