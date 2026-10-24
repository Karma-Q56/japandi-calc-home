import type { ComponentType } from 'react';
import { Outlet, useChildMatches } from '@tanstack/react-router';

/**
 * File routes such as `r.$slug.join.tsx` are children of `r.$slug.tsx`. A parent that is
 * itself a full page must hand over to its child when one matches, otherwise the child
 * URL silently renders the parent page.
 */
export function withChildren(Page: ComponentType): () => React.JSX.Element {
  function RouteWithChildren() {
    const children = useChildMatches();
    return children.length > 0 ? <Outlet /> : <Page />;
  }
  // Tagged for src/test/route-children.test.tsx: every route that has children must
  // either be wrapped here or be a custom shell that renders <Outlet /> itself.
  RouteWithChildren.rendersChildren = true;
  return RouteWithChildren;
}

export type OutletComponent = ComponentType & { rendersChildren?: boolean };

/** Mark a hand-written shell (e.g. the owner sidebar) that already renders <Outlet />. */
export function markOutletComponent<T extends ComponentType>(component: T): T {
  (component as OutletComponent).rendersChildren = true;
  return component;
}
