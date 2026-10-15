// PLACEHOLDER - M3: Guest Join & Cards
// In production, this would display all of a customer's loyalty cards

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export async function loader() {
  return {};
}

export async function head() {
  return { title: 'My Cards | Patron' };
}

function MyCardsPage() {
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
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-lg">My Loyalty Cards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              This is a placeholder for the My Cards page.
            </p>
            <p className="text-gray-600">
              In production, this would display all your loyalty cards
              from restaurants you've joined.
            </p>
            <Button asChild>
              <a href="/">Back Home</a>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default MyCardsPage;
