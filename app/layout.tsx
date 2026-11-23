// Koreňový layout pre budúce stránky v app/ (napr. /ucet). Statický web v public/granula/ ho nepoužíva.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sk">
      <body>{children}</body>
    </html>
  );
}
