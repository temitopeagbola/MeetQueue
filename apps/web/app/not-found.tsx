import { Logo } from '@/components/logo';
import { ButtonLink } from '@/components/ui';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-slate-600">The page you’re looking for doesn’t exist.</p>
      </div>
      <ButtonLink href="/">Go home</ButtonLink>
    </main>
  );
}
