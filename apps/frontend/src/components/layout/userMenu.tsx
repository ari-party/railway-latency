import { Box, IconButton, Menu, Portal, Text } from '@chakra-ui/react';
import { LuLogIn, LuLogOut } from 'react-icons/lu';

import { Avatar } from '@/components/ui/avatar';
import { Tooltip } from '@/components/ui/tooltip';
import { trpc } from '@/utils/trpc';

export function UserMenu() {
  const { data: user } = trpc.session.useQuery();

  if (!user) {
    return (
      <Tooltip
        content="Log in with Railway"
        positioning={{ placement: 'right' }}
        openDelay={300}
        closeDelay={100}
      >
        <IconButton
          asChild
          size="md"
          variant="ghost"
          aria-label="Log in with Railway"
          color="fg.muted"
          _hover={{ bg: 'bg.emphasized', color: 'fg' }}
        >
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
              API route redirect needs a full-page navigation, not next/link */}
          <a href="/api/auth/login">
            <LuLogIn size={19} />
          </a>
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Menu.Root positioning={{ placement: 'right-end' }}>
      <Menu.Trigger asChild>
        <IconButton
          size="md"
          variant="ghost"
          aria-label="Account"
          borderRadius="full"
        >
          <Avatar
            size="2xs"
            name={user.name ?? user.email}
            src={user.picture}
          />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            <Box px="3" py="1.5">
              {user.name && (
                <Text textStyle="sm" fontWeight="medium">
                  {user.name}
                </Text>
              )}
              <Text textStyle="xs" color="fg.muted">
                {user.email}
              </Text>
            </Box>
            <Menu.Separator />
            <Menu.Item value="logout" asChild>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                  API route redirect needs a full-page navigation, not next/link */}
              <a href="/api/auth/logout">
                <LuLogOut />
                Log out
              </a>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
