import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { member } from '@/server/fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/r/$slug/card')({
  loader: async ({ params, context }) => {
    const { slug } = params;
    
    // In production, check if user is authenticated as a customer
    // For now, proceed
    
    // Get card data
    const result = await member.card({ slug });
    
    if (result.error || !result.membership) {
      throw redirect({ to: `/r/${slug}/join?src=card`, status: 302 });
    }
    
    return {
      membership: result.membership,
      stamps: result.stamps,
      rewards: result.rewards,
      restaurant: result.restaurant,
    };
  },
  head: ({ loaderData }) => ({
    title: `${loaderData.restaurant?.name || 'Card'} | Patron`,
  }),
  component: CardPage,
});

function CardPage() {
  const { membership, stamps, rewards, restaurant } = Route.useLoaderData();
  const [showCode, setShowCode] = useState(false);
  const [animatedStamps, setAnimatedStamps] = useState<number>(0);

  // Animate new stamps
  useEffect(() => {
    if (membership) {
      // In production, compare with previous stamps from localStorage
      setAnimatedStamps(membership.stampsCurrent);
    }
  }, [membership]);

  // Generate QR code URL
  const qrCodeUrl = membership?.qrToken 
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`https://${import.meta.env.APP_URL || 'localhost:5173'}/s/${membership.qrToken}`)}`
    : null;

  // Human-readable code (first 8 chars of qrToken)
  const humanCode = membership?.qrToken?.substring(0, 8).toUpperCase() || '';

  if (!membership || !restaurant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Calculate progress
  const progress = (membership.stampsCurrent / restaurant.stampsRequired) * 100;
  const stampsRemaining = restaurant.stampsRequired - membership.stampsCurrent;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{restaurant.name}</h1>
              <p className="text-sm text-gray-500">{restaurant.city}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`/r/${restaurant.slug}`}>Menu</a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="/me">My Cards</a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Your Stamp Card</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            {/* Stamp progress grid */}
            <div className="mb-6">
              <div className="grid grid-cols-4 gap-2 mb-4">
                {Array.from({ length: restaurant.stampsRequired }, (_, i) => {
                  const isFilled = i < membership.stampsCurrent;
                  const isNew = i < animatedStamps && i >= membership.stampsCurrent - (animatedStamps - (membership.stampsCurrent - animatedStamps));
                  
                  return (
                    <div
                      key={i}
                      className={`aspect-square rounded-lg border-2 transition-all duration-300 ${
                        isFilled
                          ? 'bg-blue-600 border-blue-600'
                          : 'bg-white border-gray-300'
                      }`}
                    >
                      {isFilled && (
                        <svg
                          className="w-full h-full p-1 text-white"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M5 2h14v3h3v14h-3v3H5v-3H2V5h3V2zm2 3v2H5v10h2v2h10v-2h2V7h-2V5H7zm2 6h2v3h2v-3h2V9h2v5h-2v2h-4v-2H9v-3z" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
              
              <div className="flex items-center justify-center gap-4">
                <span className="text-2xl font-bold">{membership.stampsCurrent}</span>
                <span className="text-gray-500">/</span>
                <span className="text-2xl font-bold">{restaurant.stampsRequired}</span>
              </div>
              
              {stampsRemaining > 0 ? (
                <p className="text-gray-600 mt-2">
                  {stampsRemaining} more for {restaurant.rewardDescription}
                </p>
              ) : (
                <p className="text-green-600 mt-2 font-medium">
                  Reward earned!
                </p>
              )}
            </div>

            {/* Rewards */}
            {rewards.filter(r => r.status === 'available').length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Your Rewards</h3>
                <div className="space-y-2">
                  {rewards.filter(r => r.status === 'available').map(reward => (
                    <div
                      key={reward.id}
                      className="flex items-center justify-between p-3 bg-blue-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{reward.description}</p>
                        <p className="text-sm text-gray-500">Available</p>
                      </div>
                      <Button size="sm" onClick={() => setShowCode(true)}>
                        Show to Staff
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Member code */}
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-2">Your member code</p>
              {qrCodeUrl && (
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  className="mx-auto mb-4 w-48 h-48"
                />
              )}
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-1">Or show this code</p>
                <p className="text-2xl font-mono font-bold text-gray-900">{humanCode}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setShowCode(!showCode)}>
                {showCode ? 'Hide Code' : 'Show Code to Staff'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Visit history */}
        {stamps.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg">Visit History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stamps.slice(0, 20).map(stamp => (
                  <div
                    key={stamp.id}
                    className="flex items-center justify-between p-2 border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <p className="font-medium">{new Date(stamp.createdAt).toLocaleDateString()}</p>
                      <p className="text-sm text-gray-500">{new Date(stamp.createdAt).toLocaleTimeString()}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      stamp.status === 'valid' 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {stamp.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings link */}
        <Card>
          <CardContent className="pt-6">
            <Button variant="outline" className="w-full" asChild>
              <a href={`/r/${restaurant.slug}/card/settings`}>Card Settings</a>
            </Button>
          </CardContent>
        </Card>
      </main>

      {/* Code display modal */}
      {showCode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-8 max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Show this to staff</h2>
            <div className="mb-6">
              {qrCodeUrl && (
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  className="mx-auto mb-4 w-64 h-64"
                />
              )}
              <p className="text-3xl font-mono font-bold text-gray-900">{humanCode}</p>
              <p className="text-gray-600 mt-2">{membership.customer?.name || 'Member'}</p>
            </div>
            <Button onClick={() => setShowCode(false)} className="w-full">
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
