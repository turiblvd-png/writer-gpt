'use client';

export function SignOutButton() {
  return (
    <button
      className="btn-ghost"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.assign('/login');
      }}
    >
      Sign out
    </button>
  );
}
