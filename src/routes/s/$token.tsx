import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { stamp } from '@/server/fns';

export const Route = createFileRoute('/s/$token')({
  loader: async ({ params, context }) => {
    const { token } = params;
    
    // In production, check if user is authenticated as staff
    // For now, just pass the token
    
    return { token };
  },
  head: () => ({
    title: 'Scan Result | Patron',
  }),
  component: ScanResultPage,
});

function ScanResultPage() {
  const { token } = Route.useLoaderData();
  const [member, setMember] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Lookup member on mount
  useState(() => {
    const lookup = async () => {
      try {
        const result = await stamp.lookup({ codeOrToken: token });
        
        if (result.error) {
          setError(result.error);
        } else if (result.member) {
          setMember(result.member);
        } else {
          setError('Member not found');
        }
      } catch (err) {
        setError('Failed to lookup member');
      } finally {
        setIsLoading(false);
      }
    };
    
    lookup();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="text-center">
          <CardContent className="pt-12 pb-12">
            <p className="text-gray-600">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="text-center">
          <CardContent className="pt-12 pb-12">
            <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Member not found</h2>
            <p className="text-gray-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="text-center">
          <CardContent className="pt-12 pb-12">
            <p className="text-gray-600">No member found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">Scan Result</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Member Found</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{member.name}</h2>
            <p className="text-gray-600">
              {member.stampsCurrent} of {member.stampsRequired} stamps
            </p>
            {member.rewardsWaiting > 0 && (
              <p className="text-blue-600 font-medium mt-2">
                {member.rewardsWaiting} reward{member.rewardsWaiting > 1 ? 's' : ''} waiting
              </p>
            )}

            <div className="mt-6 space-y-3">
              <Button className="w-full text-lg py-4" asChild>
                <a href={`/stamp?code=${token}`}>Add Stamp</a>
              </Button>
              
              {member.rewardsWaiting > 0 && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={`/stamp/redeem?membershipId=${member.membershipId}`}>Redeem Reward</a>
                </Button>
              )}
              
              <Button variant="ghost" className="w-full" asChild>
                <a href="/stamp">Back to Stamp</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
