import React from 'react';
import { Text, Box } from 'ink';
import chalk from 'chalk';

export const Branding = () => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="yellow">
        {`
  ____       _              ____           _      
 |  _ \\ ___ | | _____      / ___|___   __| | ___ 
 | |_) / _ \\| |/ / _ \\    | |   / _ \\ / _' |/ _ \\
 |  __/ (_) |   <  __/    | |__| (_) | (_| |  __/
 |_|   \\___/|_|\\_\\___|     \\____\\___/ \\__,_|\\___|
        `}
      </Text>
      <Text italic color="gray">The electric terminal companion by Interaction Company</Text>
      <Box marginTop={1}>
        <Text>System: </Text>
        <Text color="green" bold>Online</Text>
      </Box>
    </Box>
  );
};
