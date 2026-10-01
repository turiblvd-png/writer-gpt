import type { Metadata } from 'next';
import './globals.css';
import { getViewer } from '@/lib/auth/viewer';
import { ViewerProvider } from '@/components/viewer';
import { BlockedScreen } from '@/components/blocked';

export const metadata: Metadata = {
  title: 'Writer-GPT, AI SEO Content Engine',
  description: 'Research-grounded AI article generation with semantic SEO optimisation.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const value = {
    sections: viewer.sections,
    isAdmin: viewer.isAdmin,
    user: viewer.user ? { name: viewer.user.name, email: viewer.user.email, role: viewer.user.role } : null,
  };

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          // Runs before paint so a light-theme user never sees a dark flash.
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('wg-theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {viewer.blocked ? <BlockedScreen reason={viewer.blocked} /> : <ViewerProvider value={value}>{children}</ViewerProvider>}
      </body>
    </html>
  );
}
