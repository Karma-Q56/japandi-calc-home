import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/u/$token')({
  loader: async ({ params }) => {
    const { token } = params;
    
    // In production, verify the token signature
    // For now, just pass the token through
    
    return { token };
  },
  head: () => ({
    title: 'Opt Out | Patron',
  }),
  component: OptOutPage,
});

function OptOutPage() {
  const { token } = Route.useLoaderData();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleOptOut = async () => {
    setError(null);
    setIsLoading(true);
    
    try {
      // In production, call the optout server function
      // For now, simulate success
      
      // Verify token is valid
      if (!token || token.length < 10) {
        setError('Invalid opt-out link');
        return;
      }
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSuccess(true);
    } catch (err) {
      setError('Failed to process opt-out request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="text-center max-w-md">
          <CardContent className="pt-12 pb-12">
            <div className="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Opt-out confirmed</h2>
            <p className="text-gray-600">
              You will no longer receive marketing messages from this restaurant.
            </p>
            <p className="text-sm text-gray-500 mt-4">
              Your loyalty card will continue to work normally.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Opt out of messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600 text-center">
            You are about to opt out of receiving marketing SMS messages from this restaurant.
          </p>
          <p className="text-gray-600 text-center">
            Your loyalty card will continue to work normally.
          </p>
          
          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}
          
          <div className="space-y-3">
            <Button
              onClick={handleOptOut}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : 'Confirm Opt-Out'}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              asChild
            >
              <a href="/">Cancel</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
