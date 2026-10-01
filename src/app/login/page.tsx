import { LoginForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · Writer-GPT' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site paths, so the login page cannot be used as an open redirect.
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <LoginForm next={target} />
    </main>
  );
}
