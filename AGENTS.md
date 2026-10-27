> [!IMPORTANT]
> Preserve published Git history. Avoid force-pushing or rewriting commits that have already been shared.

## Application structure
- Keep the marketing experience on the index route; product flows are outside the homepage scope.
- Keep brand and proposed commercial data in a shared browser-safe module so the working name and pricing can be changed in one place.
- Keep calculator mathematics in a pure helper with regression tests so estimates remain consistent with the supplied reference.
- Use semantic global CSS tokens and existing UI primitives for the marketing design to keep its visual language consistent.
- Build dashboard screens from the shared kit in src/components/patron/dash.tsx (PageHeader, StatCard, DataTable, EmptyState, FormField, Badge, ConfirmDialog, PreviewBanner) instead of one-off styles; PageHeader stays a div so the shell owns the single page header.
