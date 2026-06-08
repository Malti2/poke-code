import React, { useState, useEffect } from 'react';
import { render, Text, Box, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { Branding } from './Branding.tsx';
import { QueryEngine } from './QueryEngine.ts';

const App = () => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const engine = new QueryEngine();

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;
    
    const userMsg = { role: 'user' as const, content: value };
    setHistory(prev => [...prev, userMsg]);
    setQuery('');
    setIsProcessing(true);

    try {
      const response = await engine.query(value);
      setHistory(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      setHistory(prev => [...prev, { role: 'assistant', content: 'Error: Failed to process query.' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Branding />
      
      <Box flexDirection="column" marginBottom={1}>
        {history.map((msg, i) => (
          <Box key={i}>
            <Text color={msg.role === 'user' ? 'cyan' : 'green'}>
              {msg.role === 'user' ? '› ' : 'Ϟ '}
            </Text>
            <Text>{msg.content}</Text>
          </Box>
        ))}
      </Box>

      {isProcessing && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" /> Thinking...
          </Text>
        </Box>
      )}

      <Box>
        <Text color="cyan">› </Text>
        <TextInput value={query} onChange={setQuery} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
};

render(<App />);
