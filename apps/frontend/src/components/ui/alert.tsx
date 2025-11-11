import { Alert as ChakraAlert } from '@chakra-ui/react';
import React from 'react';

import { CloseButton } from './close-button';

export interface AlertProps extends Omit<ChakraAlert.RootProps, 'title'> {
  startElement?: React.ReactNode;
  endElement?: React.ReactNode;
  title?: React.ReactNode;
  icon?: React.ReactElement;
  closable?: boolean;
  onClose?: () => void;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  function Alert(props, ref) {
    const {
      children,
      closable,
      endElement,
      icon,
      onClose,
      startElement,
      title,
      ...rest
    } = props;
    return (
      <ChakraAlert.Root ref={ref} {...rest}>
        {startElement || <ChakraAlert.Indicator>{icon}</ChakraAlert.Indicator>}
        {children ? (
          <ChakraAlert.Content>
            <ChakraAlert.Title>{title}</ChakraAlert.Title>
            <ChakraAlert.Description>{children}</ChakraAlert.Description>
          </ChakraAlert.Content>
        ) : (
          <ChakraAlert.Title flex="1">{title}</ChakraAlert.Title>
        )}
        {endElement}
        {closable && (
          <CloseButton
            alignSelf="flex-start"
            insetEnd="-2"
            pos="relative"
            size="sm"
            top="-2"
            onClick={onClose}
          />
        )}
      </ChakraAlert.Root>
    );
  },
);
