import type { ComponentType } from 'react';
import { Outlet, useChildMatches } from '@tanstack/react-router';

/**
 * File routes such as `r.$slug.join.tsx` are children of `r.$slug.tsx`. A parent that is
 * itself a full page must hand over to its child when one matches, otherwise the child
 * URL silently renders the parent page.
 */
export function withChildren(Page: ComponentType): () => React.JSX.Element {
  return function RouteWithChildren() {
    const children = useChildMatches();
    return children.length > 0 ? <Outlet /> : <Page />;
  };
}
