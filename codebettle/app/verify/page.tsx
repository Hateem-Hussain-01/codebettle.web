'use client';
import { useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import FadeIn from '@/components/ui/FadeIn';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { Award } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Certificate lookup form (Phase 7). Type or paste a verification
 * token (printed on the certificate) and go to its /verify/<token> page.
 */
export default function VerifyLookupPage() {
  const [token, setToken] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = token.trim();
    if (!value) { toast.error('Enter a verification token'); return; }
    window.location.href = `/verify/${encodeURIComponent(value)}`;
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-16">
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-16">
          <FadeIn className="text-center mb-8">
            <Award className="w-12 h-12 text-primary-text mx-auto mb-3" />
            <h1 className="text-3xl font-black text-foreground">Verify Certificate</h1>
            <p className="text-muted mt-2 text-sm">Enter the verification token printed on a CodeBettle certificate.</p>
          </FadeIn>
          <FadeIn delay={0.08}>
          <Card>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Verification token"
                placeholder="Paste the token from the certificate"
                value={token}
                onChange={e => setToken(e.target.value)}
                required
              />
              <Button fullWidth type="submit">Verify certificate</Button>
            </form>
          </Card>
          </FadeIn>
        </div>
      </main>
      <Footer />
    </>
  );
}
