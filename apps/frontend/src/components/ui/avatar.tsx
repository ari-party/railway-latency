'use client';

import { Avatar as ChakraAvatar, Group } from '@chakra-ui/react';
import React from 'react';

import type { GroupProps, SlotRecipeProps } from '@chakra-ui/react';

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

export interface AvatarProps extends ChakraAvatar.RootProps {
  name?: string;
  src?: string;
  srcSet?: string;
  loading?: ImageProps['loading'];
  icon?: React.ReactElement;
  fallback?: React.ReactNode;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  function Avatar(props, ref) {
    const { children, fallback, icon, loading, name, src, srcSet, ...rest } =
      props;
    return (
      <ChakraAvatar.Root ref={ref} {...rest}>
        <AvatarFallback icon={icon} name={name}>
          {fallback}
        </AvatarFallback>
        <ChakraAvatar.Image loading={loading} src={src} srcSet={srcSet} />
        {children}
      </ChakraAvatar.Root>
    );
  },
);

interface AvatarFallbackProps extends ChakraAvatar.FallbackProps {
  name?: string;
  icon?: React.ReactElement;
}

const AvatarFallback = React.forwardRef<HTMLDivElement, AvatarFallbackProps>(
  function AvatarFallback(props, ref) {
    const { children, icon, name, ...rest } = props;
    return (
      <ChakraAvatar.Fallback ref={ref} {...rest}>
        {children}
        {name != null && children == null && <>{getInitials(name)}</>}
        {name == null && children == null && (
          <ChakraAvatar.Icon asChild={!!icon}>{icon}</ChakraAvatar.Icon>
        )}
      </ChakraAvatar.Fallback>
    );
  },
);

function getInitials(name: string) {
  const names = name.trim().split(' ');
  const firstName = names[0] != null ? names[0] : '';
  const lastName = names.length > 1 ? names[names.length - 1] : '';
  return firstName && lastName
    ? `${firstName.charAt(0)}${lastName.charAt(0)}`
    : firstName.charAt(0);
}

interface AvatarGroupProps extends GroupProps, SlotRecipeProps<'avatar'> {}

export const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  function AvatarGroup(props, ref) {
    const { borderless, size, variant, ...rest } = props;
    return (
      <ChakraAvatar.PropsProvider value={{ size, variant, borderless }}>
        <Group ref={ref} gap="0" spaceX="-3" {...rest} />
      </ChakraAvatar.PropsProvider>
    );
  },
);
