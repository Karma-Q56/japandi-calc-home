// PLACEHOLDER - M3: Guest Join & Cards
// In production, this would handle opt-out requests via tokenized links

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export async function loader() {
  return {};
}

export async function head() {
  return { title: 'Opt Out | Patron' };
}

function OptOutPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Opt Out</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600 text-center">
            This is a placeholder for the opt-out page.
          </p>
          <p className="text-gray-600 text-center">
            In production, clicking Confirm would withdraw marketing consent.
          </p>
          <Button className="w-full" asChild>
            <a href="/">Back Home</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default OptOutPage;
