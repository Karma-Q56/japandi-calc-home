import { createFileRoute } from '@tanstack/react-router';
import { member } from '@/server/fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/me')({
  loader: async ({ context }) => {
    // In production, check authentication
    const result = await member.myCards();
    
    return {
      memberships: result.memberships,
      total: result.total,
    };
  },
  head: () => ({
    title: 'My Cards | Patron',
  }),
  component: MyCardsPage,
});

function MyCardsPage() {
  const { memberships, total } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">My Cards</h1>
            <Button variant="outline" size="sm" asChild>
              <a href="/me/settings">Settings</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {total === 0 ? (
          <Card className="text-center">
            <CardContent className="pt-12 pb-12">
              <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 2h14v3h3v14h-3v3H5v-3H2V5h3V2zm2 3v2H5v10h2v2h10v-2h2V7h-2V5H7zm2 6h2v3h2v-3h2V9h2v5h-2v2h-4v-2H9v-3z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No cards yet</h2>
              <p className="text-gray-600">
                Scan a Patron QR at a restaurant to get your first card.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Your Cards ({total})</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {memberships.map(membership => (
                <Card key={membership.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{membership.restaurant?.name || 'Restaurant'}</CardTitle>
                        <p className="text-sm text-gray-500">{membership.restaurant?.city || 'Unknown'}</p>
                      </div>
                      {membership.rewardsEarned > 0 && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                          {membership.rewardsEarned} reward{membership.rewardsEarned > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-gray-600">Progress</span>
                        <span className="text-sm font-medium">
                          {membership.stampsCurrent}/{membership.restaurant?.stampsRequired || 8}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-300"
                          style={{
                            width: `${(membership.stampsCurrent / (membership.restaurant?.stampsRequired || 8)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>Last visit: {membership.lastVisitAt ? new Date(membership.lastVisitAt).toLocaleDateString() : 'Never'}</span>
                    </div>
                    
                    <div className="mt-4">
                      <Button className="w-full" asChild>
                        <a href={`/r/${membership.restaurant?.slug || ''}/card`}>
                          View Card
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
