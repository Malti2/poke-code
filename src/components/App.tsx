import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { CompanionBrand } from './components/CompanionBrand';
import { QueryEngine } from './QueryEngine';

export const App = () => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const engine = new QueryEngine();

  useInput((inputStr, key) => {
    if (key.return) {
      const response = engine.process(input);
      setHistory([...history, `You: ${input}`, `Poke: ${response}`]);
      setInput('');
    } else if (key.backspace) {
      setInput(input.slice(0, -1));
    } else {
      setInput(input + inputStr);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <CompanionBrand />
      <Box flexDirection="column" marginTop={1}>
        {history.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">➤ </Text>
        <Text>{input}</Text>
      </Box>
    </Box>
  );
};
