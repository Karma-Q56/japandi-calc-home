// PLACEHOLDER - M2: Restaurants & Onboarding
// In production, this would display a restaurant's public page
// with menu, specials, and join button

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export async function loader() {
  return {};
}

export async function head() {
  return { title: 'Restaurant | Patron' };
}

function RestaurantPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-bold text-gray-900">Restaurant Page</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Restaurant Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              This is a placeholder for the restaurant public page.
            </p>
            <p className="text-gray-600">
              In production, this would display:
            </p>
            <ul className="text-gray-500 list-disc list-inside space-y-1">
              <li>Restaurant name and details</li>
              <li>Menu items</li>
              <li>Current specials</li>
              <li>Join loyalty program button</li>
            </ul>
            <Button asChild>
              <a href="/">Back Home</a>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default RestaurantPage;
