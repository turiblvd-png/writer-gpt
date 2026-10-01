import { AuthForm } from '../login/form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Create account · Writer-GPT' };

export default function SignupPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <AuthForm mode="signup" next="/" />
    </main>
  );
}
