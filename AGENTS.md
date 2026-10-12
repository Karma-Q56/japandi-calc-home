<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application structure
- Keep the marketing experience on the index route; product flows are outside the homepage scope.
- Keep brand and proposed commercial data in a shared browser-safe module so the working name and pricing can be changed in one place.
- Keep calculator mathematics in a pure helper with regression tests so estimates remain consistent with the supplied reference.
- Use semantic global CSS tokens and existing UI primitives for the marketing design to keep its visual language consistent.
