// PLACEHOLDER - M4: Staff Stamping
// In production, this would display member info after scanning QR code
// Staff can then add a stamp or redeem a reward

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export async function loader() {
  return {};
}

export async function head() {
  return { title: 'Scan Result | Patron' };
}

function ScanResultPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="text-center max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">Scan Result</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            Scan a Patron QR code or enter a member code to view their card.
          </p>
          <Button asChild>
            <a href="/stamp">Go to Stamp Page</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default ScanResultPage;
