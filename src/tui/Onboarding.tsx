import React, { useState } from "react";
import { Box, Text, render, useInput } from "ink";
import { setConfigValue } from "../config";

/**
 * Validate a pasted API key. Returns an error message, or null when the key
 * looks usable. Exported for tests.
 */
export function validateApiKey(raw: string): string | null {
  const key = raw.trim();
  if (!key) return "Please paste your API key.";
  if (key.startsWith("pk_")) {
    return "That looks like a V1 key (pk_…). poke-code needs a V2 Kitchen key.";
  }
  if (key.length < 16) return "That key looks too short. Please check and paste again.";
  return null;
}

function MaskedPrompt({ onDone }: { onDone: (key: string | null) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      onDone(null);
      return;
    }
    if (key.return) {
      const problem = validateApiKey(value);
      if (problem) {
        setError(problem);
        return;
      }
      onDone(value.trim());
      return;
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      setError(null);
      return;
    }
    if (key.ctrl && input === "u") {
      setValue("");
      setError(null);
      return;
    }
    // Ignore arrows and other control sequences.
    if (key.ctrl || key.meta || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      return;
    }
    setValue((v) => v + input);
    if (error) setError(null);
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color="cyan">
        Welcome to poke-code ✦
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>To get started, paste your Poke V2 API key below.</Text>
        <Text dimColor>Get one at https://poke.com/kitchen/api-keys (Kitchen → API keys)</Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          <Text color="green" bold>› </Text>
          <Text>{value.length === 0 ? <Text dimColor>paste key…</Text> : "•".repeat(value.length)}</Text>
          <Text color="green">▌</Text>
        </Text>
      </Box>
      {error ? (
        <Box marginTop={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>Enter to confirm · Esc to cancel · input is hidden</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Run the first-start onboarding: ask for the API key, validate, save.
 * Returns true when a key was saved, false when the user cancelled.
 * Only call this on an interactive TTY.
 */
export async function runOnboarding(): Promise<boolean> {
  let finish!: (key: string | null) => void;
  const done = new Promise<string | null>((resolve) => {
    finish = resolve;
  });

  const { unmount, waitUntilExit } = render(<MaskedPrompt onDone={finish} />);
  const key = await done;
  unmount();
  await waitUntilExit();

  if (key === null) return false;
  try {
    setConfigValue("apiKey", key);
  } catch {
    return false;
  }
  return true;
}
