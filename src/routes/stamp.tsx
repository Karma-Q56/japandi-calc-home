import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { stamp } from '@/server/fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/stamp')({
  loader: async ({ context }) => {
    // In production, check staff authentication and till pairing
    return { authenticated: false };
  },
  head: () => ({
    title: 'Stamp | Patron',
    meta: [
      { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
    ],
  }),
  component: StampPage,
});

function StampPage() {
  const { authenticated } = Route.useLoaderData();
  const [code, setCode] = useState('');
  const [member, setMember] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Check for camera access
  useEffect(() => {
    // Check if BarcodeDetector is available
    if ('BarcodeDetector' in window) {
      setHasCamera(true);
    }
    
    // Focus input on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setShowCamera(true);
        
        // Start scanning
        scanBarcode();
      }
    } catch (err) {
      console.error('Failed to start camera:', err);
      setError('Could not access camera');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setShowCamera(false);
    }
  };

  // Scan barcode from camera
  const scanBarcode = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    try {
      const detector = new (window as any).BarcodeDetector();
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // This is a simplified approach - in production, use proper barcode scanning
      // For now, we'll just show the camera feed
    } catch (err) {
      console.error('Barcode scanning error:', err);
    }
    
    // In production, continuously scan and detect barcodes
    // For now, just show the camera
  };

  // Lookup member by code
  const handleLookup = async () => {
    if (!code.trim()) return;
    
    setError(null);
    setIsLoading(true);
    setMember(null);
    setSuccess(null);
    
    try {
      const result = await stamp.lookup({ codeOrToken: code });
      
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

  // Add stamp
  const handleAddStamp = async () => {
    if (!member) return;
    
    setError(null);
    setIsLoading(true);
    setSuccess(null);
    
    try {
      const result = await stamp.add({
        membershipId: member.membershipId,
        idempotencyKey: crypto.randomUUID(),
      });
      
      if (result.error) {
        setError(result.error);
      } else if (result.result === 'stamped') {
        setSuccess(`Stamp added · ${result.stamps} of ${member.stampsRequired}`);
        if (result.rewardId) {
          setSuccess(prev => prev ? `${prev} · Reward earned!` : 'Reward earned!');
        }
        // Refresh member data
        setMember(null);
        setCode('');
      } else if (result.result === 'too_soon') {
        setError('Stamped too soon. Please wait before stamping again.');
      } else if (result.result === 'duplicate_retry') {
        setSuccess('Stamp already recorded');
      } else {
        setError('Failed to add stamp');
      }
    } catch (err) {
      setError('Failed to add stamp');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLookup();
    }
  };

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="text-center">
          <CardContent className="pt-12 pb-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Not authenticated</h2>
            <p className="text-gray-600">Please sign in as staff to use this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-lg font-bold text-gray-900">Stamp</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!member ? (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg">Scan or enter member code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Camera button */}
              {hasCamera && (
                <Button
                  onClick={showCamera ? stopCamera : startCamera}
                  className="w-full"
                  variant={showCamera ? 'outline' : 'default'}
                >
                  {showCamera ? 'Stop Camera' : 'Use Camera'}
                </Button>
              )}

              {/* Camera feed */}
              {showCamera && (
                <div className="relative">
                  <video
                    ref={videoRef}
                    className="w-full rounded-lg"
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}

              {/* Manual entry */}
              <div className="space-y-2">
                <Label htmlFor="code">Member code</Label>
                <div className="flex gap-2">
                  <Input
                    id="code"
                    ref={inputRef}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    onKeyPress={handleKeyPress}
                    placeholder="Enter 8-character code"
                    className="flex-1"
                    maxLength={8}
                    autoComplete="off"
                    autoCapitalize="characters"
                  />
                  <Button onClick={handleLookup} disabled={isLoading || !code.trim()}>
                    {isLoading ? 'Looking...' : 'Lookup'}
                  </Button>
                </div>
              </div>

              {error && (
                <p className="text-red-500 text-sm text-center">{error}</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-lg">Member Found</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">{member.name}</h2>
                  <p className="text-gray-600">
                    {member.stampsCurrent} of {member.stampsRequired} stamps
                  </p>
                  {member.rewardsWaiting > 0 && (
                    <p className="text-blue-600 font-medium mt-2">
                      {member.rewardsWaiting} reward{member.rewardsWaiting > 1 ? 's' : ''} waiting
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={handleAddStamp}
                    className="w-full text-lg py-4"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Adding...' : 'Add Stamp'}
                  </Button>
                  
                  {member.rewardsWaiting > 0 && (
                    <Button variant="outline" className="w-full" disabled={true}>
                      Redeem Reward (coming soon)
                    </Button>
                  )}
                  
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setMember(null);
                      setCode('');
                    }}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>

                {error && (
                  <p className="text-red-500 text-sm text-center mt-3">{error}</p>
                )}
                {success && (
                  <p className="text-green-600 text-sm text-center mt-3">{success}</p>
                )}
              </CardContent>
            </Card>

            {/* Recent stamps */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500 text-center">No recent activity</p>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {/* Keyboard for mobile */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 lg:hidden">
        <div className="grid grid-cols-3 gap-2">
          {[...'1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')].map(key => (
            <Button
              key={key}
              variant="outline"
              onClick={() => {
                setCode(prev => (prev + key).slice(0, 8));
                if (inputRef.current) {
                  inputRef.current.focus();
                }
              }}
              className="h-12 text-lg"
            >
              {key}
            </Button>
          ))}
          <Button
            variant="outline"
            onClick={() => setCode(prev => prev.slice(0, -1))}
            className="h-12 text-lg"
          >
            ←
          </Button>
        </div>
      </div>
    </div>
  );
}

// Dummy Label component (imported from shadcn/ui)
function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {children}
    </label>
  );
}
