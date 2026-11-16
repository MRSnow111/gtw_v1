# GTW Chat Application

Frontend chat application built with Next.js 16.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand (client state), TanStack Query (server state)
- **Real-time**: socket.io-client (WebSocket)
- **UI Components**: shadcn/ui
- **File Upload**: react-dropzone
- **Validation**: Zod

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
```

### Start Production

```bash
npm start
```

## Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── app/                # App pages
│   │   ├── chat/           # Chat routes
│   │   └── layout.tsx      # App layout
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page
├── src/
│   ├── components/         # React components
│   │   ├── chat/           # Chat-specific components
│   │   ├── layout/         # Layout components
│   │   └── ui/             # UI primitives
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Utilities
│   ├── providers/          # Context providers
│   ├── stores/             # Zustand stores
│   └── types/              # TypeScript types
├── next.config.mjs         # Next.js configuration
├── postcss.config.js       # PostCSS configuration
├── tailwind.config.ts      # Tailwind CSS configuration
└── tsconfig.json           # TypeScript configuration
```

## Features

- Real-time messaging via WebSocket
- Chat history loading via HTTP
- File upload support
- Desktop and mobile responsive layout
- Dark / light theme support
- Sidebar with chat list

## Architecture

### State Management

- **Zustand** — client-side state (WebSocket connection, chat list, messages)
- **TanStack Query** — server-side caching and data fetching

### WebSocket

The `useWebSocket` hook manages the socket.io connection with automatic reconnect logic. Connection status is stored in Zustand.

### Styling

Tailwind CSS with CSS variables for theming. System font stack (no external fonts).

## License

MIT
