import React from 'react';
import { Box, Text } from 'ink';

export const CompanionBrand = () => {
  return (
    <Box borderStyle="round" borderColor="yellow" paddingX={2}>
      <Text bold color="yellow">
        POKE CODE
      </Text>
      <Text color="gray"> | </Text>
      <Text italic color="magenta">
        Your Personal Development Companion
      </Text>
    </Box>
  );
};
