import { IconButton, Menu, Portal } from '@chakra-ui/react';
import { MoreHorizontal } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

export interface MenuAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface ActionsMenuProps {
  actions: MenuAction[];
  label: string;
}

export function ActionsMenu({ actions, label }: ActionsMenuProps) {
  function handleSelect(details: { value: string }) {
    actions.find((action) => action.label === details.value)?.onSelect();
  }

  return (
    <Menu.Root onSelect={handleSelect}>
      <Menu.Trigger asChild>
        <IconButton
          size="xs"
          variant="ghost"
          colorPalette="gray"
          aria-label={label}
        >
          <MoreHorizontal />
        </IconButton>
      </Menu.Trigger>

      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Menu.Item
                  key={action.label}
                  value={action.label}
                  disabled={action.disabled}
                  color={action.destructive ? 'fg.error' : undefined}
                  _hover={
                    action.destructive
                      ? { bg: 'bg.error', color: 'fg.error' }
                      : undefined
                  }
                >
                  <Icon size={16} />
                  {action.label}
                </Menu.Item>
              );
            })}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
