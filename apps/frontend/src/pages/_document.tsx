import { GeistMono } from 'geist/font/mono';
import { Html, Head, Main, NextScript } from 'next/document';
import React from 'react';

export default function Document() {
  return (
    <Html
      className={GeistMono.className}
      data-scroll-behavior="smooth"
      lang="en"
    >
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
