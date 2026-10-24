export interface PageView {
  restaurantId?: string | undefined;
  path: string;
  createdAt: string;
}

const views: PageView[] = [];

/** Privacy-safe, in-memory page views for the owner dashboard. */
export function trackPageView(path: string, restaurantId?: string) {
  views.push({
    path,
    restaurantId,
    createdAt: new Date().toISOString(),
  });
  if (views.length > 500) views.splice(0, views.length - 500);
}

export function joinConversion(visits: number, joins: number): number | null {
  if (visits <= 0) return null;
  return Math.round((joins / visits) * 1000) / 10;
}

export function getPageViews(restaurantId?: string): PageView[] {
  return restaurantId ? views.filter((view) => view.restaurantId === restaurantId) : [...views];
}
