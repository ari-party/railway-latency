import { Html, Head, Main, NextScript } from 'next/document';
import React from 'react';

export default function Document() {
  return (
    <Html data-scroll-behavior="smooth" lang="en">
      <Head>
        <style>{`html{color-scheme:dark;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}`}</style>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
