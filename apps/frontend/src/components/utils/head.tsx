import NextHead from 'next/head';
import React from 'react';

import { useCurrentTab } from '@/hooks/useCurrentTab';
import { usePlaceInitials } from '@/hooks/usePlaceInitials';
import { formatTitle } from '@/utils/formatTitle';

import type { usePlace } from '@/hooks/usePlace';
import type { PropsWithChildren } from 'react';

export const getKeywords = (
  place: NonNullable<ReturnType<typeof usePlace>>,
) => [
  place.placeName,
  place.initials.toUpperCase(),
  'Statistics',
  'Stats',
  'Data',
];

export default function Head({ children }: PropsWithChildren) {
  const initials = usePlaceInitials();
  const currentTab = useCurrentTab();

  return (
    <NextHead>
      <title>{formatTitle(currentTab?.label, initials)}</title>
      <link href="/favicon.ico" rel="icon" type="image/x-icon" />

      <meta content="website" property="og:type" />
      <meta content="index,follow" name="robots" />
      <meta content={formatTitle(null, initials)} property="og:site_name" />

      {children}
    </NextHead>
  );
}
