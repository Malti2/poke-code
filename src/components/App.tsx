import React, { useState, useEffect } from "react";
import { Box, Text, useInput, Newline } from "ink";
import { QueryEngine, Thought } from "../QueryEngine";
import { CompanionBrand } from "./CompanionBrand";

export const App: React.FC = () => {
  const [query, setQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<Thought[]>([]);
  const [engine] = useState(() => new QueryEngine());

  useInput((input, key) => {
    if (isProcessing) return;

    if (key.return) {
      handleSubmit();
    } else if (key.backspace) {
      setQuery((q) => q.slice(0, -1));
    } else {
      setQuery((q) => q + input);
    }
  });

  const handleSubmit = async () => {
    if (!query.trim()) return;
    
    setIsProcessing(true);
    const userQuery = query;
    setQuery("");
    
    // Add user query to history visual
    setHistory(prev => [...prev, { type: "response", content: `> ${userQuery}` }]);

    for await (const thought of engine.processQuery(userQuery)) {
      setHistory(prev => [...prev, thought]);
    }
    
    setIsProcessing(false);
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <CompanionBrand />
      
      <Box flexDirection="column" marginTop={1}>
        {history.map((item, index) => (
          <Box key={index} marginBottom={0}>
            {item.type === "thought" && <Text color="gray">  ◦ {item.content}</Text>}
            {item.type === "action" && <Text color="yellow">  ▶ {item.content}</Text>}
            {item.type === "result" && <Text color="green">  ✓ {item.content}</Text>}
            {item.type === "response" && (
              <Box marginTop={1} marginBottom={1}>
                <Text bold color="white">{item.content}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text color="cyan">🌴 poke-code </Text>
        <Text color="white">{query}</Text>
        {!isProcessing && <Text color="cyan" inverse>_</Text>}
      </Box>
      
      {isProcessing && (
        <Box marginTop={1}>
          <Text italic color="gray">Processing...</Text>
        </Box>
      )}
    </Box>
  );
};
