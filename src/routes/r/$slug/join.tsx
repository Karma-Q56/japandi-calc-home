import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { member } from '@/server/fns';
import { getConsentWording, CURRENT_CONSENT_VERSIONS } from '@/config/consent';
import { normalizePhone } from '@/lib/phone';

// Form validation schema
const joinSchema = z.object({
  name: z.string().min(1, 'Please enter your name').max(80),
  phone: z.string().min(1, 'Please enter your phone number'),
  marketingSms: z.boolean().default(false),
});

type JoinFormData = z.infer<typeof joinSchema>;

export const Route = createFileRoute('/r/$slug/join')({
  loader: async ({ params, search }) => {
    const { slug } = params;
    const src = search.src || 'direct';
    
    // Get restaurant info
    const result = await import('@/server/fns/restaurant').then(m => m.restaurant.getPublic({ slug }));
    
    if (result.error || !result.restaurant) {
      throw redirect({ to: '/', status: 404 });
    }
    
    return {
      restaurant: result.restaurant,
      src,
    };
  },
  head: ({ loaderData }) => ({
    title: `Join ${loaderData.restaurant.name} | Patron`,
  }),
  component: JoinPage,
});

function JoinPage() {
  const { restaurant, src } = Route.useLoaderData();
  const [step, setStep] = useState<'phone' | 'consent' | 'otp' | 'done'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<JoinFormData>({
    resolver: zodResolver(joinSchema),
    defaultValues: {
      name: '',
      phone: '',
      marketingSms: false,
    },
  });

  const name = watch('name');
  const phone = watch('phone');
  const marketingSms = watch('marketingSms');

  // Get consent wording
  const loyaltyWording = getConsentWording('loyalty', restaurant.name);
  const marketingWording = getConsentWording('marketing_sms', restaurant.name);

  const handlePhoneSubmit = handleSubmit(async (data) => {
    setError(null);
    setIsLoading(true);
    
    try {
      // Normalize phone
      const normalized = normalizePhone(data.phone);
      if (!normalized) {
        setError('Please enter a valid phone number');
        setIsLoading(false);
        return;
      }
      
      // In production, check if already a member
      // For now, proceed to consent
      setStep('consent');
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  });

  const handleConsentSubmit = handleSubmit(async (data) => {
    setError(null);
    setIsLoading(true);
    
    try {
      // In production, send OTP
      // For now, simulate OTP send
      setOtpSent(true);
      setStep('otp');
    } catch (err) {
      setError('Failed to send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  });

  const handleOtpSubmit = async () => {
    setError(null);
    setIsLoading(true);
    
    try {
      // In production, verify OTP
      // For now, accept any 6-digit code in development
      if (otpCode.length === 6) {
        // Join the restaurant
        const result = await member.join({
          restaurantId: restaurant.id,
          name: data.name,
          phone: data.phone,
          consents: {
            loyalty: true,
            marketing_sms: data.marketingSms,
          },
          src,
        });
        
        if (result.success) {
          setStep('done');
        } else {
          setError(result.error || 'Failed to join. Please try again.');
        }
      } else {
        setError('Please enter a 6-digit code');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);
    setIsLoading(true);
    
    try {
      // In production, resend OTP
      setOtpSent(true);
    } catch (err) {
      setError('Failed to resend code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Phone step
  if (step === 'phone') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
              <p className="text-gray-600 mt-2">
                Collect stamps, get {restaurant.rewardDescription}
              </p>
            </div>
            
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Your first name
                </Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="John"
                  className="w-full"
                  autoComplete="given-name"
                  autoFocus
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone number
                </Label>
                <Input
                  id="phone"
                  {...register('phone')}
                  placeholder="082 123 4567"
                  className="w-full"
                  autoComplete="tel"
                  inputMode="tel"
                />
                {errors.phone && (
                  <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>
                )}
              </div>
              
              {error && (
                <p className="text-red-500 text-sm text-center">{error}</p>
              )}
              
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : 'Continue'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Consent step
  if (step === 'consent') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
              <p className="text-gray-600 mt-2">Confirm your details</p>
            </div>
            
            <form onSubmit={handleConsentSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="loyalty"
                    checked={true}
                    disabled
                    className="mt-1"
                  />
                  <div>
                    <Label htmlFor="loyalty" className="text-sm font-medium text-gray-700">
                      {loyaltyWording.text}
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">Required to join</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="marketingSms"
                    {...register('marketingSms')}
                    className="mt-1"
                  />
                  <div>
                    <Label htmlFor="marketingSms" className="text-sm font-medium text-gray-700">
                      {marketingWording.text}
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">Optional</p>
                  </div>
                </div>
              </div>
              
              {error && (
                <p className="text-red-500 text-sm text-center">{error}</p>
              )}
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('phone')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading...' : 'Continue'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // OTP step
  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
              <p className="text-gray-600 mt-2">Enter verification code</p>
              <p className="text-sm text-gray-500 mt-1">
                We sent a 6-digit code to {phone}
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">
                  Verification code
                </Label>
                <Input
                  id="otp"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="000000"
                  className="w-full text-center text-xl tracking-widest"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              
              {otpSent && (
                <p className="text-sm text-green-600 text-center">Code sent!</p>
              )}
              
              {error && (
                <p className="text-red-500 text-sm text-center">{error}</p>
              )}
              
              <Button
                onClick={handleOtpSubmit}
                className="w-full"
                disabled={isLoading || otpCode.length !== 6}
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </Button>
              
              <div className="text-center">
                <button
                  onClick={handleResendOtp}
                  className="text-sm text-blue-600 hover:underline"
                  disabled={isLoading}
                >
                  Didn't receive a code? Resend
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Done step
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to {restaurant.name}!</h1>
          <p className="text-gray-600 mb-6">
            You're now a member. Collect {restaurant.stampsRequired} stamps to earn: {restaurant.rewardDescription}
          </p>
          
          <div className="space-y-3">
            <a
              href={`/r/${restaurant.slug}/card`}
              className="block w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              View My Card
            </a>
            <Button
              variant="outline"
              className="w-full"
              asChild
            >
              <a href={`/r/${restaurant.slug}`}>Back to {restaurant.name}</a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
