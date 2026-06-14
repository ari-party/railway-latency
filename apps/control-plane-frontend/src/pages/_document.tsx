import { Head, Html, Main, NextScript } from 'next/document';

import { plexMono, plexSans } from '@/fonts';

export default function Document() {
  return (
    <Html
      lang="en"
      className={`dark ${plexSans.variable} ${plexMono.variable}`}
    >
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
