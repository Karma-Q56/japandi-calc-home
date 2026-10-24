import { withChildren } from '@/lib/nested';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import { demoRepo } from '@/data/repo';
import { requireRole } from '@/data/session';
import { APP_NAME } from '@/config/app';
import { formatRand } from '@/lib/money';
import { useDemoState } from '@/data/useDemoState';

const RestaurantsPage = withChildren(RestaurantList);
export const Route = createFileRoute('/ops/restaurants')({ beforeLoad: () => { if (!requireRole('operator')(demoRepo.read().session)) throw redirect({ to: '/login' }); }, component: RestaurantsPage });

function RestaurantList() {
  const state = useDemoState();
  return <main className="demo-hub page-width"><p className="eyebrow"><span className="eyebrow-line"/>Operator workspace</p><h1>Restaurants.</h1><p className="demo-intro">A demo view of each venue’s plan, guests, recent activity and credit balance.</p><a className="builder-primary" href="/ops/restaurants/new">Add a restaurant</a><div className="restaurant-table-wrap"><table className="restaurant-table"><thead><tr><th>Restaurant</th><th>Status</th><th>Plan</th><th>Members</th><th>Last stamp</th><th>SMS credit</th><th>Actions</th></tr></thead><tbody>{state.restaurants.map(restaurant=>{const memberships=state.memberships.filter(item=>item.restaurantId===restaurant.id);const latest=state.stamps.filter(item=>item.restaurantId===restaurant.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];return <tr key={restaurant.id}><td><a href={`/ops/restaurants/${restaurant.id}`}><strong>{restaurant.name}</strong><small>/{restaurant.slug}</small></a></td><td data-label="Status"><span className={`status-pill ${restaurant.status}`} data-s={restaurant.status}>{restaurant.status}</span></td><td data-label="Plan">{restaurant.plan}</td><td data-label="Members">{memberships.length}</td><td data-label="Last stamp">{latest?new Intl.DateTimeFormat('en-ZA',{dateStyle:'medium'}).format(new Date(latest.createdAt)):'not set'}</td><td data-label="SMS credit">{formatRand(restaurant.creditCents)}</td><td data-label="Actions"><span className="row-actions"><a className="row-action is-primary" href={`/ops/restaurants/${restaurant.id}/look`}>Look & feel</a><a className="row-action" href={`/r/${restaurant.slug}`}>View page</a><a className="row-action" href={`/ops/restaurants/${restaurant.id}/qr`}>QR</a></span></td></tr>;})}</tbody></table></div><p className="demo-data-note">All records are Demo data. This operator preview belongs to {APP_NAME}.</p></main>;
}
