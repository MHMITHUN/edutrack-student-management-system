import { Card, CardContent, Skeleton } from "@/components/ui";

/** Teacher dashboard loading skeleton. */
export default function TeacherLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading teacher dashboard">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-5 w-48" />
          <div className="mt-3 flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-5 w-40" />
              <div className="mt-3 flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
