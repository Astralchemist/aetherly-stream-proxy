export const metadata = {
  title: 'aetherly-stream-proxy example',
  description: 'Demo of HLS / MP4 media proxy with header forwarding',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
