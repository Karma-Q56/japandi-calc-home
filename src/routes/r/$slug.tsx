import { createFileRoute, redirect } from '@tanstack/react-router';
import { restaurant } from '@/server/fns';

export const Route = createFileRoute('/r/$slug')({
  loader: async ({ params }) => {
    const { slug } = params;
    
    // Get public restaurant info
    const result = await restaurant.getPublic({ slug });
    
    if (result.error || !result.restaurant) {
      throw redirect({ to: '/', status: 404 });
    }
    
    return {
      restaurant: result.restaurant,
      menu: result.menu,
      specials: result.specials,
    };
  },
  head: ({ loaderData }) => ({
    title: `${loaderData.restaurant.name} | Patron`,
    meta: [
      { name: 'description', content: `Digital loyalty card for ${loaderData.restaurant.name}` },
    ],
  }),
  component: RestaurantPage,
});

function RestaurantPage() {
  const { restaurant, menu, specials } = Route.useLoaderData();
  
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{restaurant.name}</h1>
              <p className="text-sm text-gray-500">{restaurant.city}</p>
            </div>
            <div className="flex gap-2">
              <a
                href={`/r/${restaurant.slug}/join?src=qr`}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Join Card
              </a>
            </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 py-8">
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Menu</h2>
          {menu.length === 0 && (
            <p className="text-gray-500">No menu items yet.</p>
          )}
        </section>
        
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Specials</h2>
          {specials.length === 0 && (
            <p className="text-gray-500">No specials at the moment.</p>
          )}
        </section>
        
        <section className="text-center py-8 border-t border-gray-200">
          <p className="text-gray-600">
            Collect {restaurant.stampsRequired} stamps to earn: {restaurant.rewardDescription}
          </p>
          <a
            href={`/r/${restaurant.slug}/join?src=page`}
            className="inline-block mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Join Now
          </a>
        </section>
      </main>
    </div>
  );
}
