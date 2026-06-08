import React from 'react';
import { render, Box, Text } from 'ink';
import { Command } from 'commander';
import { App } from './components/App';

const program = new Command();

program
  .name('poke-code')
  .description('A powerful Poke-themed CLI companion')
  .version('0.1.0')
  .action(() => {
    render(<App />);
  });

program.parse(process.argv);
