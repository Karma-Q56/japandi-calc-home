// PLACEHOLDER - M3: Guest Join & Cards
// In production, this would be the join flow for customers
// to sign up for a restaurant's loyalty program

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export async function loader() {
  return {};
}

export async function head() {
  return { title: 'Join | Patron' };
}

function JoinPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Join Loyalty Program</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600 text-center">
            This is a placeholder for the join flow.
          </p>
          <p className="text-gray-600 text-center">
            In production, customers would:
          </p>
          <ul className="text-left text-gray-500 list-disc list-inside space-y-1">
            <li>Enter their name and phone number</li>
            <li>Receive an OTP via SMS</li>
            <li>Enter the OTP to verify</li>
            <li>Agree to consent terms</li>
            <li>Receive their digital loyalty card</li>
          </ul>
          <Button className="w-full" asChild>
            <a href="/">Back Home</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default JoinPage;
