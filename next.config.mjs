/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    return [
      {
        // HTML-документы не кэшируем: Next по умолчанию ставит на статический
        // пререндер `s-maxage=31536000` (год), из-за чего браузер/прокси отдаёт
        // старый HTML со ссылками на старые чанки после новой сборки. no-cache
        // заставляет каждый раз сверять etag и получать свежий бандл.
        // Статические чанки /_next/static не трогаем (у них immutable-кэш).
        source: '/((?!_next/static|_next/image|api|favicon).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
