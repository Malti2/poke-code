import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

export function Header({ cwd }: { cwd: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={theme.brand} bold>
          ✦ poke-code
        </Text>
        <Text color={theme.dim}> via Poke</Text>
      </Box>
      <Text color={theme.faint}>{cwd}</Text>
    </Box>
  );
}

export function StatusBar({
  connected,
  permissionMode,
}: {
  connected: boolean;
  permissionMode: string;
}) {
  return (
    <Box marginTop={1}>
      <Text color={connected ? theme.success : theme.error}>{connected ? "●" : "○"}</Text>
      <Text color={theme.dim}> poke {connected ? "connected" : "disconnected"}</Text>
      <Text color={theme.faint}> · </Text>
      <Text color={theme.dim}>{permissionMode} mode</Text>
      <Text color={theme.faint}> · </Text>
      <Text color={theme.faint}>Ctrl+C exit · Esc abort</Text>
    </Box>
  );
}
