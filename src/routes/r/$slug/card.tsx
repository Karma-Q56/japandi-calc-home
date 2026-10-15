// PLACEHOLDER - M3: Guest Join & Cards
// In production, this would display a customer's loyalty card
// with stamp progress and QR code for staff scanning

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export async function loader() {
  return {};
}

export async function head() {
  return { title: 'Loyalty Card | Patron' };
}

function CardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">Loyalty Card</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-lg">Your Card</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-gray-600">
              This is a placeholder for the loyalty card page.
            </p>
            <p className="text-gray-600">
              In production, this would display:
            </p>
            <ul className="text-left text-gray-500 list-disc list-inside space-y-1">
              <li>Your stamp progress (e.g., 3/8 stamps)</li>
              <li>A QR code for staff to scan</li>
              <li>Your rewards status</li>
              <li>Links to view menu and restaurant info</li>
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

export default CardPage;
