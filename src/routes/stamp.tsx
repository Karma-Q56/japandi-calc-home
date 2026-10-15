// PLACEHOLDER - M4: Staff Stamping
// In production, staff would authenticate with PIN, scan/enter member code,
// and add stamps or redeem rewards

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export async function loader() {
  return {};
}

export async function head() {
  return { title: 'Stamp | Patron' };
}

function StampPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">Add Stamp</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-lg">Staff Stamping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              This is a placeholder for the staff stamping page.
            </p>
            <p className="text-gray-600">
              In production, staff would:
            </p>
            <ul className="text-left text-gray-500 list-disc list-inside space-y-1">
              <li>Enter their PIN to authenticate</li>
              <li>Scan a member QR code or enter their phone number</li>
              <li>Add a stamp for a qualifying purchase</li>
              <li>Redeem rewards when requested</li>
            </ul>
            <Button asChild>
              <a href="/app">Go to Dashboard</a>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default StampPage;
